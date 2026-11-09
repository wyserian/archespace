/**
 * vaultAutoLock.js - Per-device vault auto-lock preference.
 *
 * The chosen duration is stored in localStorage (a per-device security
 * preference, not synced), keyed by option id from VAULT_AUTO_LOCK_OPTIONS.
 * Auto-lock is inactivity-based: the timer resets on user interaction and
 * fires after the chosen idle duration. `null` ms means "Never".
 */
import {
  VAULT_AUTO_LOCK_OPTIONS,
  VAULT_AUTO_LOCK_DEFAULT_ID,
} from '../constants'

const AUTO_LOCK_KEY = 'arche:vault-auto-lock'

/** @returns {string} the stored option id, or the default if unset/invalid. */
export function getAutoLockId() {
  try {
    const id = localStorage.getItem(AUTO_LOCK_KEY)
    return VAULT_AUTO_LOCK_OPTIONS.some(o => o.id === id)
      ? id
      : VAULT_AUTO_LOCK_DEFAULT_ID
  } catch {
    return VAULT_AUTO_LOCK_DEFAULT_ID
  }
}

/** Persist the chosen option id (ignores unknown ids). */
export function setAutoLockId(id) {
  if (!VAULT_AUTO_LOCK_OPTIONS.some(o => o.id === id)) return
  try {
    localStorage.setItem(AUTO_LOCK_KEY, id)
  } catch {
    // Storage unavailable (private mode); the in-memory choice still applies
    // for this session.
  }
}

const SCREEN_LOCK_KEY = 'arche:vault-lock-on-screen-lock'

/** Whether this browser can tell when the OS screen locks (Chromium only). */
export const screenLockSupported = typeof window !== 'undefined' && 'IdleDetector' in window

/** @returns {boolean} whether to lock the vault when the screen locks (off by default). */
export function getLockOnScreenLock() {
  try {
    return localStorage.getItem(SCREEN_LOCK_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist the lock-on-screen-lock choice. */
export function setLockOnScreenLock(on) {
  try {
    if (on) localStorage.setItem(SCREEN_LOCK_KEY, '1')
    else localStorage.removeItem(SCREEN_LOCK_KEY)
  } catch {
    // Storage unavailable; the in-memory choice still applies this session.
  }
}

/**
 * Resolve an option id to its duration in ms.
 * @param {string} [id]
 * @returns {number|null} milliseconds, or null for "Never".
 */
export function autoLockMs(id = getAutoLockId()) {
  const opt = VAULT_AUTO_LOCK_OPTIONS.find(o => o.id === id)
  return opt ? opt.ms : null
}
