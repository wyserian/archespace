/**
 * vaultSession.js - Persist the unlocked vault across page refresh.
 *
 * IndexedDB holds the master key only AES-GCM wrapped, under a random key
 * that lives in this tab's sessionStorage. A reload has both and restores the
 * vault; once the tab is closed the browser drops sessionStorage, and what's
 * left in IndexedDB can't be opened. Each tab keeps its own entry, so tabs
 * never overwrite each other. The restored key is non-extractable: a script
 * on the page can use it but can't export the raw bytes.
 *
 * Cleared on manual lock, sign-out, or auto-lock.
 */
import { autoLockMs } from './vaultAutoLock'
import { bytesFromBase64, bytesToBase64 } from './encoding'
import { SESSION_ABSOLUTE_MAX_MS } from '../constants'

export const VAULT_UNLOCKED_AT_KEY = 'arche:vault-unlocked-at'
const VAULT_SESSION_USER = 'arche:vault-session-user'
// This tab's wrapping key and its entry's id in IndexedDB.
const VAULT_SESSION_WRAP = 'arche:vault-session-wrap'
const VAULT_SESSION_ID = 'arche:vault-session-id'

const DB_NAME = 'arche-vault'
const STORE = 'session'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Run `fn(store)` in one transaction; resolves with what `fn` returns. */
async function withStore(mode, fn) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let result
      const req = fn(tx.objectStore(STORE))
      if (req) req.onsuccess = () => { result = req.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

const importAesKey = (raw) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

export function clearVaultSession() {
  const id = sessionStorage.getItem(VAULT_SESSION_ID)
  sessionStorage.removeItem(VAULT_UNLOCKED_AT_KEY)
  sessionStorage.removeItem(VAULT_SESSION_USER)
  sessionStorage.removeItem(VAULT_SESSION_WRAP)
  sessionStorage.removeItem(VAULT_SESSION_ID)
  // Fire-and-forget: without the wrapping key above the entry is already
  // useless.
  if (id) withStore('readwrite', store => store.delete(id)).catch(() => {})
}

export async function saveVaultSession(userId, cryptoKey) {
  try {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey)
    const wrapRaw = crypto.getRandomValues(new Uint8Array(32))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importAesKey(wrapRaw), raw)
    const id = sessionStorage.getItem(VAULT_SESSION_ID) || crypto.randomUUID()
    const now = Date.now()
    await withStore('readwrite', store => {
      // Entries left by closed tabs can't be opened; drop the old ones.
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return
        if (!(c.value?.at > now - SESSION_ABSOLUTE_MAX_MS)) c.delete()
        c.continue()
      }
      store.put({ iv, wrapped, at: now }, id)
    })
    sessionStorage.setItem(VAULT_SESSION_ID, id)
    sessionStorage.setItem(VAULT_SESSION_WRAP, bytesToBase64(wrapRaw))
    sessionStorage.setItem(VAULT_SESSION_USER, userId)
    sessionStorage.setItem(VAULT_UNLOCKED_AT_KEY, String(now))
  } catch {
    // Secure storage unavailable: don't cache. Unlock still works this
    // session, it just won't survive a page reload.
    clearVaultSession()
  }
}

/**
 * @param {string} userId
 * @returns {Promise<CryptoKey|null>}
 */
export async function loadVaultSession(userId) {
  if (sessionStorage.getItem(VAULT_SESSION_USER) !== userId) return null

  // Auto-lock is inactivity-based, so VAULT_UNLOCKED_AT_KEY holds the last
  // activity time. Expire the restored session if it's older than the chosen
  // duration ("Never" -> lockMs is null -> never expires on restore).
  const lockMs = autoLockMs()
  const unlockedAt = Number(sessionStorage.getItem(VAULT_UNLOCKED_AT_KEY))
  const id = sessionStorage.getItem(VAULT_SESSION_ID)
  const wrapB64 = sessionStorage.getItem(VAULT_SESSION_WRAP)
  if (!unlockedAt || !id || !wrapB64 || (lockMs != null && Date.now() - unlockedAt > lockMs)) {
    clearVaultSession()
    return null
  }

  try {
    const entry = await withStore('readonly', store => store.get(id))
    if (!entry?.wrapped) {
      clearVaultSession()
      return null
    }
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: entry.iv },
      await importAesKey(bytesFromBase64(wrapB64)),
      entry.wrapped
    )
    return await importAesKey(raw)
  } catch {
    clearVaultSession()
    return null
  }
}
