/**
 * useOfflineSync.js - Keeps this device's offline copy and the server in step
 * (offlineCopy.js): a sync on start, shortly after each change, on
 * reconnecting, on coming back to the tab, and every half minute. Lists
 * refresh when the copy changes, and the outcome of anything that couldn't
 * land as made is shown.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastCore'
import { useEncryption } from '../context/EncryptionCore'
import { useAuth } from '../context/AuthContextCore'
import { decryptString, encryptString } from '../lib/crypto/cipher'

const AFTER_CHANGE_MS = 400
const EVERY_MS = 30_000

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Before the offline copy, item edits made offline waited in this queue; any
// left over from then go out through the copy, once.
const OLD_QUEUE = 'arche-offline-queue'
async function adoptOldQueue(userId) {
  let queued
  try {
    queued = JSON.parse(localStorage.getItem(OLD_QUEUE) || '[]')
  } catch {
    return
  }
  const mine = queued.filter(e => e?.type === 'item-update' && e.userId === userId && e.payload?.id)
  for (const { payload } of mine) {
    await supabase.from('space_items').update({ title: payload.title, content: payload.content }).eq('id', payload.id)
  }
  const others = queued.filter(e => !mine.includes(e))
  if (others.length) localStorage.setItem(OLD_QUEUE, JSON.stringify(others))
  else localStorage.removeItem(OLD_QUEUE)
  indexedDB.deleteDatabase('arche-offline-cache') // the old read-only offline cache
}

export function useOfflineSync() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { cryptoKey } = useEncryption()
  const userId = useAuth().user?.id
  const copy = supabase.offline

  // An edit made on a version that changed meanwhile is kept as a copy,
  // titled so it's easy to spot.
  useEffect(() => {
    copy?.setCopyTitle(async (title) => {
      if (!cryptoKey || !title) return title
      const text = await decryptString(title, cryptoKey).catch(() => '')
      return encryptString(`${text || 'Untitled'} (offline copy)`, cryptoKey)
    })
  }, [copy, cryptoKey])

  useEffect(() => {
    if (!copy) return undefined
    let timer
    const sync = () => copy.sync()
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(sync, AFTER_CHANGE_MS)
    }
    const onShown = () => { if (document.visibilityState === 'visible') sync() }
    const unsubscribe = copy.subscribe((event) => {
      if (event.type === 'write') soon()
      else if (event.type === 'changed') qc.invalidateQueries()
      else if (event.type === 'report') {
        if (event.copied) {
          toast.info(`${plural(event.copied, 'offline change was', 'offline changes were')} saved as a copy: the item changed meanwhile.`)
        }
        if (event.refused) {
          toast.error(`${plural(event.refused, "offline change wasn't", "offline changes weren't")} saved: the space is read-only.`)
        }
        if (event.lost) {
          toast.error(`${plural(event.lost, "offline change couldn't", "offline changes couldn't")} be saved.`)
        }
      }
    })
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', onShown)
    const every = setInterval(sync, EVERY_MS)
    if (userId) adoptOldQueue(userId).catch(() => {})
    sync()
    return () => {
      clearTimeout(timer)
      clearInterval(every)
      unsubscribe()
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onShown)
    }
  }, [copy, qc, toast, userId])
}
