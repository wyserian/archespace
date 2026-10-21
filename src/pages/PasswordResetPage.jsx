/**
 * PasswordResetPage.jsx - Complete Supabase password recovery.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buttonClass } from '../components/ui/buttonStyles'
import { ArrowLeft, Eye, EyeOff, KeyRound, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContextCore'
import { useTheme } from '../context/ThemeCore'
import { validatePassword } from '../lib/passwordPolicy'
import { logAudit } from '../lib/auditLog'
import { useRouteMeta } from '../hooks/useRouteMeta'
import { Spinner } from '../components/ui/UI'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  useRouteMeta({ title: 'Reset password' })
  const { user, loading, passwordRecovery, updatePasswordAndSignOut } = useAuth()
  const { themeMode, themeModes, toggleThemeMode } = useTheme()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Warn if Caps Lock is on while typing (the masked field would hide it).
  const onPasswordKey = e => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'))
    }
  }
  const currentThemeName = themeModes.find(option => option.id === themeMode)?.name || 'Theme'

  const canSubmit = Boolean(password && confirmPassword)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const { error: updateError } = await updatePasswordAndSignOut(
      password,
      () => logAudit({ action: 'password_reset' })
    )
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/login?reset=success', { replace: true })
  }

  return (
    <div className="min-h-[100svh] bg-bg-base flex items-start sm:items-center justify-center px-4 pt-16 pb-6 sm:p-4 relative overflow-y-auto overflow-x-hidden">
      <button
        type="button"
        onClick={toggleThemeMode}
        className="absolute top-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
        title={`Current theme: ${currentThemeName}`}
        aria-label="Switch app theme"
      >
        <Sparkles size={16} />
      </button>

      <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
        <div className="text-center mb-6 sm:mb-10">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <KeyRound size={24} className="text-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-1.5 sm:mb-2">Reset Password</h1>
          <p className="text-text-muted text-sm">Choose a new login password.</p>
        </div>

        <div className="bg-bg-card rounded-2xl p-6 shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : !user || !passwordRecovery ? (
            <div className="space-y-4">
              <div role="alert" className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                <p className="text-danger text-xs">This reset link is missing or expired. Request a new password reset link.</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="reset-password" className="block text-xs font-medium text-text-secondary mb-1.5">New password</label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (error) setError('') }}
                    onKeyUp={onPasswordKey}
                    onKeyDown={onPasswordKey}
                    onBlur={() => setCapsLock(false)}
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 pr-11 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {capsLock && (
                  <p className="mt-1.5 text-[11px] text-amber-400">Caps Lock is on</p>
                )}
              </div>

              <div>
                <label htmlFor="reset-confirm" className="block text-xs font-medium text-text-secondary mb-1.5">Confirm password</label>
                <input
                  id="reset-confirm"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (error) setError('') }}
                  required
                  autoComplete="new-password"
                  className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
                />
              </div>

              {error && (
                <div role="alert" className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 animate-shake">
                  <p className="text-danger text-xs">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !canSubmit}
                className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full mt-1' })}
              >
                <KeyRound size={14} />
                {saving ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
