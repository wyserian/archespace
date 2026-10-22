/**
 * vault.js - Per-user vault setup / unlock (Supabase user_encryption row).
 *
 * New vaults use a random master key wrapped with a PIN-derived key.
 * A separate one-time recovery code can also wrap the same master key.
 */
import { supabase } from '../supabase'
import { isOnline } from '../offlineQueue'
import { isNetworkError, setReachable } from '../connectivity'
import { encryptString, decryptString } from './cipher'
import { deriveVaultKey, isLegacySaltDescriptor, newSaltDescriptor } from './keyDerivation'
import { validateVaultPin } from './vaultPin'
import { bytesFromBase64, bytesToBase64 } from './encoding'
import {
  generateRecoveryCode,
  normalizeRecoveryCode,
  validateRecoveryCode,
} from './recoveryCode'

const VAULT_CHECK_PLAINTEXT = 'ARCHE_VAULT_V1_OK'

/** A new PIN meets the rules. */
function assertValidPin(pin) {
  const err = validateVaultPin(pin)
  if (err) throw new Error(err)
}

/** An existing PIN only needs to be there: one set under an older, shorter
 *  minimum still unlocks, and a wrong one fails to decrypt anyway. */
function assertPinEntered(pin) {
  if (!pin) throw new Error('Enter your vault PIN.')
}

// Cache the vault meta so a PIN unlock works offline. The stored fields are
// non-sensitive - public salts plus the PIN/recovery-wrapped ciphertext and a
// verifier - all useless without the PIN itself, so localStorage is acceptable.
const VAULT_META_CACHE_PREFIX = 'arche:vault-meta:'

function cacheVaultMeta(userId, meta) {
  try {
    if (userId && meta) {
      localStorage.setItem(VAULT_META_CACHE_PREFIX + userId, JSON.stringify(meta))
    }
  } catch {
    // Storage unavailable - offline unlock just won't be possible.
  }
}

function readCachedVaultMeta(userId) {
  try {
    const raw = localStorage.getItem(VAULT_META_CACHE_PREFIX + userId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearCachedVaultMeta(userId) {
  try {
    if (userId) localStorage.removeItem(VAULT_META_CACHE_PREFIX + userId)
  } catch {
    // Storage unavailable - nothing to clear.
  }
}

export async function importRawAesKey(rawBytes) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function exportRawAesKey(key) {
  const buf = await crypto.subtle.exportKey('raw', key)
  return new Uint8Array(buf)
}

async function generateMasterKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * @param {string} userId
 * @returns {Promise<{ hasVault: boolean }>}
 */
export async function getVaultStatus(userId) {
  const { data, error } = await supabase
    .from('user_encryption')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return { hasVault: !!data }
}

/**
 * Best-effort: refresh the cached vault meta while online so a later offline
 * PIN unlock works even if the user never re-entered their PIN online this
 * session (they may have stayed unlocked via the restored session key).
 * @param {string} userId
 */
export async function warmVaultMetaCache(userId) {
  if (!userId || !isOnline()) return
  try {
    await fetchVaultMeta(userId)
  } catch {
    // Offline / unreachable - nothing to warm.
  }
}

/**
 * @param {string} userId
 */
async function fetchVaultMeta(userId) {
  try {
    const { data, error } = await supabase
      .from('user_encryption')
      .select('user_id, salt, key_check, wrapped_key, recovery_salt, recovery_wrapped_key')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    setReachable(true)
    cacheVaultMeta(userId, data) // enable offline PIN unlock next time
    return data
  } catch (err) {
    // Unlock from the cached meta when the server is unreachable so the PIN
    // still works locally. Key off the real failure, not navigator.onLine,
    // which can wrongly report "online" (LAN with no internet, server down).
    if (isNetworkError(err)) {
      setReachable(false)
      const cached = readCachedVaultMeta(userId)
      if (cached) return cached
    }
    throw err
  }
}

async function assertVaultUnlockAllowed() {
  // Offline / unreachable: the server lockout check can't run; the client-side
  // rate limiter in EncryptionContext still guards against brute force.
  if (!isOnline()) return
  let data, error
  try {
    ;({ data, error } = await supabase.rpc('get_vault_pin_lock_status'))
  } catch (err) {
    if (isNetworkError(err)) { setReachable(false); return }
    throw err
  }
  if (error) {
    console.warn('Failed to check the vault PIN lockout:', error.message)
    return
  }
  if (data?.locked) {
    throw new Error(formatPinLockoutMessage(data.retry_after_seconds || 300))
  }
}

function formatPinLockoutMessage(retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Too many failed PIN attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}

async function recordVaultUnlockFailure() {
  if (!isOnline()) return
  try {
    const { error } = await supabase.rpc('record_vault_pin_unlock_failure')
    if (error) console.warn('Failed to record vault PIN failure:', error.message)
  } catch (err) {
    // Never let a bookkeeping RPC break unlock when the server is unreachable.
    if (isNetworkError(err)) setReachable(false)
    else console.warn('Failed to record vault PIN failure:', err?.message)
  }
}

async function recordVaultUnlockSuccess() {
  if (!isOnline()) return
  try {
    const { error } = await supabase.rpc('record_vault_pin_unlock_success')
    if (error) console.warn('Failed to reset vault PIN attempts:', error.message)
  } catch (err) {
    if (isNetworkError(err)) setReachable(false)
    else console.warn('Failed to reset vault PIN attempts:', err?.message)
  }
}

function isIncorrectPinError(err) {
  const msg = err?.message || ''
  return msg.includes('Incorrect PIN') || msg.includes('cannot unlock')
}

/**
 * Create a new PIN-protected vault for a new user.
 * @param {string} userId
 * @param {string} pin
 */
export async function setupUserVault(userId, pin) {
  assertValidPin(pin)
  // Safety net: never overwrite an existing vault. If a row already exists this
  // is an unlock situation misread as first-run setup - replacing the master key
  // would lock the user out of all their data. Fail closed (a read error also
  // aborts, rather than risk an overwrite).
  const existing = await fetchVaultMeta(userId)
  if (existing && (existing.wrapped_key || existing.key_check)) {
    throw new Error('A vault already exists for this account. Reload and unlock with your PIN.')
  }
  const masterKey = await generateMasterKey()
  const recoveryCode = generateRecoveryCode()
  await persistPinWrappedVault(userId, pin, masterKey, { recoveryCode })
  return { masterKey, recoveryCode }
}

/**
 * Reset the vault when BOTH the PIN and the recovery code are lost. Permanently
 * deletes all encrypted content and the vault metadata (the data is
 * unrecoverable without the key - that is the point), then creates a fresh
 * PIN-protected vault and a new recovery code. Callers MUST re-verify the
 * account password before invoking this.
 * @param {string} userId
 * @param {string} pin
 */
export async function resetUserVault(userId, pin) {
  assertValidPin(pin)
  // Delete all encrypted content. space_items cascade from spaces, but delete
  // both explicitly so nothing is left behind if a cascade/RLS quirk skips them.
  const { error: itemsError } = await supabase.from('space_items').delete().eq('user_id', userId)
  if (itemsError) throw itemsError
  const { error: spacesError } = await supabase.from('spaces').delete().eq('user_id', userId)
  if (spacesError) throw spacesError
  // Drop the old (now unusable) vault row so setup can create a fresh one.
  const { error: vaultError } = await supabase.from('user_encryption').delete().eq('user_id', userId)
  if (vaultError) throw vaultError
  clearCachedVaultMeta(userId)
  // Create a brand-new vault + recovery code.
  return setupUserVault(userId, pin)
}

/**
 * Unlock with vault PIN.
 * @param {string} userId
 * @param {string} pin
 */
export async function unlockUserVault(userId, pin) {
  assertPinEntered(pin)
  await assertVaultUnlockAllowed()
  const meta = await fetchVaultMeta(userId)
  if (!meta) {
    throw new Error('No vault PIN configured. Create a PIN to continue.')
  }
  try {
    const key = await unlockPinWrappedVault(meta, pin)
    await recordVaultUnlockSuccess()
    await upgradeLegacyPinSalt(userId, pin, key, meta)
    return key
  } catch (err) {
    if (isIncorrectPinError(err)) {
      await recordVaultUnlockFailure()
    }
    throw err
  }
}

/**
 * Change vault PIN (verifies current PIN first).
 */
export async function changeVaultPinWithVerification(userId, currentPin, newPin) {
  assertValidPin(newPin)
  await assertVaultUnlockAllowed()
  try {
    const meta = await fetchVaultMeta(userId)
    if (!meta) throw new Error('No vault PIN configured.')
    const masterKey = await unlockPinWrappedVault(meta, currentPin)
    await recordVaultUnlockSuccess()
    await persistPinWrappedVault(userId, newPin, masterKey)
    return masterKey
  } catch (err) {
    if (isIncorrectPinError(err)) {
      await recordVaultUnlockFailure()
    }
    throw err
  }
}

/**
 * Add or replace the one-time recovery code after verifying the current PIN.
 */
export async function createVaultRecoveryCode(userId, currentPin) {
  assertPinEntered(currentPin)
  await assertVaultUnlockAllowed()
  try {
    const meta = await fetchVaultMeta(userId)
    if (!meta) throw new Error('No vault PIN configured.')
    const masterKey = await unlockPinWrappedVault(meta, currentPin)
    const recoveryCode = generateRecoveryCode()
    await persistRecoveryWrappedVault(userId, masterKey, recoveryCode)
    await recordVaultUnlockSuccess()
    return { masterKey, recoveryCode }
  } catch (err) {
    if (isIncorrectPinError(err)) {
      await recordVaultUnlockFailure()
    }
    throw err
  }
}

/**
 * Recover the master key with the one-time recovery code, then set a new PIN.
 */
export async function recoverVaultWithRecoveryCode(userId, recoveryCode, newPin) {
  assertValidPin(newPin)
  const codeErr = validateRecoveryCode(recoveryCode)
  if (codeErr) throw new Error(codeErr)

  const meta = await fetchVaultMeta(userId)
  if (!meta) throw new Error('No vault PIN configured.')
  if (!meta.recovery_salt || !meta.recovery_wrapped_key) {
    throw new Error('No recovery code is configured for this vault.')
  }

  try {
    const masterKey = await unlockRecoveryWrappedVault(meta, recoveryCode)
    const nextRecoveryCode = generateRecoveryCode()
    await persistPinWrappedVault(userId, newPin, masterKey, { recoveryCode: nextRecoveryCode })
    await recordVaultUnlockSuccess()
    return { masterKey, recoveryCode: nextRecoveryCode }
  } catch (err) {
    throw new Error(
      err?.message || 'Recovery code could not unlock your vault.',
      { cause: err }
    )
  }
}

/**
 * A vault made before Argon2id (PBKDF2 salt) is re-wrapped with Argon2id the
 * first time its PIN opens it. Only the wrapped key changes, so the content is
 * untouched. Best effort: if it can't be saved now (offline), the next unlock
 * tries again.
 */
async function upgradeLegacyPinSalt(userId, pin, masterKey, meta) {
  if (!isLegacySaltDescriptor(meta.salt)) return
  try {
    await persistPinWrappedVault(userId, pin, masterKey)
  } catch (err) {
    console.warn('Could not move the vault to Argon2id yet:', err?.message)
  }
}

async function persistPinWrappedVault(userId, pin, masterKey, { recoveryCode = '' } = {}) {
  const pinSalt = newSaltDescriptor()
  const pinKey = await deriveVaultKey(pin, pinSalt)
  const raw = await exportRawAesKey(masterKey)
  const wrappedKey = await encryptString(bytesToBase64(raw), pinKey)
  const keyCheck = await encryptString(VAULT_CHECK_PLAINTEXT, masterKey)

  const payload = {
    user_id: userId,
    salt: pinSalt,
    key_check: keyCheck,
    wrapped_key: wrappedKey,
  }

  if (recoveryCode) {
    const normalizedCode = normalizeRecoveryCode(recoveryCode)
    const recoverySalt = newSaltDescriptor()
    const recoveryKey = await deriveVaultKey(normalizedCode, recoverySalt)
    payload.recovery_salt = recoverySalt
    payload.recovery_wrapped_key = await encryptString(bytesToBase64(raw), recoveryKey)
  }

  const { error } = await supabase.from('user_encryption').upsert(payload)
  if (error) throw error
  cacheVaultMeta(userId, payload) // so a freshly set PIN can unlock offline
}

async function persistRecoveryWrappedVault(userId, masterKey, recoveryCode) {
  const raw = await exportRawAesKey(masterKey)
  const normalizedCode = normalizeRecoveryCode(recoveryCode)
  const recoverySalt = newSaltDescriptor()
  const recoveryKey = await deriveVaultKey(normalizedCode, recoverySalt)
  const payload = {
    recovery_salt: recoverySalt,
    recovery_wrapped_key: await encryptString(bytesToBase64(raw), recoveryKey),
  }

  const { error } = await supabase
    .from('user_encryption')
    .update(payload)
    .eq('user_id', userId)
  if (error) throw error
}

async function unlockRecoveryWrappedVault(meta, recoveryCode) {
  const recoveryKey = await deriveVaultKey(normalizeRecoveryCode(recoveryCode), meta.recovery_salt)
  const rawB64 = await decryptString(meta.recovery_wrapped_key, recoveryKey)
  const masterKey = await importRawAesKey(bytesFromBase64(rawB64))
  const check = await decryptString(meta.key_check, masterKey)
  if (check !== VAULT_CHECK_PLAINTEXT) {
    throw new Error('Recovery code could not unlock your vault.')
  }
  return masterKey
}

/**
 * The vault's PIN-wrapped key, for an encrypted backup to carry: the same
 * values the server stores (public salt plus ciphertext), useless without
 * the PIN. Uses the offline copy when the server can't be reached.
 * @param {string} userId
 * @returns {Promise<{ salt: string, wrapped_key: string, key_check: string }>}
 */
export async function getVaultBackupMeta(userId) {
  const meta = await fetchVaultMeta(userId)
  if (!meta?.wrapped_key) throw new Error('No vault PIN configured.')
  return { salt: meta.salt, wrapped_key: meta.wrapped_key, key_check: meta.key_check }
}

/**
 * Unwrap a vault key from its PIN-wrapped form (a backup's `vault` block).
 * Throws 'Incorrect PIN...' when the PIN doesn't open it.
 */
export async function unwrapVaultKey(meta, pin) {
  return unlockPinWrappedVault(meta, pin)
}

async function unlockPinWrappedVault(meta, pin) {
  const pinKey = await deriveVaultKey(pin, meta.salt)
  let rawB64
  try {
    rawB64 = await decryptString(meta.wrapped_key, pinKey)
  } catch {
    // A wrong PIN makes AES-GCM decryption throw (OperationError) rather than
    // reaching the key_check below. Normalise it to the incorrect-PIN error so
    // callers (server RPC + client rate limiter) record the failed attempt.
    throw new Error('Incorrect PIN - cannot unlock your encrypted vault.')
  }
  const masterKey = await importRawAesKey(bytesFromBase64(rawB64))
  const check = await decryptString(meta.key_check, masterKey)
  if (check !== VAULT_CHECK_PLAINTEXT) {
    throw new Error('Incorrect PIN - cannot unlock your encrypted vault.')
  }
  return masterKey
}

