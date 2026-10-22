/**
 * useSpaceItems.js - Hook for items within a single space; with
 * `spaceId === null`, the dashboard's items, which belong to no space; with
 * `STARRED_ITEMS`, the starred items from every space (the Starred view); or
 * with `REMINDER_ITEMS`, the items with a reminder (the Reminders view).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EMPTY_RICH_DOC } from '../lib/richText/doc'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import { encryptItem, decryptItem, decryptItems, encryptTags, encryptReminder } from '../lib/dataProtection'
import { normalizeReminder } from '../lib/reminder'
import { defaultKanban } from '../lib/kanban'
import { parseTags } from '../lib/spaceColors'
import { assertOnline } from '../lib/offlineQueue'
import { saveRows, loadRows } from '../lib/offlineCache'
import { setReachable, isNetworkError } from '../lib/connectivity'
import { invalidateItemViews, invalidateSpaceItems } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import {
  makeSoftDelete,
  makeBulkSoftDelete,
  makeBulkSetPinned,
  makeTogglePin,
  makeToggleStar,
  makeToggleFlag,
  makeReorder,
} from './entityMutations'

const defaultContent = {
  textbox: { text: '' },
  checkbox_list: {
    items: [{ id: crypto.randomUUID(), text: '', checked: false }],
  },
  menu_list: { items: [] },
  numbered_list: { items: [] },
  card_list: { items: [] },
  richtext: { doc: EMPTY_RICH_DOC },
  code: { code: '' },
  whiteboard: { elements: [] },
  table: { columns: ['', ''], rows: [['', ''], ['', '']] },
}
// Fresh ids for every new Kanban's columns.
const newContent = (type) => (type === 'kanban' ? defaultKanban() : defaultContent[type])

// Query/cache key for the dashboard's items (those with no space).
const DASHBOARD_ITEMS_KEY = 'dashboard'
// Pass as the `spaceId` for the starred items of every space. Also its key.
export const STARRED_ITEMS = 'starred'
// Pass as the `spaceId` for the items with a reminder. Also its key.
export const REMINDER_ITEMS = 'reminders'

/** Starred and Reminders gather items from every space. */
const isCrossSpace = (spaceId) => spaceId === STARRED_ITEMS || spaceId === REMINDER_ITEMS

/**
 * Restrict an items query to one space, to the dashboard for `null`, to the
 * starred items for `STARRED_ITEMS`, or to those with a reminder for
 * `REMINDER_ITEMS`.
 */
function whereSpace(q, spaceId) {
  if (spaceId === STARRED_ITEMS) return q.eq('starred', true)
  if (spaceId === REMINDER_ITEMS) return q.not('reminder', 'is', null)
  return spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null)
}

export function useSpaceItems(spaceId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { cryptoKey } = useEncryption()
  const userId = user?.id
  const itemsKey = spaceId ?? DASHBOARD_ITEMS_KEY
  const cacheKey = `items:${itemsKey}`

  const query = useQuery({
    queryKey: queryKeys.items(itemsKey),
    enabled: spaceId !== undefined && !!cryptoKey,
    // 'always' so the queryFn still runs while offline and can fall back to the
    // encrypted cache (the default 'online' mode would pause it with no data).
    networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await whereSpace(
          supabase.from('space_items').select('*'),
          spaceId
        )
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('pinned', { ascending: false })
          .order('position', { ascending: true })
          // Items can share a position (one added after a delete), so ties
          // break the same way here and on mobile.
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        if (error) throw error
        const rows = data || []
        setReachable(true)
        saveRows(userId, cacheKey, rows) // cache ciphertext for offline reads
        return decryptItems(rows, cryptoKey)
      } catch (err) {
        // Fall back to the encrypted cache on any network failure (navigator
        // .onLine can wrongly report "online"), not just when the interface is
        // reported down.
        if (isNetworkError(err)) {
          setReachable(false)
          const cached = await loadRows(userId, cacheKey)
          if (cached) return decryptItems(cached, cryptoKey)
        }
        throw err
      }
    },
  })

  useEffect(() => {
    if (spaceId === undefined) return
    // Realtime filters can't express "space_id is null" (or span spaces), so
    // the dashboard, Starred and Reminders listen to all of the user's item
    // changes (debounced below) instead.
    const inOneSpace = spaceId && !isCrossSpace(spaceId)
    const filter = inOneSpace ? `space_id=eq.${spaceId}` : userId ? `user_id=eq.${userId}` : null
    if (!filter) return
    // Coalesce bursts of row changes (e.g. a reorder updating many rows, or the
    // realtime echo of our own optimistic writes) into a single invalidation.
    let timer
    const channel = supabase
      .channel(`items-${itemsKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_items',
          filter,
        },
        ({ new: row }) => {
          // The echo of a change already in the list (our own save) changes
          // nothing.
          const cached = qc.getQueryData(queryKeys.items(itemsKey))
          if (row?.updated_at && cached?.some(i => i.id === row.id && i.updated_at === row.updated_at)) return
          clearTimeout(timer)
          timer = setTimeout(() => invalidateSpaceItems(qc, itemsKey), 250)
        }
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [spaceId, itemsKey, userId, qc])

  const create = useMutation({
    mutationFn: async ({ type, title, content }) => {
      // Starred and Reminders span spaces, so they have no space to add into.
      if (isCrossSpace(spaceId)) throw new Error('Add items from a space or the dashboard.')
      assertOnline()
      const items = query.data || []
      const position = items.length
      const plain = {
        type,
        title: title || '',
        content: content ?? newContent(type) ?? {},
      }
      const encrypted = await encryptItem(plain, cryptoKey)

      const { data, error } = await supabase
        .from('space_items')
        .insert({
          space_id: spaceId,
          // Set explicitly: a dashboard item has no space to derive it from.
          user_id: userId,
          type: plain.type,
          title: encrypted.title,
          content: encrypted.content,
          position,
        })
        .select()
        .single()
      if (error) throw error
      return decryptItem(data, cryptoKey)
    },
    onSuccess: () => {
      invalidateSpaceItems(qc, itemsKey)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, title, content }) => {
      const encrypted = await encryptItem({ title, content }, cryptoKey)
      const { data, error } = await supabase
        .from('space_items')
        .update({ title: encrypted.title, content: encrypted.content })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return decryptItem(data, cryptoKey)
    },
    // The saved item goes straight into the list: refetching would download
    // and decrypt the whole space on every auto-save.
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.items(itemsKey), (items) =>
        items?.map(item => (item.id === saved.id ? saved : item))
      )
      invalidateItemViews(qc)
    },
  })

  const togglePin = useMutation(makeTogglePin({
    table: 'space_items',
    qc,
    queryKey: queryKeys.items(itemsKey),
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  // Star / unstar: a quick-access flag that never changes the item's position.
  const toggleStar = useMutation(makeToggleStar({
    table: 'space_items',
    qc,
    queryKey: queryKeys.items(itemsKey),
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  // Protect / remove protection: a flag only (the content stays encrypted with
  // the vault key as before); a protected item's content shows after the PIN.
  const toggleLock = useMutation(makeToggleFlag({
    table: 'space_items',
    field: 'locked',
    qc,
    queryKey: queryKeys.items(itemsKey),
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  // Tags-only update (encrypted like a space's tags). Optimistic so chips update
  // instantly.
  const setTags = useMutation({
    mutationFn: async ({ id, tags }) => {
      assertOnline()
      const encrypted = await encryptTags(tags, cryptoKey)
      const { error } = await supabase
        .from('space_items')
        .update({ tags: encrypted })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, tags }) => {
      await qc.cancelQueries({ queryKey: queryKeys.items(itemsKey) })
      const previous = qc.getQueryData(queryKeys.items(itemsKey))
      qc.setQueryData(queryKeys.items(itemsKey), (old) =>
        old?.map(it => (it.id === id ? { ...it, tags: parseTags(tags) } : it))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.items(itemsKey), context.previous)
    },
    onSettled: () => invalidateSpaceItems(qc, itemsKey),
  })

  // Reminder (encrypted like the tags), or `reminder: null` to remove it. Not
  // content, so a read-only space allows it too, like a star. Optimistic so
  // the chip updates at once.
  const setReminder = useMutation({
    mutationFn: async ({ id, reminder }) => {
      assertOnline()
      const { error } = await supabase
        .from('space_items')
        .update({ reminder: await encryptReminder(reminder, cryptoKey) })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, reminder }) => {
      await qc.cancelQueries({ queryKey: queryKeys.items(itemsKey) })
      const previous = qc.getQueryData(queryKeys.items(itemsKey))
      qc.setQueryData(queryKeys.items(itemsKey), (old) =>
        old?.map(it => (it.id === id ? { ...it, reminder: normalizeReminder(reminder) } : it))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.items(itemsKey), context.previous)
    },
    onSettled: () => invalidateSpaceItems(qc, itemsKey),
  })

  // A List's numbering: bullets and numbers hold the same content, so turning
  // numbers on or off only switches the item's type (plain metadata, nothing
  // to re-encrypt). Optimistic so the list re-numbers at once.
  const setListNumbered = useMutation({
    mutationFn: async ({ id, numbered }) => {
      assertOnline()
      const { error } = await supabase
        .from('space_items')
        .update({ type: numbered ? 'numbered_list' : 'menu_list' })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, numbered }) => {
      await qc.cancelQueries({ queryKey: queryKeys.items(itemsKey) })
      const previous = qc.getQueryData(queryKeys.items(itemsKey))
      qc.setQueryData(queryKeys.items(itemsKey), (old) =>
        old?.map(it => (it.id === id ? { ...it, type: numbered ? 'numbered_list' : 'menu_list' } : it))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.items(itemsKey), context.previous)
    },
    onSettled: () => invalidateSpaceItems(qc, itemsKey),
  })

  const remove = useMutation(makeSoftDelete({
    table: 'space_items',
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  const archive = useMutation({
    mutationFn: async (id) => {
      assertOnline()
      const { error } = await supabase
        .from('space_items')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateSpaceItems(qc, itemsKey)
    },
  })

  const duplicate = useMutation({
    mutationFn: async (item) => {
      assertOnline()
      const items = query.data || []
      const plain = {
        type: item.type,
        title: item.title ? `${item.title} (copy)` : 'Untitled (copy)',
        content: structuredClone(item.content),
      }
      const encrypted = await encryptItem(plain, cryptoKey)
      const { data, error } = await supabase
        .from('space_items')
        .insert({
          space_id: isCrossSpace(spaceId) ? item.space_id : spaceId,
          user_id: userId,
          type: plain.type,
          title: encrypted.title,
          content: encrypted.content,
          position: items.length,
          pinned: false,
          // A copy of a protected item stays protected.
          locked: !!item.locked,
        })
        .select()
        .single()
      if (error) throw error
      return decryptItem(data, cryptoKey)
    },
    onSuccess: () => {
      invalidateSpaceItems(qc, itemsKey)
    },
  })

  const reorder = useMutation(makeReorder({
    qc,
    queryKey: queryKeys.items(itemsKey),
    rpc: 'update_item_positions',
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  const bulkRemove = useMutation(makeBulkSoftDelete({
    table: 'space_items',
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  // Move items to another space, or to the dashboard when `targetSpaceId` is
  // null.
  const move = useMutation({
    mutationFn: async ({ ids, targetSpaceId }) => {
      if (!ids?.length || targetSpaceId === undefined || targetSpaceId === spaceId) return
      assertOnline()

      const { count, error: countError } = await whereSpace(
        supabase.from('space_items').select('id', { count: 'exact', head: true }),
        targetSpaceId
      )
        .is('deleted_at', null)
        .is('archived_at', null)
      if (countError) throw countError

      const basePosition = count || 0
      const updates = ids.map((id, index) =>
        supabase
          .from('space_items')
          .update({
            space_id: targetSpaceId,
            position: basePosition + index,
            pinned: false,
          })
          .eq('id', id)
      )

      const results = await Promise.all(updates)
      const failed = results.find(result => result.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: (_data, variables) => {
      invalidateSpaceItems(qc, itemsKey)
      invalidateSpaceItems(qc, variables?.targetSpaceId ?? DASHBOARD_ITEMS_KEY)
    },
  })

  const bulkArchive = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      assertOnline()
      const { error } = await supabase
        .from('space_items')
        .update({ archived_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateSpaceItems(qc, itemsKey),
  })

  const bulkSetPinned = useMutation(makeBulkSetPinned({
    table: 'space_items',
    invalidate: () => invalidateSpaceItems(qc, itemsKey),
  }))

  const bulkDuplicate = useMutation({
    mutationFn: async (itemsToCopy) => {
      if (!itemsToCopy?.length) return
      assertOnline()
      const basePos = query.data?.length || 0
      const rows = await Promise.all(
        itemsToCopy.map(async (item, i) => {
          const plain = {
            title: item.title ? `${item.title} (copy)` : 'Untitled (copy)',
            content: structuredClone(item.content),
          }
          const encrypted = await encryptItem(plain, cryptoKey)
          return {
            space_id: isCrossSpace(spaceId) ? item.space_id : spaceId,
            user_id: userId,
            type: item.type,
            title: encrypted.title,
            content: encrypted.content,
            position: basePos + i,
            pinned: false,
            locked: !!item.locked,
          }
        })
      )
      const { error } = await supabase.from('space_items').insert(rows)
      if (error) throw error
    },
    onSuccess: () => invalidateSpaceItems(qc, itemsKey),
  })

  return {
    ...query,
    create,
    update,
    togglePin,
    toggleStar,
    toggleLock,
    setTags,
    setReminder,
    setListNumbered,
    remove,
    reorder,
    archive,
    duplicate,
    move,
    bulkRemove,
    bulkArchive,
    bulkSetPinned,
    bulkDuplicate,
  }
}
