/**
 * useRecycleBin.js - The recycle bin: deleted spaces and items.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEncryption } from '../context/EncryptionCore'
import { fetchStoredCollection } from '../lib/storedCollectionQuery'
import { restoreSpaces, reviveItemSpaces } from '../lib/spaceLifecycle'
import { invalidateRecycleBin } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'

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
    mutationFn: async (id) => {
      const { error } = await supabase.from('spaces').delete().eq('id', id)
      if (error) throw error
    },
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
    mutationFn: async (id) => {
      const { error } = await supabase.from('space_items').delete().eq('id', id)
      if (error) throw error
    },
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
      if (!ids?.length) return
      const { error } = await supabase.from('spaces').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const bulkPurgeItems = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase.from('space_items').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateRecycleBin(qc),
  })

  const emptyBin = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from('space_items')
        .delete()
        .not('deleted_at', 'is', null)
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('spaces')
        .delete()
        .not('deleted_at', 'is', null)
      if (e2) throw e2
    },
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
