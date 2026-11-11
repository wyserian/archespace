/**
 * offlineCache.js - Read-through cache of ENCRYPTED rows for offline reads.
 *
 * Zero-knowledge is preserved: we store the raw ciphertext rows exactly as they
 * come back from Supabase (never the decrypted plaintext), so nothing readable
 * sits on disk. On a successful online fetch the rows are cached; when a fetch
 * fails while offline, the caller falls back to these rows and decrypts them
 * with the in-memory vault key. Online, a list only downloads the rows that
 * changed since (rowSync.js).
 *
 * Entries are namespaced by user id so a shared browser never mixes accounts
 * (and another account could not decrypt them anyway).
 */
import { isLocalMode } from './localMode'
import { withoutExpired } from './expiry'
import { openIdb, withStore } from './idb'

const DB_NAME = 'arche-offline-cache'
const STORE = 'rows'

const openDb = () => openIdb(DB_NAME, 1, (db) => {
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' })
})
const inStore = (mode, fn) => withStore(openDb, STORE, mode, fn)
function cacheKey(userId, key) {
  return `${userId || 'anon'}:${key}`
}

/**
 * Store the encrypted rows for a query key. Best-effort; never throws. Local
 * mode skips it: its data is already in this browser.
 */
export async function saveRows(userId, key, rows) {
  if (isLocalMode()) return
  try {
    await inStore('readwrite', store => { store.put({ k: cacheKey(userId, key), rows, savedAt: Date.now() }) })
  } catch {
    // IndexedDB unavailable or quota exceeded - offline cache is best-effort.
  }
}

/**
 * Return the cached encrypted rows for a query key, or null if none. Rows
 * whose self-destruct time has passed are left out, as the server hides them.
 */
export async function loadRows(userId, key) {
  if (isLocalMode()) return null
  try {
    const value = await inStore('readonly', store => store.get(cacheKey(userId, key)))
    return value?.rows ? withoutExpired(value.rows) : null
  } catch {
    return null
  }
}

/** Drop the entire offline cache (called on sign-out). */
export async function clearOfflineCache() {
  try {
    await inStore('readwrite', store => { store.clear() })
  } catch {
    // Nothing to clear / storage unavailable.
  }
}
