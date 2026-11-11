/**
 * useRecycleBin.js - The recycle bin: deleted spaces and items.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEncryption } from '../context/EncryptionCore'
import { fetchStoredCollection } from '../lib/storedCollectionQuery'
import { purgeSpaces, restoreSpaces, reviveItemSpaces } from '../lib/spaceLifecycle'
import { invalidateRecycleBin } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'

/**
 * Deleting for good needs the server and must not act on an old copy: it runs
 * once what waits is sent and the offline copy is up to date (offlineCopy.js).
 * Offline it fails at once, with an error whose code is 'OFFLINE'.
 */
async function forGood(fn) {
  const copy = supabase.offline
  if (!copy) return fn()
  const result = await copy.online(fn)
  if (result?.error) throw result.error
}

export function useRecycleBin() {
  const qc = useQueryClient()
  const { cryptoKey } = useEncryption()

  const query = useQuery({
    queryKey: queryKeys.bin(),
    enabled: !!cryptoKey,
    queryFn: () => fetchStoredCollection({
      cryptoKey,
      spaceQuery: q => q
        .not('deleted_at', 'is', null)
        .is('archived_at', null)
        .order('deleted_at', { ascending: false }),
      itemQuery: q => q
        .not('deleted_at', 'is', null)
        .is('archived_at', null)
        .order('deleted_at', { ascending: false }),
    }),
  })

  // Restoring brings back what was deleted along with it, and any deleted or
  // archived space above it, so it shows where it was (spaceLifecycle.js).
  const restoreSpace = useMutation({
    mutationFn: (id) => restoreSpaces([id]),
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const purgeSpace = useMutation({
    mutationFn: (id) => forGood(() => purgeSpaces([id])),
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const restoreItem = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('space_items')
        .update({ deleted_at: null })
        .eq('id', id)
      if (error) throw error
      await reviveItemSpaces([id])
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const purgeItem = useMutation({
    mutationFn: (id) => forGood(async () => {
      const { error } = await supabase.from('space_items').delete().eq('id', id)
      if (error) throw error
    }),
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const bulkRestoreSpaces = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      await restoreSpaces(ids)
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const bulkRestoreItems = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase
        .from('space_items')
        .update({ deleted_at: null })
        .in('id', ids)
      if (error) throw error
      await reviveItemSpaces(ids)
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const bulkPurgeSpaces = useMutation({
    mutationFn: async (ids) => {
      if (ids?.length) await forGood(() => purgeSpaces(ids))
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const bulkPurgeItems = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      await forGood(async () => {
        const { error } = await supabase.from('space_items').delete().in('id', ids)
        if (error) throw error
      })
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const emptyBin = useMutation({
    mutationFn: () => forGood(async () => {
      const { error } = await supabase
        .from('space_items')
        .delete()
        .not('deleted_at', 'is', null)
      if (error) throw error
      await purgeSpaces(null)
    }),
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const total =
    (query.data?.spaces?.length || 0) +
    (query.data?.items?.length || 0)

  return {
    ...query,
    restoreSpace,
    purgeSpace,
    restoreItem,
    purgeItem,
    bulkRestoreSpaces,
    bulkRestoreItems,
    bulkPurgeSpaces,
    bulkPurgeItems,
    emptyBin,
    total,
  }
}
