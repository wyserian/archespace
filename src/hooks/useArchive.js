/**
 * useArchive.js - Archived spaces and items (reversible, not deleted).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEncryption } from '../context/EncryptionCore'
import { fetchStoredCollection } from '../lib/storedCollectionQuery'
import { binArchivedSpaces, reviveItemSpaces, unarchiveSpaces } from '../lib/spaceLifecycle'
import { invalidateArchive, invalidateSpaceCollections } from '../lib/queryInvalidation'
import { queryKeys } from '../lib/queryKeys'

export function useArchive() {
  const qc = useQueryClient()
  const { cryptoKey } = useEncryption()

  const query = useQuery({
    queryKey: queryKeys.archive(),
    enabled: !!cryptoKey,
    queryFn: () => fetchStoredCollection({
      cryptoKey,
      spaceQuery: q => q
        .not('archived_at', 'is', null)
        .is('deleted_at', null)
        .order('archived_at', { ascending: false }),
      itemQuery: q => q
        .not('archived_at', 'is', null)
        .is('deleted_at', null)
        .order('archived_at', { ascending: false }),
    }),
  })

  // Unarchiving brings back the sub-spaces and items archived along with it,
  // and any removed space above it (spaceLifecycle.js).
  const unarchiveSpace = useMutation({
    mutationFn: (id) => unarchiveSpaces([id]),
    onSuccess: () => invalidateArchive(qc),
  })

  const bulkUnarchiveSpaces = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      await unarchiveSpaces(ids)
    },
    onSuccess: () => invalidateArchive(qc),
  })

  const bulkUnarchiveItems = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase
        .from('space_items')
        .update({ archived_at: null })
        .in('id', ids)
      if (error) throw error
      await reviveItemSpaces(ids)
    },
    onSuccess: () => invalidateArchive(qc),
  })

  const unarchiveItem = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('space_items')
        .update({ archived_at: null })
        .eq('id', id)
      if (error) throw error
      await reviveItemSpaces([id])
    },
    onSuccess: () => invalidateArchive(qc),
  })

  // Move to bin (archive -> recycle bin): the row leaves the archive and
  // appears in the bin (which requires archived_at to be null), with the
  // sub-spaces and items archived along with it.
  const moveSpaceToBin = useMutation({
    mutationFn: (id) => binArchivedSpaces([id]),
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const moveItemToBin = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('space_items')
        .update({ deleted_at: new Date().toISOString(), archived_at: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const bulkMoveSpacesToBin = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      await binArchivedSpaces(ids)
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const bulkMoveItemsToBin = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase
        .from('space_items')
        .update({ deleted_at: new Date().toISOString(), archived_at: null })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateSpaceCollections(qc),
  })

  const total =
    (query.data?.spaces?.length || 0) +
    (query.data?.items?.length || 0)

  return {
    ...query,
    unarchiveSpace,
    unarchiveItem,
    bulkUnarchiveSpaces,
    bulkUnarchiveItems,
    moveSpaceToBin,
    moveItemToBin,
    bulkMoveSpacesToBin,
    bulkMoveItemsToBin,
    total,
  }
}
