/**
 * EncryptionContext.jsx - In-memory vault master key for client-side E2E encryption.
 *
 * The master AES key is unlocked with a vault PIN (independent of the login
 * password). While signed in, the unlocked key is kept in sessionStorage so a
 * refresh doesn't ask for the PIN again until the vault locks.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from './AuthContextCore'
import { EncryptionContext } from './EncryptionCore'
import {
  setupUserVault,
  resetUserVault,
  unlockUserVault,
  changeVaultPinWithVerification,
  createVaultRecoveryCode,
  recoverVaultWithRecoveryCode,
  getVaultStatus,
  warmVaultMetaCache,
} from '../lib/crypto/vault'
import {
  saveVaultSession,
  loadVaultSession,
  clearVaultSession,
  VAULT_UNLOCKED_AT_KEY,
} from '../lib/crypto/vaultSession'
import { isPasskeySupported } from '../lib/crypto/passkey'
import {
  listPasskeys,
  enrollPasskey as enrollPasskeyVault,
  unlockVaultWithPasskey,
  removePasskey as removePasskeyVault,
} from '../lib/crypto/passkeyVault'
import { VAULT_PIN_LOCKOUT_MS, VAULT_PIN_MAX_ATTEMPTS } from '../lib/constants'
import { createWelcomeSpace } from '../lib/welcomeSpace'
import { getAutoLockId, setAutoLockId, autoLockMs } from '../lib/crypto/vaultAutoLock'
import {
  getClientRateLimitStatus,
  recordClientRateLimitFailure,
  clearClientRateLimit,
} from '../lib/rateLimiter'
import { logAudit } from '../lib/auditLog'
import { hideAllItems } from '../lib/itemLock'

const VAULT_STATUS_TIMEOUT_MS = 8000
const VAULT_SESSION_RESTORE_TIMEOUT_MS = 4000

function withTimeout(promise, ms, message) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export function EncryptionProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const [cryptoKey, setCryptoKey] = useState(null)
  const [unlocking, setUnlocking] = useState(false)
  const [sessionRestoring, setSessionRestoring] = useState(true)
  const [unlockError, setUnlockError] = useState('')
  const [vaultStatus, setVaultStatus] = useState({
    loading: true,
    hasVault: false,
  })
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeys, setPasskeys] = useState([])
  const [autoLockId, setAutoLockIdState] = useState(getAutoLockId())

  const setAutoLock = useCallback((id) => {
    setAutoLockId(id)
    setAutoLockIdState(id)
  }, [])

  const refreshVaultStatus = useCallback(async () => {
    if (!userId) {
      setVaultStatus({ loading: false, hasVault: false })
      return
    }
    setVaultStatus(s => ({ ...s, loading: true }))
    try {
      const status = await withTimeout(
        getVaultStatus(userId),
        VAULT_STATUS_TIMEOUT_MS,
        'Vault status check timed out.'
      )
      setVaultStatus({ loading: false, ...status })
    } catch (error) {
      console.warn('Failed to check vault status:', error)
      setVaultStatus({ loading: false, hasVault: true })
    }
  }, [userId])

  useEffect(() => {
    const timer = setTimeout(refreshVaultStatus, 0)
    return () => clearTimeout(timer)
  }, [refreshVaultStatus])

  // Keep the cached vault meta fresh while online so a later offline PIN unlock
  // works even if the user stayed unlocked via the restored session this time.
  useEffect(() => {
    if (userId) warmVaultMetaCache(userId)
  }, [userId])

  // Detect platform-authenticator (biometric) support once on mount.
  useEffect(() => {
    let active = true
    isPasskeySupported().then(supported => {
      if (active) setPasskeySupported(supported)
    })
    return () => { active = false }
  }, [])

  const refreshPasskeys = useCallback(async () => {
    if (!userId) {
      setPasskeys([])
      return
    }
    try {
      setPasskeys(await listPasskeys(userId))
    } catch (error) {
      console.warn('Failed to load passkeys:', error)
      setPasskeys([])
    }
  }, [userId])

  useEffect(() => {
    const timer = setTimeout(refreshPasskeys, 0)
    return () => clearTimeout(timer)
  }, [refreshPasskeys])

  const lock = useCallback((reason) => {
    clearVaultSession()
    hideAllItems() // opened locked items need the PIN again
    setCryptoKey(null)
    setUnlockError('')
    // `reason` is a string for programmatic calls ('auto'); when lock is
    // wired directly to an onClick it receives an event, so default to 'manual'.
    logAudit({ action: 'vault_lock', details: { reason: typeof reason === 'string' ? reason : 'manual' } })
  }, [])

  const applyUnlockedKey = useCallback(async (key) => {
    if (userId) await saveVaultSession(userId, key)
    setCryptoKey(key)
  }, [userId])

  const unlock = useCallback(async (pin) => {
    if (!userId) throw new Error('Not signed in')

    const rateKey = `vault-unlock:${userId}`
    const status = getClientRateLimitStatus(rateKey, VAULT_PIN_MAX_ATTEMPTS)
    if (status.blocked) {
      const msg = `Too many failed PIN attempts. Try again in ${status.retryAfter} seconds.`
      setUnlockError(msg)
      throw new Error(msg)
    }

    setUnlocking(true)
    setUnlockError('')
    try {
      const key = await unlockUserVault(userId, pin)
      clearClientRateLimit(rateKey)
      await applyUnlockedKey(key)
      logAudit({ action: 'vault_unlock' })
      return key
    } catch (err) {
      const msg = err?.message || "Couldn't unlock vault."
      if (msg.includes('Incorrect PIN') || msg.includes('cannot unlock')) {
        recordClientRateLimitFailure(rateKey, VAULT_PIN_MAX_ATTEMPTS, VAULT_PIN_LOCKOUT_MS)
      }
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, applyUnlockedKey])

  // Verify a re-entered PIN without changing session state (before a sensitive
  // action, such as opening a protected item). Shares the unlock rate limiter
  // and server lockout, so a wrong PIN here counts like a wrong unlock.
  const verifyVaultPin = useCallback(async (pin) => {
    if (!userId) return false
    const rateKey = `vault-unlock:${userId}`
    const status = getClientRateLimitStatus(rateKey, VAULT_PIN_MAX_ATTEMPTS)
    if (status.blocked) {
      throw new Error(`Too many failed PIN attempts. Try again in ${status.retryAfter} seconds.`)
    }
    try {
      await unlockUserVault(userId, pin)
      clearClientRateLimit(rateKey)
      return true
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('Incorrect PIN') || msg.includes('cannot unlock')) {
        recordClientRateLimitFailure(rateKey, VAULT_PIN_MAX_ATTEMPTS, VAULT_PIN_LOCKOUT_MS)
        return false
      }
      throw err
    }
  }, [userId])

  // Unlock the vault with an enrolled passkey (biometric prompt). Falls back to
  // PIN on any failure; the PIN path and recovery code remain the source of truth.
  const unlockWithPasskey = useCallback(async () => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const key = await unlockVaultWithPasskey(userId)
      await applyUnlockedKey(key)
      logAudit({ action: 'vault_unlock', details: { method: 'passkey' } })
      return key
    } catch (err) {
      const msg = err?.message || "Couldn't unlock with passkey."
      setUnlockError(msg)
      // A stale passkey is removed on the way out: stop offering it.
      refreshPasskeys()
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, applyUnlockedKey, refreshPasskeys])

  // Enroll a passkey. Re-verifies the current PIN to obtain an exportable master
  // key (mirrors recovery-code setup), then wraps it with the passkey's PRF secret.
  const enrollPasskey = useCallback(async (pin, label) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const key = await enrollPasskeyVault(userId, pin, user?.email || 'ArcheSpace vault', label)
      await applyUnlockedKey(key)
      await refreshPasskeys()
      logAudit({ action: 'vault_passkey_enroll' })
    } catch (err) {
      const msg = err?.message || "Couldn't add passkey."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, user, applyUnlockedKey, refreshPasskeys])

  const removePasskey = useCallback(async (id) => {
    if (!userId) throw new Error('Not signed in')
    await removePasskeyVault(id)
    await refreshPasskeys()
    logAudit({ action: 'vault_passkey_remove' })
  }, [userId, refreshPasskeys])

  // Create the vault but do NOT unlock yet: the caller shows the one-time
  // recovery code first and calls commitVaultKey() once it is acknowledged.
  const setup = useCallback(async (pin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const result = await setupUserVault(userId, pin)
      logAudit({ action: 'vault_setup' })
      // A brand-new account starts with a short tour (never after a reset).
      await createWelcomeSpace(userId, result.masterKey)
      return result
    } catch (err) {
      const msg = err?.message || "Couldn't set up vault."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId])

  // Reset the vault (both PIN and recovery code lost): wipe all encrypted data
  // and the vault row, drop old passkeys (they wrapped the destroyed key), then
  // create a fresh vault. Unlock is deferred until the new recovery code is
  // acknowledged (like setup). The caller must re-verify the account password.
  const resetVault = useCallback(async (pin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const result = await resetUserVault(userId, pin)
      // Old passkeys wrapped the now-destroyed master key; remove them locally.
      try {
        const existing = await listPasskeys(userId)
        for (const pk of existing) await removePasskeyVault(pk.id)
      } catch {
        // Best-effort; a stale local passkey just fails to unlock later.
      }
      await refreshPasskeys()
      logAudit({ action: 'vault_reset' })
      return result
    } catch (err) {
      const msg = err?.message || "Couldn't reset the vault."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, refreshPasskeys])

  // Apply an unlocked master key and refresh status. Called after the recovery
  // code is acknowledged (setup / recover) or directly when there is no code.
  const commitVaultKey = useCallback(async (key) => {
    await applyUnlockedKey(key)
    await refreshVaultStatus()
  }, [applyUnlockedKey, refreshVaultStatus])

  const updatePin = useCallback(async (currentPin, newPin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const key = await changeVaultPinWithVerification(userId, currentPin, newPin)
      await applyUnlockedKey(key)
      logAudit({ action: 'vault_pin_change' })
    } catch (err) {
      const msg = err?.message || "Couldn't change PIN."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, applyUnlockedKey])

  const setupRecoveryCode = useCallback(async (currentPin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const { masterKey, recoveryCode } = await createVaultRecoveryCode(userId, currentPin)
      await applyUnlockedKey(masterKey)
      logAudit({ action: 'recovery_code_created' })
      return { recoveryCode }
    } catch (err) {
      const msg = err?.message || "Couldn't set up recovery code."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, applyUnlockedKey])

  const updatePinWithRecoveryCode = useCallback(async (recoveryCode, newPin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const { masterKey, recoveryCode: nextRecoveryCode } =
        await recoverVaultWithRecoveryCode(userId, recoveryCode, newPin)
      await applyUnlockedKey(masterKey)
      logAudit({ action: 'vault_pin_reset' })
      return { recoveryCode: nextRecoveryCode }
    } catch (err) {
      const msg = err?.message || "Couldn't change PIN."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId, applyUnlockedKey])

  const recoverPinWithCode = useCallback(async (recoveryCode, newPin) => {
    if (!userId) throw new Error('Not signed in')
    setUnlocking(true)
    setUnlockError('')
    try {
      const { masterKey, recoveryCode: nextRecoveryCode } =
        await recoverVaultWithRecoveryCode(userId, recoveryCode, newPin)
      logAudit({ action: 'vault_pin_reset' })
      // Unlock is deferred until the new recovery code is acknowledged.
      return { masterKey, recoveryCode: nextRecoveryCode }
    } catch (err) {
      const msg = err?.message || "Couldn't recover vault PIN."
      setUnlockError(msg)
      throw err
    } finally {
      setUnlocking(false)
    }
  }, [userId])

  // Wait for auth to load before clearing or restoring the vault session: the
  // user is briefly null on refresh, and clearing then would lose the session.
  useEffect(() => {
    if (authLoading) return

    if (!userId) {
      clearVaultSession()
      hideAllItems()
      const timer = setTimeout(() => {
        setCryptoKey(null)
        setSessionRestoring(false)
      }, 0)
      return () => clearTimeout(timer)
    }

    let cancelled = false
    const restoringTimer = setTimeout(() => {
      if (!cancelled) setSessionRestoring(true)
    }, 0)
    withTimeout(
      loadVaultSession(userId),
      VAULT_SESSION_RESTORE_TIMEOUT_MS,
      'Vault session restore timed out.'
    )
      .catch((error) => {
        console.warn('Failed to restore vault session:', error)
        clearVaultSession()
        return null
      })
      .then(key => {
        if (cancelled) return
        clearTimeout(restoringTimer)
        if (key) setCryptoKey(key)
        setSessionRestoring(false)
      })
    return () => {
      cancelled = true
      clearTimeout(restoringTimer)
    }
  }, [userId, authLoading])

  const lockRef = useRef(lock)

  useEffect(() => {
    lockRef.current = lock
  }, [lock])

  // Inactivity-based auto-lock. The timer resets on user interaction and fires
  // after the chosen idle duration. VAULT_UNLOCKED_AT_KEY holds the last
  // activity time so a page reload picks up where the idle clock left off.
  useEffect(() => {
    if (!cryptoKey) return

    const lockMs = autoLockMs(autoLockId)
    if (lockMs == null) return // "Never"

    const doLock = () => {
      lockRef.current('auto')
      window.dispatchEvent(new CustomEvent('arche:vault-auto-locked'))
    }

    const stored = sessionStorage.getItem(VAULT_UNLOCKED_AT_KEY)
    const lastActive = stored ? Number(stored) : Date.now()
    if (!stored) sessionStorage.setItem(VAULT_UNLOCKED_AT_KEY, String(lastActive))

    const remaining = lockMs - (Date.now() - lastActive)
    if (remaining <= 0) {
      doLock()
      return
    }

    let timer = setTimeout(doLock, remaining)

    // Reset on activity, throttled so continuous input (e.g. mousemove) doesn't
    // rewrite storage / reschedule on every event.
    let lastMark = lastActive
    const onActivity = () => {
      const now = Date.now()
      if (now - lastMark < 10000) return
      lastMark = now
      sessionStorage.setItem(VAULT_UNLOCKED_AT_KEY, String(now))
      clearTimeout(timer)
      timer = setTimeout(doLock, lockMs)
    }

    const events = ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart']
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, onActivity))
    }
  }, [cryptoKey, autoLockId])

  const isUnlocked = !!cryptoKey && !!user

  return (
    <EncryptionContext.Provider
      value={{
        cryptoKey,
        isUnlocked,
        unlocking,
        sessionRestoring,
        unlockError,
        vaultStatus,
        unlock,
        commitVaultKey,
        verifyVaultPin,
        setup,
        resetVault,
        updatePin,
        setupRecoveryCode,
        updatePinWithRecoveryCode,
        recoverPinWithCode,
        lock,
        refreshVaultStatus,
        autoLockId,
        setAutoLock,
        passkeySupported,
        passkeys,
        unlockWithPasskey,
        enrollPasskey,
        removePasskey,
        refreshPasskeys,
        clearUnlockError: () => setUnlockError(''),
      }}
    >
      {children}
    </EncryptionContext.Provider>
  )
}
