/**
 * useSpaceStats.js - Item counts per space for the space cards: each space's
 * own items plus those of every sub-space below it.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { rollUpCounts } from '../lib/spaceTree'

export function useSpaceStats() {
  return useQuery({
    queryKey: queryKeys.spaceStats(),
    queryFn: async () => {
      const [items, spaces] = await Promise.all([
        supabase.from('space_items').select('space_id').is('deleted_at', null).is('archived_at', null),
        supabase.from('spaces').select('id, parent_id').is('deleted_at', null).is('archived_at', null),
      ])
      if (items.error) throw items.error
      if (spaces.error) throw spaces.error

      const own = {}
      for (const row of items.data || []) {
        if (row.space_id) own[row.space_id] = (own[row.space_id] || 0) + 1
      }
      const totals = rollUpCounts(own, spaces.data || [])
      return Object.fromEntries(Object.entries(totals).map(([id, total]) => [id, { total }]))
    },
    staleTime: 1000 * 30,
  })
}
