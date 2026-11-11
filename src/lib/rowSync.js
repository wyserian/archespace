/**
 * rowSync.js - Load a list, downloading in full only the rows that changed
 * since the copy kept for offline reads (offlineCache.js).
 *
 * First it asks for each row's id and updated_at, with the list's own filters
 * and order; the server bumps updated_at on every change. Rows that are new
 * or changed are then fetched in full, the rest come from the kept copy. A
 * row deleted, moved away or hidden since isn't in the first answer, so it
 * simply drops out.
 */
import { supabase } from './supabase'
import { loadRows } from './offlineCache'

// Ids per follow-up request, so its URL stays short.
const ID_CHUNK = 100

async function rowsOf(request) {
  const { data, error } = await request
  if (error) throw error
  return data || []
}

/**
 * The rows of `table` that `query` selects, as one plain select would return
 * them. `query(builder)` adds the list's filters and order.
 */
export async function fetchRows({ table, query, userId, cacheKey }) {
  const full = () => rowsOf(query(supabase.from(table).select('*')))
  const kept = await loadRows(userId, cacheKey)
  if (!kept?.length) return full()

  const heads = await rowsOf(query(supabase.from(table).select('id, updated_at')))
  const byId = new Map(kept.map(row => [row.id, row]))
  const changed = heads.filter(h => byId.get(h.id)?.updated_at !== h.updated_at).map(h => h.id)
  // Mostly changed: one full download beats many lookups.
  if (changed.length > heads.length / 2) return full()

  for (const id of changed) byId.delete(id)
  for (let i = 0; i < changed.length; i += ID_CHUNK) {
    const ids = changed.slice(i, i + ID_CHUNK)
    for (const row of await rowsOf(query(supabase.from(table).select('*')).in('id', ids))) {
      byId.set(row.id, row)
    }
  }
  // One deleted between the two requests is left out.
  return heads.map(h => byId.get(h.id)).filter(Boolean)
}
