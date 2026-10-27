/**
 * MfaChallenge.jsx - Second-factor step shown after the password, before the
 * vault. Accepts a 6-digit authenticator code, or a one-time backup code
 * (which removes 2FA so a user who lost their authenticator can get back in).
 */
import { useState } from 'react'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContextCore'
import { getVerifiedTotpFactorId, verifyTotp, redeemBackupCode, validateTotpCode, normalizeTotpCode, TOTP_CODE_LENGTH } from '../lib/mfa'
import { validateRecoveryCode, normalizeRecoveryCode } from '../lib/crypto/recoveryCode'
import { buttonClass } from './ui/buttonStyles'
import { ConfirmDialog } from './ui/UI'
import { SIGN_OUT_TEXT } from '../lib/localMode'

export default function MfaChallenge({ onVerified }) {
  const { signOut } = useAuth()
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    // Validate format up front so obvious mistakes get a specific message
    // instead of a generic rejection from the server.
    const validationError = useBackup ? validateRecoveryCode(code) : validateTotpCode(code)
    if (validationError) {
      setError(validationError)
      return
    }
    const normalized = useBackup ? normalizeRecoveryCode(code) : normalizeTotpCode(code)
    setError('')
    setLoading(true)
    try {
      if (useBackup) {
        const ok = await redeemBackupCode(normalized)
        if (!ok) {
          setError('That backup code is not valid or has already been used.')
          setLoading(false)
          return
        }
        onVerified()
        return
      }
      const factorId = await getVerifiedTotpFactorId()
      if (!factorId) {
        onVerified()
        return
      }
      await verifyTotp(factorId, normalized)
      onVerified()
    } catch (err) {
      setError(err?.message || 'Verification failed. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100svh] bg-bg-base flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
            {useBackup ? <KeyRound size={24} className="text-accent" /> : <ShieldCheck size={24} className="text-accent" />}
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Two-factor authentication</h1>
          <p className="text-sm text-text-muted mt-1.5">
            {useBackup
              ? 'Enter your backup code. This turns off two-factor authentication so you can sign in - set it up again afterwards in Settings.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        <form onSubmit={submit} className="bg-bg-card rounded-2xl shadow-sm p-5 space-y-4">
          <input
            autoFocus
            value={code}
            onChange={e => { setCode(useBackup ? e.target.value : normalizeTotpCode(e.target.value)); setError('') }}
            inputMode={useBackup ? 'text' : 'numeric'}
            maxLength={useBackup ? 24 : TOTP_CODE_LENGTH}
            autoComplete="one-time-code"
            placeholder={useBackup ? 'Backup code' : '123456'}
            className="w-full px-4 py-3 rounded-xl border border-bg-border bg-bg-base text-text-primary text-center tracking-[0.3em] font-mono focus:outline-none focus:border-accent"
          />
          {error && <p role="alert" className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => { setUseBackup(v => !v); setCode(''); setError('') }}
            className="w-full text-center text-xs text-text-muted hover:text-accent transition-colors pt-1"
          >
            {useBackup ? 'Use authenticator code' : 'Use a backup code'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="block mx-auto text-xs text-text-muted hover:text-text-primary"
          >
            {SIGN_OUT_TEXT.label}
          </button>
        </form>
      </div>

      {/* Asks first, as on the vault screens. */}
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
