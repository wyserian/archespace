/**
 * useSpaceItems.js - Hook for items within a single space; with
 * `spaceId === null`, the dashboard's items, which belong to no space; with
 * `STARRED_ITEMS`, the starred items from every space (the Starred view); with
 * `REMINDER_ITEMS`, the items with a reminder (the Reminders view); or with
 * `EXPIRING_ITEMS`, those set to self-destruct (the Self-destruct view).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EMPTY_RICH_DOC } from '../lib/richText/doc'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import { encryptItem, decryptItem, decryptItems, encryptTags, encryptReminder } from '../lib/dataProtection'
import { normalizeReminder } from '../lib/reminder'
import { defaultKanban } from '../lib/kanban'
import { parseTags } from '../lib/spaceColors'
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
  richtext: { doc: EMPTY_RICH_DOC },
  code: { code: '' },
  whiteboard: { elements: [] },
  table: { columns: ['', ''], rows: [['', ''], ['', '']] },
}
// Fresh ids for every new Kanban's columns and Cards' first (empty) card.
const newContent = (type) => {
  if (type === 'kanban') return defaultKanban()
  if (type === 'card_list') return { items: [{ id: crypto.randomUUID(), title: '', description: '' }] }
  return defaultContent[type]
}

// Query/cache key for the dashboard's items (those with no space).
const DASHBOARD_ITEMS_KEY = 'dashboard'
// Pass as the `spaceId` for the starred items of every space. Also its key.
export const STARRED_ITEMS = 'starred'
// Pass as the `spaceId` for the items with a reminder. Also its key.
export const REMINDER_ITEMS = 'reminders'
// Pass as the `spaceId` for the items set to self-destruct. Also its key.
export const EXPIRING_ITEMS = 'expiring'

/** Starred, Reminders and Self-destruct gather items from every space. */
const isCrossSpace = (spaceId) =>
  spaceId === STARRED_ITEMS || spaceId === REMINDER_ITEMS || spaceId === EXPIRING_ITEMS

/**
 * Restrict an items query to one space, to the dashboard for `null`, to the
 * starred items for `STARRED_ITEMS`, to those with a reminder for
 * `REMINDER_ITEMS`, or to those set to self-destruct for `EXPIRING_ITEMS`.
 */
function whereSpace(q, spaceId) {
  if (spaceId === STARRED_ITEMS) return q.eq('starred', true)
  if (spaceId === REMINDER_ITEMS) return q.not('reminder', 'is', null)
  if (spaceId === EXPIRING_ITEMS) return q.not('expires_at', 'is', null)
  return spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null)
}

/** The decrypted items of one space (see whereSpace), as its list shows them. */
async function loadItems(spaceId, cryptoKey) {
  const { data, error } = await whereSpace(supabase.from('space_items').select('*'), spaceId)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('pinned', { ascending: false })
    .order('position', { ascending: true })
    // Items can share a position (one added after a delete), so ties break
    // the same way here and on mobile.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return decryptItems(data, cryptoKey)
}

/**
 * Loads a space's items when needed (e.g. to export a space from its card):
 * from the query cache if fresh, otherwise as its page would.
 */
export function useFetchSpaceItems() {
  const qc = useQueryClient()
  const { cryptoKey } = useEncryption()
  return useCallback((spaceId) => qc.fetchQuery({
    queryKey: queryKeys.items(spaceId),
    queryFn: () => loadItems(spaceId, cryptoKey),
  }), [qc, cryptoKey])
}

export function useSpaceItems(spaceId) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { cryptoKey } = useEncryption()
  const userId = user?.id
  const itemsKey = spaceId ?? DASHBOARD_ITEMS_KEY

  const query = useQuery({
    queryKey: queryKeys.items(itemsKey),
    enabled: spaceId !== undefined && !!cryptoKey,
    queryFn: () => loadItems(spaceId, cryptoKey),
  })

  useEffect(() => {
    if (spaceId === undefined) return
    // Realtime filters can't express "space_id is null" (or span spaces), so
    // the dashboard, Starred and Reminders listen to all of the user's item
    // changes (debounced below) instead.
    const inOneSpace = spaceId && !isCrossSpace(spaceId)
    const filter = inOneSpace ? `space_id=eq.${spaceId}` : userId ? `user_id=eq.${userId}` : null
    if (!filter) return
    // Another device changed something: sync the offline copy (which then
    // refreshes the lists). Bursts (a reorder, the echo of our own changes)
    // coalesce into one.
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
        () => {
          clearTimeout(timer)
          timer = setTimeout(() => (supabase.offline ? supabase.offline.sync() : invalidateSpaceItems(qc, itemsKey)), 250)
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
    onSuccess: (added) => {
      // Show it at once (it goes last, as its position says); the refetch
      // then brings the server's view without making the new card wait.
      qc.setQueryData(itemsKey, (old) => (Array.isArray(old) ? [...old, added] : old))
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

  // Protect / remove protection: a flag only (the content is encrypted with the
  // vault key either way); a protected item's content shows after the PIN.
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

  // Plain (unencrypted) columns that aren't content: the self-destruct time
  // (`expires_at`, lib/expiry.js; null cancels it) and the card colour
  // (`color`, a space colour preset id or null). Optimistic so the chip or
  // colour shows at once.
  const setPlain = useMutation({
    mutationFn: async ({ id, fields }) => {
      const { error } = await supabase.from('space_items').update(fields).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, fields }) => {
      await qc.cancelQueries({ queryKey: queryKeys.items(itemsKey) })
      const previous = qc.getQueryData(queryKeys.items(itemsKey))
      qc.setQueryData(queryKeys.items(itemsKey), (old) =>
        old?.map(it => (it.id === id ? { ...it, ...fields } : it))
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
    setPlain,
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
