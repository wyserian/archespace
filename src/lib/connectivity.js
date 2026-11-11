/**
 * connectivity.js - App-level reachability signal.
 *
 * navigator.onLine only knows whether a network interface is up, not whether
 * the server is actually reachable (a LAN with no internet, or Supabase being
 * down, still reads as "online"). Data fetches report their real outcome here so
 * the offline banner and cache fallback react to actual reachability, not just
 * the interface state.
 */
import { isLocalMode } from './localMode'

let reachable = true
const listeners = new Set()

export function isReachable() {
  return reachable
}

export function setReachable(value) {
  if (reachable === value) return
  reachable = value
  for (const fn of listeners) fn(reachable)
}

export function subscribeReachable(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Whether the device has a network (always, in local mode, which needs none). */
export function isOnline() {
  if (isLocalMode()) return true
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * For the few actions that need the server (backup import, account and
 * security): fail at once with a clear message when offline, rather than
 * after a request times out.
 */
export function assertOnline() {
  if (!isOnline() || !isReachable()) throw new Error("You're offline - reconnect to do this.")
}

/**
 * True when an error looks like a failed network request (as opposed to a real
 * server/permission error), so callers can treat it as "unreachable".
 */
export function isNetworkError(err) {
  // Local mode makes no requests, so nothing fails for lack of a network.
  if (isLocalMode()) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (err instanceof TypeError) return true // fetch() throws TypeError on network failure
  const text = `${err?.name || ''} ${err?.message || ''}`.toLowerCase()
  return (
    text.includes('network') ||
    text.includes('fetch') ||
    text.includes('load failed') || // Safari's wording
    text.includes('abort') || // a request past its time limit (supabase.js)
    text.includes('timed out') ||
    text.includes('timeout')
  )
}
