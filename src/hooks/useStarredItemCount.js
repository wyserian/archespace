/**
 * useStarredItemCount.js - How many active items are starred, or set to
 * self-destruct (for the sidebar counts). Head-only counts: no rows are
 * fetched or decrypted.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEncryption } from '../context/EncryptionCore'
import { queryKeys } from '../lib/queryKeys'

function useActiveItemCount(queryKey, where) {
  const { cryptoKey } = useEncryption()
  return useQuery({
    queryKey,
    enabled: !!cryptoKey,
    queryFn: async () => {
      const { count, error } = await where(
        supabase.from('space_items').select('id', { count: 'exact', head: true })
      )
        .is('deleted_at', null)
        .is('archived_at', null)
      if (error) throw error
      return count || 0
    },
  })
}

export const useStarredItemCount = () =>
  useActiveItemCount(queryKeys.starredCount(), q => q.eq('starred', true))

export const useExpiringItemCount = () =>
  useActiveItemCount(queryKeys.expiringCount(), q => q.not('expires_at', 'is', null))
