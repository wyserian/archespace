/**
 * useGlobalSearch.js - Loads data for cross-space search.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEncryption } from '../context/EncryptionCore'
import { decryptSpaces, decryptItems } from '../lib/dataProtection'
import { GLOBAL_SEARCH_RESULT_LIMIT } from '../lib/constants'
import { queryKeys } from '../lib/queryKeys'
import { spacePathLabel } from '../lib/spaceTree'

export function useGlobalSearchData() {
  const { cryptoKey } = useEncryption()

  return useQuery({
    queryKey: queryKeys.globalSearch(),
    enabled: !!cryptoKey,
    queryFn: async () => {
      const [{ data: spaces, error: e1 }, { data: items, error: e2 }] = await Promise.all([
        supabase
          .from('spaces')
          .select('id, parent_id, name, description, tags, color, pinned')
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(GLOBAL_SEARCH_RESULT_LIMIT),
        supabase
          .from('space_items')
          .select('id, space_id, type, title, content, tags, pinned, locked')
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(GLOBAL_SEARCH_RESULT_LIMIT),
      ])
      if (e1) throw e1
      if (e2) throw e2

      const decryptedCols = await decryptSpaces(spaces || [], cryptoKey)
      const decryptedItems = await decryptItems(items || [], cryptoKey)

      const spacesById = new Map(decryptedCols.map(c => [c.id, c]))
      // Where each item lives: its space's path, or the dashboard.
      const itemMeta = Object.fromEntries(
        decryptedItems.map(i => [i.id, {
          spaceName: i.space_id ? (spacePathLabel(i.space_id, spacesById) || 'Unknown') : 'Dashboard',
        }])
      )

      // Both queries cap at GLOBAL_SEARCH_RESULT_LIMIT most-recent rows. Hitting
      // the cap means older rows weren't fetched, so search silently misses
      // them - surface that so the UI can tell the user.
      const truncated =
        (spaces?.length || 0) >= GLOBAL_SEARCH_RESULT_LIMIT ||
        (items?.length || 0) >= GLOBAL_SEARCH_RESULT_LIMIT

      return {
        spaces: decryptedCols,
        items: decryptedItems,
        itemMeta,
        truncated,
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
