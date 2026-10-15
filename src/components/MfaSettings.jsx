/**
 * MfaSettings.jsx - Enable / disable two-factor auth (TOTP) from the account
 * settings. Enrolling shows the QR + a one-time set of backup codes; disabling
 * removes the factor and its backup codes.
 */
import { useEffect, useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContextCore'
import { useToast } from '../context/ToastCore'
import { Modal } from './ui/UI'
import { rowButtonClass, rowDangerButtonClass } from './settings/settingStyles'
import { buttonClass } from './ui/buttonStyles'
import { supabase } from '../lib/supabase'
import {
  enrollTotp, verifyTotp, unenrollFactor, getVerifiedTotpFactorId,
  regenerateBackupCodes, countUnusedBackupCodes, verifyAccountPassword,
  validateTotpCode, normalizeTotpCode, TOTP_CODE_LENGTH,
} from '../lib/mfa'

export default function MfaSettings() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [enabled, setEnabled] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [checking, setChecking] = useState(true)

  // Enrolment modal state.
  const [enroll, setEnroll] = useState(null) // { factorId, qrCode, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [backupCodes, setBackupCodes] = useState(null) // string[] shown once
  const [copied, setCopied] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableError, setDisableError] = useState('')

  const closeDisable = () => {
    setConfirmDisable(false)
    setDisablePassword('')
    setDisableError('')
  }

  const refresh = async () => {
    try {
      const factorId = await getVerifiedTotpFactorId()
      setEnabled(!!factorId)
      setRemaining(factorId ? await countUnusedBackupCodes() : 0)
    } catch { /* leave as-is */ } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    let active = true
    getVerifiedTotpFactorId()
      .then(async factorId => {
        if (!active) return
        setEnabled(!!factorId)
        setRemaining(factorId ? await countUnusedBackupCodes() : 0)
      })
      .catch(() => {})
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  const startEnroll = async () => {
    setError('')
    setBusy(true)
    try {
      const data = await enrollTotp()
      setEnroll(data)
      setCode('')
    } catch (err) {
      toast.error(err?.message || "Couldn't start 2FA setup.")
    } finally {
      setBusy(false)
    }
  }

  const cancelEnroll = async () => {
    const factorId = enroll?.factorId
    setEnroll(null)
    setCode('')
    setError('')
    // Remove the unverified factor we just created.
    if (factorId) { try { await unenrollFactor(factorId) } catch { /* ignore */ } }
  }

  const confirmEnroll = async () => {
    const validationError = validateTotpCode(code)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setBusy(true)
    try {
      await verifyTotp(enroll.factorId, normalizeTotpCode(code))
      const codes = await regenerateBackupCodes(user.id)
      setEnroll(null)
      setBackupCodes(codes)
      await refresh()
      toast.success('Two-factor authentication enabled.')
    } catch (err) {
      setError(err?.message || 'That code was not accepted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!disablePassword.trim()) {
      setDisableError('Enter your login password.')
      return
    }
    setDisableError('')
    setBusy(true)
    try {
      const ok = await verifyAccountPassword(user.email, disablePassword)
      if (!ok) {
        setDisableError('Login password is incorrect.')
        setBusy(false)
        return
      }
      const factorId = await getVerifiedTotpFactorId()
      if (factorId) await unenrollFactor(factorId)
      await supabase.from('mfa_backup_codes').delete().eq('user_id', user.id)
      closeDisable()
      await refresh()
      toast.success('Two-factor authentication disabled.')
    } catch (err) {
      setDisableError(err?.message || "Couldn't disable two-factor authentication.")
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const codes = await regenerateBackupCodes(user.id)
      setBackupCodes(codes)
      await refresh()
    } catch (err) {
      toast.error(err?.message || "Couldn't regenerate backup codes.")
    } finally {
      setBusy(false)
    }
  }

  const copyCodes = () => {
    navigator.clipboard?.writeText((backupCodes || []).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Two-factor authentication</h3>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            {enabled
              ? `On. You'll enter a code from your authenticator app when you sign in.${remaining === 0 ? ' No backup code left - regenerate one so you can get back in if you lose your authenticator.' : ''}`
              : 'Require a one-time code from an authenticator app (Google Authenticator, Authy, 1Password) each time you sign in, on top of your password.'}
          </p>
        </div>
        {/* Off: the Set up action. On: its status in the same place, with
            the actions for a running 2FA below. */}
        {!checking && (
          enabled ? (
            <span className="shrink-0 self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-muted text-accent text-xs font-semibold">
              <Check size={13} strokeWidth={2.5} /> On
            </span>
          ) : (
            <button
              type="button"
              onClick={startEnroll}
              disabled={busy}
              className={`shrink-0 ${rowButtonClass}`}
            >
              Set up
            </button>
          )
        )}
      </div>

      {enabled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={regenerate} disabled={busy} className={rowButtonClass}>
            <RefreshCw size={14} /> Regenerate backup code
          </button>
          <button
            type="button"
            onClick={() => setConfirmDisable(true)}
            disabled={busy}
            className={rowDangerButtonClass}
          >
            Turn off
          </button>
        </div>
      )}

      {/* Enrolment modal: scan QR, enter a code */}
      {enroll && (
        <Modal title="Set up two-factor authentication" onClose={cancelEnroll}>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
            {/* Supabase returns the QR as a data:image/svg+xml URI. */}
            <img
              src={enroll.qrCode}
              alt="Two-factor QR code"
              className="mx-auto w-44 h-44 rounded-xl bg-white p-2"
            />
            <div className="text-center">
              <p className="text-xs text-text-muted mb-1">Or enter this key manually:</p>
              <p className="font-mono text-xs text-text-secondary break-all select-all">{enroll.secret}</p>
            </div>
            <input
              autoFocus
              value={code}
              onChange={e => { setCode(normalizeTotpCode(e.target.value)); setError('') }}
              inputMode="numeric"
              maxLength={TOTP_CODE_LENGTH}
              autoComplete="one-time-code"
              placeholder="123456"
              className="w-full px-4 py-3 rounded-xl border border-bg-border/60 bg-bg-base text-text-primary text-center tracking-[0.3em] font-mono focus:outline-none focus:border-accent"
            />
            {error && <p className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelEnroll} disabled={busy} className={buttonClass({ variant: 'secondary' })}>Cancel</button>
              <button type="button" onClick={confirmEnroll} disabled={busy || !code.trim()} className={buttonClass({ variant: 'primary' })}>{busy ? 'Verifying...' : 'Verify & enable'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* One-time backup code */}
      {backupCodes && (
        <Modal title="Save your backup code" onClose={() => setBackupCodes(null)}>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Keep this somewhere safe. It works once to sign in if you lose your authenticator, which turns off two-factor authentication so you can set it up again.
            </p>
            <div className="rounded-xl border border-bg-border/60 bg-bg-base p-3 text-center font-mono text-lg tracking-[0.2em] text-text-primary select-all">
              {backupCodes[0]}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={copyCodes} className={buttonClass({ variant: 'secondary' })}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => setBackupCodes(null)} className={buttonClass({ variant: 'primary' })}>Done</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDisable && (
        <Modal title="Turn off two-factor authentication?" onClose={closeDisable}>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Enter your login password to confirm. Your account will then be protected by your password alone.
            </p>
            <input
              autoFocus
              type="password"
              value={disablePassword}
              onChange={e => { setDisablePassword(e.target.value); setDisableError('') }}
              placeholder="Login password"
              className="w-full px-4 py-3 rounded-xl border border-bg-border/60 bg-bg-base text-text-primary focus:outline-none focus:border-accent"
            />
            {disableError && <p className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{disableError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeDisable} disabled={busy} className={buttonClass({ variant: 'secondary' })}>Cancel</button>
              <button type="button" onClick={disable} disabled={busy || !disablePassword.trim()} className={buttonClass({ variant: 'dangerSolid' })}>{busy ? 'Turning off...' : 'Turn off'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
