/**
 * VaultUnlockGate.jsx - Post-login vault PIN unlock or setup.
 */
import { useState } from 'react'
import { Lock, Fingerprint, Check, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import PinInput from './PinInput'
import { VAULT_PIN_MIN_LENGTH } from '../lib/constants'
import { validateVaultPin, getWeakPinWarning } from '../lib/crypto/vaultPin'
import WeakPinWarning from './WeakPinWarning'
import { ConfirmDialog, Spinner } from './ui/UI'
import RecoveryCodeDialog from './RecoveryCodeDialog'
import { buttonClass } from './ui/buttonStyles'
import { isLocalMode, SIGN_OUT_TEXT } from '../lib/localMode'

// Local mode has no account, so no account password to re-check.
const LOCAL = isLocalMode()

export default function VaultUnlockGate({ children }) {
  const { user, signIn, signOut, loading: authLoading } = useAuth()
  const {
    isUnlocked,
    unlock,
    setup,
    resetVault,
    commitVaultKey,
    recoverPinWithCode,
    unlocking,
    unlockError,
    vaultStatus,
    sessionRestoring,
    clearUnlockError,
    passkeySupported,
    passkeys,
    unlockWithPasskey,
    enrollPasskey,
  } = useEncryption()

  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [oneTimeRecoveryCode, setOneTimeRecoveryCode] = useState('')
  const [forgotPin, setForgotPin] = useState(false)
  // "Lost recovery code too" destructive reset: wipe data and start fresh.
  const [resetMode, setResetMode] = useState(false)
  const [accountPassword, setAccountPassword] = useState('')
  const [resetConfirmed, setResetConfirmed] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  // Which action is running, so only its button shows a spinner (not all).
  const [pendingAction, setPendingAction] = useState(null) // 'passkey' | 'pin' | null
  // When set (to the just-used PIN), show the "enable biometric unlock?" prompt
  // before letting the unlocked app through.
  const [pendingEnrollPin, setPendingEnrollPin] = useState('')
  const [enrollError, setEnrollError] = useState('')
  // Master key held between vault setup/recover and the user acknowledging the
  // one-time recovery code. The vault only unlocks (commitVaultKey) once the
  // code is saved, so an early "unlocked" render can't skip the recovery screen.
  const [pendingUnlockKey, setPendingUnlockKey] = useState(null)
  // True while an unlock/setup/recover call runs and until the next screen is
  // chosen: unlock() sets isUnlocked mid-call, before the recovery-code or
  // biometric prompt is set, so without it the gate would briefly show
  // `children`.
  const [awaitingVaultResult, setAwaitingVaultResult] = useState(false)

  if (!user) return children
  if (authLoading || vaultStatus.loading || sessionRestoring) {
    return (
      <div className="min-h-[100svh] bg-bg-base flex flex-col items-center justify-center gap-3">
        <Spinner size={22} />
        <p className="text-text-muted text-sm">Loading vault...</p>
      </div>
    )
  }
  if (isUnlocked && !oneTimeRecoveryCode && !pendingEnrollPin && !awaitingVaultResult) return children

  // Offer biometric enrollment only when the device supports it and none is
  // enrolled yet.
  const canOfferBiometric = passkeySupported && passkeys.length === 0

  const needsSetup = !vaultStatus.hasVault

  const resetFields = () => {
    setPin('')
    setConfirmPin('')
    setRecoveryCodeInput('')
    setAccountPassword('')
    setResetConfirmed(false)
    setFormError('')
  }

  const leaveResetMode = () => {
    setResetMode(false)
    resetFields()
    clearUnlockError()
  }

  const handleUnlock = async (e) => {
    e.preventDefault()
    clearUnlockError()
    setFormError('')
    if (!pin) {
      setFormError('Enter your vault PIN.')
      return
    }
    try {
      setPendingAction('pin')
      setAwaitingVaultResult(true)
      const enteredPin = pin
      await unlock(enteredPin)
      if (canOfferBiometric) setPendingEnrollPin(enteredPin)
      resetFields()
    } catch {
      // unlockError set in context
    } finally {
      setPendingAction(null)
      setAwaitingVaultResult(false)
    }
  }

  const handlePasskeyUnlock = async () => {
    clearUnlockError()
    setFormError('')
    try {
      setPendingAction('passkey')
      await unlockWithPasskey()
      resetFields()
    } catch {
      // unlockError set in context
    } finally {
      setPendingAction(null)
    }
  }

  const handleSetup = async (e) => {
    e.preventDefault()
    clearUnlockError()
    setFormError('')
    const err = validateVaultPin(pin)
    if (err) {
      setFormError(err)
      return
    }
    if (pin !== confirmPin) {
      setFormError('PINs do not match.')
      return
    }
    try {
      setPendingAction('pin')
      setAwaitingVaultResult(true)
      const enteredPin = pin
      const { masterKey, recoveryCode } = await setup(enteredPin)
      // Offer biometric enrollment after the recovery screen (render priority).
      if (canOfferBiometric) setPendingEnrollPin(enteredPin)
      // Hold the key and show the code; unlock happens on "I saved this code".
      setPendingUnlockKey(masterKey)
      setOneTimeRecoveryCode(recoveryCode)
      resetFields()
    } catch {
      // unlockError set in context
    } finally {
      setPendingAction(null)
      setAwaitingVaultResult(false)
    }
  }

  const handleRecover = async (e) => {
    e.preventDefault()
    clearUnlockError()
    setFormError('')
    if (!recoveryCodeInput.trim()) {
      setFormError('Enter your recovery code.')
      return
    }
    const err = validateVaultPin(pin)
    if (err) {
      setFormError(err)
      return
    }
    if (pin !== confirmPin) {
      setFormError('PINs do not match.')
      return
    }
    try {
      setPendingAction('pin')
      setAwaitingVaultResult(true)
      const { masterKey, recoveryCode } = await recoverPinWithCode(recoveryCodeInput, pin)
      // Hold the key; unlock on "I saved this code" so the new code always shows.
      setPendingUnlockKey(masterKey)
      setOneTimeRecoveryCode(recoveryCode)
      setForgotPin(false)
      resetFields()
    } catch {
      // unlockError set in context
    } finally {
      setPendingAction(null)
      setAwaitingVaultResult(false)
    }
  }

  // Destructive reset: re-verify the account password, then wipe all data and
  // create a fresh vault. Used only when both the PIN and recovery code are lost.
  const handleReset = async (e) => {
    e.preventDefault()
    clearUnlockError()
    setFormError('')
    if (!LOCAL && !accountPassword) {
      setFormError('Enter your account password.')
      return
    }
    const err = validateVaultPin(pin)
    if (err) {
      setFormError(err)
      return
    }
    if (pin !== confirmPin) {
      setFormError('PINs do not match.')
      return
    }
    if (!resetConfirmed) {
      setFormError('Tick the box to confirm you understand this deletes your data.')
      return
    }
    try {
      setPendingAction('pin')
      setAwaitingVaultResult(true)
      // Re-verify the account password before destroying anything (local
      // mode has none; the confirmation box stands in for it).
      if (!LOCAL) {
        const { error: authError } = await signIn(user.email, accountPassword)
        if (authError) {
          setFormError('Incorrect account password.')
          return
        }
      }
      const { masterKey, recoveryCode } = await resetVault(pin)
      // Hold the key; unlock on "I saved this code" so the new code always shows.
      setPendingUnlockKey(masterKey)
      setOneTimeRecoveryCode(recoveryCode)
      setResetMode(false)
      setForgotPin(false)
      resetFields()
    } catch {
      // unlockError set in context
    } finally {
      setPendingAction(null)
      setAwaitingVaultResult(false)
    }
  }

  // "I saved this code": unlock the vault (if setup/recover deferred it), then
  // dismiss the recovery screen so the biometric prompt or the app shows next.
  const handleAcknowledgeRecoveryCode = async () => {
    if (pendingUnlockKey) {
      await commitVaultKey(pendingUnlockKey)
      setPendingUnlockKey(null)
    }
    setOneTimeRecoveryCode('')
  }

  const handleEnableBiometric = async () => {
    setEnrollError('')
    try {
      await enrollPasskey(pendingEnrollPin)
      setPendingEnrollPin('')
      resetFields()
    } catch (err) {
      setEnrollError(err?.message || 'Could not add a passkey. You can set it up later in Settings.')
    }
  }

  const handleSkipBiometric = () => {
    setPendingEnrollPin('')
    setEnrollError('')
    resetFields()
  }

  const isNewPinMode = needsSetup || forgotPin
  const weakPinWarning = isNewPinMode && !validateVaultPin(pin) ? getWeakPinWarning(pin) : null
  const showPasskeyUnlock = !needsSetup && !forgotPin && passkeySupported && passkeys.length > 0

  const pinsMatch = confirmPin.length > 0 && pin === confirmPin

  if (oneTimeRecoveryCode) {
    return (
      <div className="min-h-[100svh] bg-bg-base">
        <RecoveryCodeDialog
          code={oneTimeRecoveryCode}
          busy={unlocking}
          onAcknowledge={handleAcknowledgeRecoveryCode}
        />
      </div>
    )
  }

  if (pendingEnrollPin) {
    return (
      <div className="min-h-[100svh] bg-bg-base flex items-start sm:items-center justify-center px-4 pt-16 pb-6 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="bg-bg-card rounded-2xl shadow-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto">
              <Fingerprint size={24} className="text-accent" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-text-primary">Enable biometric unlock?</h1>
              <p className="text-text-muted text-sm mt-1.5 leading-relaxed">
                Use Face ID, Touch ID, or Windows Hello to unlock your vault next time, instead of typing your PIN. Your PIN still works as a backup.
              </p>
            </div>

            {enrollError && (
              <p role="alert" className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {enrollError}
              </p>
            )}

            <button
              type="button"
              onClick={handleEnableBiometric}
              disabled={unlocking}
              className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
            >
              <Fingerprint size={14} />
              {unlocking ? 'Waiting for device...' : 'Enable biometric unlock'}
            </button>
            <button
              type="button"
              onClick={handleSkipBiometric}
              disabled={unlocking}
              className="w-full text-center text-xs text-text-muted hover:text-text-primary transition-colors pt-1 disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (resetMode) {
    const resetPinsMatch = confirmPin.length > 0 && pin === confirmPin
    const canReset = Boolean((LOCAL || accountPassword) && pin && confirmPin && resetConfirmed)
    return (
      <div className="min-h-[100svh] bg-bg-base flex items-start sm:items-center justify-center px-4 pt-16 pb-6 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <AlertTriangle size={24} className="text-danger sm:w-[26px] sm:h-[26px]" />
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Reset vault</h1>
            <p className="text-text-muted text-sm mt-1.5 sm:mt-2 leading-relaxed">
              Use this only if you have lost both your PIN and recovery code.
            </p>
          </div>

          <form
            onSubmit={handleReset}
            className="bg-bg-card rounded-2xl shadow-sm p-6 space-y-3"
          >
            <div className="flex items-start gap-2 rounded-lg bg-danger/10 border border-danger/20 px-3 py-2.5 text-xs leading-relaxed text-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              This permanently deletes all your spaces and items. They are
              encrypted and cannot be recovered without your PIN or recovery
              code. This cannot be undone.
            </div>

            {!LOCAL && (
              <div>
                <label htmlFor="reset-account-password" className="block text-xs font-medium text-text-secondary mb-1.5">
                  Account password
                </label>
                <input
                  id="reset-account-password"
                  type="password"
                  value={accountPassword}
                  onChange={e => { setAccountPassword(e.target.value); setFormError('') }}
                  required
                  autoFocus
                  autoComplete="current-password"
                  disabled={unlocking}
                  className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
                />
              </div>
            )}

            <PinInput
              id="reset-pin"
              label="New vault PIN"
              value={pin}
              onChange={v => { setPin(v); setFormError('') }}
              autoComplete="new-password"
              disabled={unlocking}
            />
            <div>
              <PinInput
                id="reset-pin-confirm"
                label="Confirm vault PIN"
                value={confirmPin}
                onChange={v => { setConfirmPin(v); setFormError('') }}
                autoComplete="new-password"
                disabled={unlocking}
              />
              {confirmPin.length > 0 && (
                <p className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${resetPinsMatch ? 'text-success' : 'text-danger'}`}>
                  {resetPinsMatch ? <Check size={12} /> : null}
                  {resetPinsMatch ? 'PINs match' : 'PINs do not match'}
                </p>
              )}
            </div>

            <label className="flex cursor-pointer select-none items-start gap-2.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={resetConfirmed}
                onChange={e => { setResetConfirmed(e.target.checked); setFormError('') }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-bg-border bg-bg-elevated accent-danger"
              />
              I understand this permanently deletes all my data.
            </label>

            {formError && (
              <p role="alert" className="text-danger text-xs">{formError}</p>
            )}
            {unlockError && (
              <p role="alert" className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {unlockError}
              </p>
            )}

            <button
              type="submit"
              disabled={unlocking || !canReset}
              className={buttonClass({ variant: 'dangerSolid', size: 'lg', className: 'w-full' })}
            >
              <AlertTriangle size={14} />
              {pendingAction === 'pin' ? 'Resetting...' : 'Delete data & reset vault'}
            </button>

            <button
              type="button"
              onClick={leaveResetMode}
              disabled={unlocking}
              className="w-full text-center text-xs text-text-muted hover:text-accent transition-colors pt-1 disabled:opacity-50"
            >
              Cancel
            </button>
          </form>

          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="w-full text-center text-xs text-text-muted hover:text-danger transition-colors mt-4"
          >
            {SIGN_OUT_TEXT.label}
          </button>
        </div>

        {confirmSignOut && (
          <ConfirmDialog
            title={SIGN_OUT_TEXT.title}
            message={SIGN_OUT_TEXT.message}
            confirmLabel={SIGN_OUT_TEXT.label}
            onConfirm={() => { setConfirmSignOut(false); signOut() }}
            onClose={() => setConfirmSignOut(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-[100svh] bg-bg-base flex items-start sm:items-center justify-center px-4 pt-16 pb-6 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Lock size={24} className="text-accent sm:w-[26px] sm:h-[26px]" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">
            {needsSetup ? 'Create vault PIN' : forgotPin ? 'Reset vault PIN' : 'Unlock your vault'}
          </h1>
          <p className="text-text-muted text-sm mt-1.5 sm:mt-2 leading-relaxed">
            {needsSetup
              ? `Choose a PIN or passphrase - at least ${VAULT_PIN_MIN_LENGTH} characters (letters, numbers, or symbols). A one-time recovery code will be shown next.`
              : forgotPin
                ? 'Enter your recovery code and choose a new vault PIN.'
              : 'Enter your vault PIN to decrypt your spaces on this device.'}
          </p>
        </div>

        <form
          onSubmit={needsSetup ? handleSetup : forgotPin ? handleRecover : handleUnlock}
          className="bg-bg-card rounded-2xl shadow-sm p-6 space-y-3"
        >
          {showPasskeyUnlock && (
            <>
              <button
                type="button"
                onClick={handlePasskeyUnlock}
                disabled={unlocking}
                className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
              >
                <Fingerprint size={16} />
                {pendingAction === 'passkey' ? 'Waiting...' : 'Unlock with passkey'}
              </button>
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-bg-border" />
                <span className="text-text-muted text-[10px] uppercase tracking-wide">or use PIN</span>
                <div className="h-px flex-1 bg-bg-border" />
              </div>
            </>
          )}

          {forgotPin && (
            <div>
              <label htmlFor="vault-recovery-code" className="block text-xs font-medium text-text-secondary mb-1.5">
                Recovery code
              </label>
              <input
                id="vault-recovery-code"
                type="text"
                value={recoveryCodeInput}
                onChange={e => { setRecoveryCodeInput(e.target.value); setFormError('') }}
                required
                autoFocus
                autoComplete="off"
                inputMode="text"
                disabled={unlocking}
                className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
              />
            </div>
          )}

          <PinInput
            id="vault-pin"
            label={needsSetup || forgotPin ? 'New vault PIN' : 'Vault PIN'}
            value={pin}
            onChange={v => { setPin(v); setFormError('') }}
            autoComplete={needsSetup || forgotPin ? 'new-password' : 'off'}
            autoFocus={!forgotPin}
            disabled={unlocking}
          />

          {(needsSetup || forgotPin) && (
            <div>
              <PinInput
                id="vault-pin-confirm"
                label="Confirm vault PIN"
                value={confirmPin}
                onChange={v => { setConfirmPin(v); setFormError('') }}
                autoComplete="new-password"
                disabled={unlocking}
              />
              {confirmPin.length > 0 && (
                <p
                  className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${
                    pinsMatch ? 'text-success' : 'text-danger'
                  }`}
                >
                  {pinsMatch ? <Check size={12} /> : null}
                  {pinsMatch ? 'PINs match' : 'PINs do not match'}
                </p>
              )}
            </div>
          )}

          <WeakPinWarning message={weakPinWarning} />

          {formError && (
            <p role="alert" className="text-danger text-xs">{formError}</p>
          )}

          {unlockError && (
            <p role="alert" className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
              {unlockError}
            </p>
          )}

          <button
            type="submit"
            // Enabled while filling in; pressing it says what's missing.
            disabled={unlocking}
            // With a passkey offered above, PIN is the second way in.
            className={buttonClass({ variant: showPasskeyUnlock && !forgotPin ? 'secondary' : 'primary', size: 'lg', className: 'w-full' })}
          >
            <Lock size={14} />
            {pendingAction === 'pin'
              ? 'Working...'
              : needsSetup
                ? 'Create PIN'
                : forgotPin
                  ? 'Reset PIN'
                : 'Unlock vault'}
          </button>

          {!needsSetup && !forgotPin && (
            <button
              type="button"
              onClick={() => { setForgotPin(true); resetFields(); clearUnlockError() }}
              className="w-full text-center text-xs text-text-muted hover:text-accent transition-colors pt-1"
            >
              Forgot PIN?
            </button>
          )}

          {forgotPin && (
            <button
              type="button"
              onClick={() => { setForgotPin(false); resetFields(); clearUnlockError() }}
              className="w-full text-center text-xs text-text-muted hover:text-accent transition-colors pt-1"
            >
              Back to PIN unlock
            </button>
          )}

          {forgotPin && (
            <button
              type="button"
              onClick={() => { setResetMode(true); setForgotPin(false); resetFields(); clearUnlockError() }}
              className="w-full text-center text-xs text-text-muted hover:text-danger transition-colors"
            >
              Lost your recovery code too? Reset vault
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => setConfirmSignOut(true)}
          className="w-full text-center text-xs text-text-muted hover:text-danger transition-colors mt-4"
        >
          {SIGN_OUT_TEXT.label}
        </button>

        {!LOCAL && (
          <p className="text-center text-text-muted text-[10px] mt-4 sm:mt-6 leading-relaxed">
            Vault PIN is separate from your login password.
          </p>
        )}
      </div>

      {confirmSignOut && (
        <ConfirmDialog
          title={SIGN_OUT_TEXT.title}
          message={SIGN_OUT_TEXT.message}
          confirmLabel={SIGN_OUT_TEXT.label}
          onConfirm={() => { setConfirmSignOut(false); signOut() }}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  )
}
