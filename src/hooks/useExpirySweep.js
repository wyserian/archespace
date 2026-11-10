/**
 * useExpirySweep.js - Self-destruct while the app is open (lib/expiry.js).
 *
 * The server already hides and deletes expired spaces and items; this asks it
 * to purge them right after unlock (in case pg_cron isn't set up, and for
 * local mode), and every 30 seconds drops any that expired since they were
 * loaded by refetching the lists that still show them.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { holdsExpired } from '../lib/expiry'

const SWEEP_MS = 30 * 1000

export function useExpirySweep(enabled) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return undefined
    // Best effort: offline, the server does it on schedule anyway.
    const purge = () => supabase.rpc('purge_expired').then(() => {}, () => {})
    purge()
    const timer = setInterval(async () => {
      const stale = qc.getQueryCache().getAll().filter(q => holdsExpired(q.state.data))
      if (stale.length === 0) return
      await purge()
      for (const q of stale) qc.invalidateQueries({ queryKey: q.queryKey, exact: true })
    }, SWEEP_MS)
    return () => clearInterval(timer)
  }, [enabled, qc])
}
