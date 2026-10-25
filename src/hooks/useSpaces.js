/**
 * useSpaces.js - The spaces list and every change to a space.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { supabase } from '../lib/supabase'
import { parseTags } from '../lib/spaceColors'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import { assertOnline } from '../lib/offlineQueue'
import { saveRows, loadRows } from '../lib/offlineCache'
import { setReachable, isNetworkError } from '../lib/connectivity'
import { encryptSpace, decryptSpace, decryptSpaces, encryptTags } from '../lib/dataProtection'
import { duplicateSpaceWithItems } from '../lib/spaceDuplicate'
import { archiveSpaces, deleteSpaces, moveSpaces } from '../lib/spaceLifecycle'
import { invalidateSpaceCollections, invalidateSpaceList } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'
import { setSpaceLocks, setSpaceLocked } from '../lib/itemLock'
import {
  makeBulkSetPinned,
  makeTogglePin,
  makeToggleStar,
  makeToggleFlag,
  makeReorder,
} from './entityMutations'

export function useSpaces() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { cryptoKey } = useEncryption()
  const userId = user?.id
  // Unique per hook instance so multiple mounts (e.g. the app shell + the
  // dashboard) don't collide on one realtime channel name.
  const instanceId = useId()

  const query = useQuery({
    queryKey: queryKeys.spaces(),
    enabled: !!cryptoKey,
    // 'always' so the queryFn still runs while offline and can fall back to the
    // encrypted cache (the default 'online' mode would pause it with no data).
    networkMode: 'always',
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('spaces')
          .select('*')
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('pinned', { ascending: false })
          .order('position', { ascending: true })
          .order('created_at', { ascending: false })
          .order('id', { ascending: true }) // a stable last tie-break, as on mobile

        if (error) throw error
        const rows = data || []
        setReachable(true)
        saveRows(userId, 'spaces', rows) // cache ciphertext for offline reads
        setSpaceLocks(rows) // so a locked space's items stay hidden everywhere
        return decryptSpaces(rows, cryptoKey)
      } catch (err) {
        // Fall back to the encrypted cache on any network failure - navigator
        // .onLine can wrongly report "online" (LAN with no internet, server
        // down), so key off the actual failure, not just the interface state.
        if (isNetworkError(err)) {
          setReachable(false)
          const cached = await loadRows(userId, 'spaces')
          if (cached) {
            setSpaceLocks(cached)
            return decryptSpaces(cached, cryptoKey)
          }
        }
        throw err
      }
    },
  })

  useEffect(() => {
    // Coalesce bursts of row changes (e.g. a reorder updating many rows, or the
    // realtime echo of our own optimistic writes) into a single invalidation.
    let timer
    const channel = supabase
      .channel(`spaces-realtime-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spaces' },
        () => {
          clearTimeout(timer)
          timer = setTimeout(() => invalidateSpaceCollections(qc), 250)
        }
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [qc, instanceId])

  const create = useMutation({
    mutationFn: async ({ name, description, color, tags, parentId = null }) => {
      assertOnline()
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      // Position among siblings (same parent).
      const position = (query.data || []).filter(
        s => (s.parent_id ?? null) === (parentId ?? null)
      ).length

      const encrypted = await encryptSpace({
        name,
        description: description || '',
        color: color || null,
        tags: parseTags(tags),
      }, cryptoKey)

      const { data, error } = await supabase
        .from('spaces')
        .insert({
          name: encrypted.name,
          description: encrypted.description,
          user_id: userId,
          parent_id: parentId,
          position,
          color: color || null,
          tags: encrypted.tags,
        })
        .select()
        .single()
      if (error) throw error
      return decryptSpace(data, cryptoKey)
    },
    onSuccess: () => invalidateSpaceList(qc),
  })

  const update = useMutation({
    mutationFn: async ({ id, name, description, color, tags }) => {
      assertOnline()
      const payload = { name, description }
      if (color !== undefined) payload.color = color
      if (tags !== undefined) payload.tags = parseTags(tags)

      const encrypted = await encryptSpace(payload, cryptoKey)
      const dbPayload = { ...payload, name: encrypted.name, description: encrypted.description }
      if (tags !== undefined) dbPayload.tags = encrypted.tags

      const { data, error } = await supabase
        .from('spaces')
        .update(dbPayload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return decryptSpace(data, cryptoKey)
    },
    onSuccess: () => invalidateSpaceList(qc),
  })

  // Tags only, from the space card (encrypted like the rest). Optimistic so the
  // chip appears or goes at once.
  const setTags = useMutation({
    mutationFn: async ({ id, tags }) => {
      assertOnline()
      const encrypted = await encryptTags(tags, cryptoKey)
      const { error } = await supabase
        .from('spaces')
        .update({ tags: encrypted })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, tags }) => {
      await qc.cancelQueries({ queryKey: queryKeys.spaces() })
      const previous = qc.getQueryData(queryKeys.spaces())
      qc.setQueryData(queryKeys.spaces(), (old) =>
        old?.map(s => (s.id === id ? { ...s, tags: parseTags(tags) } : s))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.spaces(), context.previous)
    },
    onSettled: () => invalidateSpaceList(qc),
  })

  const togglePin = useMutation(makeTogglePin({
    table: 'spaces',
    qc,
    queryKey: queryKeys.spaces(),
    invalidate: () => qc.invalidateQueries({ queryKey: queryKeys.spaces() }),
  }))

  // Star / unstar (the Starred view reads starred spaces from this list).
  const toggleStar = useMutation(makeToggleStar({
    table: 'spaces',
    qc,
    queryKey: queryKeys.spaces(),
    invalidate: () => qc.invalidateQueries({ queryKey: queryKeys.spaces() }),
  }))

  // Read-only on / off. The database then refuses edits to the space's details
  // and its items' content until it's turned off again.
  const toggleReadOnly = useMutation(makeToggleFlag({
    table: 'spaces',
    field: 'read_only',
    qc,
    queryKey: queryKeys.spaces(),
    invalidate: () => qc.invalidateQueries({ queryKey: queryKeys.spaces() }),
  }))

  // Protect / remove protection (a flag only; nothing is re-encrypted). The
  // lock store is told at once, so protecting hides the space before the list
  // reloads.
  const lockFlag = makeToggleFlag({
    table: 'spaces',
    field: 'locked',
    qc,
    queryKey: queryKeys.spaces(),
    invalidate: () => invalidateSpaceCollections(qc),
  })
  const toggleLock = useMutation({
    ...lockFlag,
    onMutate: async (vars) => {
      setSpaceLocked(vars.id, !vars.locked)
      return lockFlag.onMutate(vars)
    },
    onError: (err, vars, context) => {
      setSpaceLocked(vars.id, !!vars.locked)
      lockFlag.onError(err, vars, context)
    },
  })

  const reorder = useMutation(makeReorder({
    qc,
    queryKey: queryKeys.spaces(),
    rpc: 'update_space_positions',
    invalidate: () => qc.invalidateQueries({ queryKey: queryKeys.spaces() }),
  }))

  // How many spaces share a parent (a copy goes after them).
  const siblingCount = (parentId) =>
    (query.data || []).filter(s => (s.parent_id ?? null) === (parentId ?? null)).length

  // Deleting and archiving take the space's sub-spaces with it (see
  // spaceLifecycle.js).
  const remove = useMutation({
    mutationFn: async (id) => {
      assertOnline()
      await deleteSpaces([id])
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const archive = useMutation({
    mutationFn: async (id) => {
      assertOnline()
      await archiveSpaces([id])
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  // Move spaces into another space (`parentId`), or to the top level for null.
  const move = useMutation({
    mutationFn: async ({ ids, parentId }) => {
      if (!ids?.length) return
      assertOnline()
      await moveSpaces(ids, parentId)
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const duplicate = useMutation({
    mutationFn: async (id) => {
      assertOnline()
      const source = query.data?.find(c => c.id === id)
      if (!source) throw new Error('Space not found')
      const newCol = await duplicateSpaceWithItems(source, cryptoKey, siblingCount(source.parent_id))
      return decryptSpace(newCol, cryptoKey)
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const bulkRemove = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      assertOnline()
      await deleteSpaces(ids)
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const bulkArchive = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      assertOnline()
      await archiveSpaces(ids)
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const bulkSetPinned = useMutation(makeBulkSetPinned({
    table: 'spaces',
    invalidate: () => invalidateSpaceCollections(qc),
  }))

  const bulkDuplicate = useMutation({
    mutationFn: async (cols) => {
      assertOnline()
      const added = new Map() // parent -> copies made so far
      for (const source of cols) {
        const parent = source.parent_id ?? null
        const position = siblingCount(parent) + (added.get(parent) || 0)
        added.set(parent, (added.get(parent) || 0) + 1)
        await duplicateSpaceWithItems(source, cryptoKey, position)
      }
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  return {
    ...query,
    create,
    update,
    setTags,
    togglePin,
    toggleStar,
    toggleReadOnly,
    toggleLock,
    remove,
    reorder,
    archive,
    move,
    duplicate,
    bulkRemove,
    bulkArchive,
    bulkSetPinned,
    bulkDuplicate,
  }
}
