/**
 * offlineQueue.js - Persist failed writes while offline; flush on reconnect.
 */
import { isLocalMode } from './localMode'

const STORAGE_KEY = 'arche-offline-queue'

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

/**
 * @param {{ type: string, userId?: string, payload: object }} entry
 * A later edit of an item already queued replaces it, keeping the version
 * (`payload.base`) the first edit was made on.
 */
export function enqueueOffline(entry) {
  const queue = readQueue()
  const same = queue.findIndex(e =>
    e.type === entry.type && e.userId === entry.userId && e.payload?.id === entry.payload?.id
  )
  if (same >= 0) {
    const base = queue[same].payload?.base
    queue[same] = { ...queue[same], payload: { ...entry.payload, base } }
  } else {
    queue.push({ ...entry, id: crypto.randomUUID(), createdAt: Date.now() })
  }
  writeQueue(queue)
  return queue.length
}

export function getOfflineQueue() {
  return readQueue()
}

/**
 * @param {(entry: object) => Promise<boolean>} processor - return true to remove
 */
export async function flushOfflineQueue(processor) {
  const queue = readQueue()
  if (queue.length === 0) return 0

  const remaining = []
  let flushed = 0

  for (const entry of queue) {
    try {
      const ok = await processor(entry)
      if (ok) flushed++
      else remaining.push(entry)
    } catch {
      remaining.push(entry)
    }
  }

  writeQueue(remaining)
  return flushed
}

export function isOnline() {
  // Local mode needs no network, so it's never "offline".
  if (isLocalMode()) return true
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

/** Thrown by assertOnline() so callers can show a consistent offline message. */
class OfflineError extends Error {
  constructor(message = "You're offline - reconnect to make changes.") {
    super(message)
    this.name = 'OfflineError'
  }
}

/**
 * Guard a write that has no offline queue: throw a friendly OfflineError when
 * offline so the mutation fails fast (and optimistic updates roll back) instead
 * of hanging on a doomed network request.
 */
export function assertOnline() {
  if (!isOnline()) throw new OfflineError()
}
