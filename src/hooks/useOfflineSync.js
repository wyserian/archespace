/**
 * useOfflineSync.js - Flush offline write queue when back online.
 *
 * A queued edit only lands on the version of the item it was made on. If the
 * item changed elsewhere meanwhile (or is gone), the edit is saved as a copy
 * beside it rather than overwriting the newer version. Edits queued by another
 * account stay queued until that account is signed in again.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { flushOfflineQueue, getOfflineQueue } from '../lib/offlineQueue'
import { useToast } from '../context/ToastCore'
import { useAuth } from '../context/AuthContextCore'
import { queryKeys } from '../lib/queryKeys'
import { isReadOnlyError } from '../lib/readOnly'
import { isNetworkError } from '../lib/connectivity'

export function useOfflineSync() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const userId = useAuth().user?.id

  useEffect(() => {
    if (!userId) return undefined

    /** Save a queued edit as a new item; true once it's done or can't be. */
    const saveCopy = async ({ spaceId, itemType, copyTitle, content }) => {
      for (const space_id of spaceId ? [spaceId, null] : [null]) {
        const { error } = await supabase
          .from('space_items')
          .insert({ space_id, type: itemType, title: copyTitle, content })
        if (!error) return 'copied'
        if (isNetworkError(error)) return 'retry'
        if (isReadOnlyError(error)) return 'refused'
        // Its space is gone: put the copy on the dashboard instead.
      }
      return 'lost'
    }

    const processQueue = async () => {
      const pending = getOfflineQueue().length
      if (pending === 0) return

      let refused = 0
      let copied = 0
      let lost = 0
      const flushed = await flushOfflineQueue(async (entry) => {
        if (entry.type !== 'item-update') return false
        if (entry.userId && entry.userId !== userId) return false
        const { id, title, content, base, copyTitle } = entry.payload
        let update = supabase.from('space_items').update({ title, content }).eq('id', id)
        if (base) update = update.eq('updated_at', base)
        const { data, error } = await update.select('id')
        // Edits to a space made read-only meanwhile can never apply: drop them
        // (rather than retrying forever) and say so.
        if (isReadOnlyError(error)) {
          refused++
          return true
        }
        if (error) return false
        if (data.length > 0) return true
        // Changed elsewhere, or gone: save the edit as a copy beside it. An
        // entry without a copy title can't be copied, so it's dropped.
        if (!copyTitle) return true
        const result = await saveCopy({ ...entry.payload, content })
        if (result === 'retry') return false
        if (result === 'copied') copied++
        else if (result === 'refused') refused++
        else lost++
        return true
      })

      const synced = flushed - refused - copied - lost
      if (synced > 0) {
        toast.success(`Back online - synced ${synced} change${synced === 1 ? '' : 's'}.`)
      }
      if (copied > 0) {
        toast.info(`${copied} offline change${copied === 1 ? ' was' : 's were'} saved as a copy: the item changed meanwhile.`)
      }
      if (refused > 0) {
        toast.error(`${refused} offline change${refused === 1 ? " wasn't" : "s weren't"} saved: the space is read-only.`)
      }
      if (lost > 0) {
        toast.error(`${lost} offline change${lost === 1 ? " couldn't" : "s couldn't"} be saved.`)
      }
      if (flushed > 0) qc.invalidateQueries({ queryKey: queryKeys.items() })
    }

    const onOnline = () => processQueue()
    window.addEventListener('online', onOnline)
    if (navigator.onLine) processQueue()
    return () => window.removeEventListener('online', onOnline)
  }, [qc, toast, userId])
}
