/**
 * LoginPage.jsx - Sign in and (optional) sign up.
 */
import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { buttonClass } from '../components/ui/buttonStyles'
import { useAuth } from '../context/AuthContextCore'
import { Lock, Eye, EyeOff, UserPlus, Mail, ArrowLeft, HardDrive } from 'lucide-react'
import { enterLocalMode } from '../lib/localMode'
import { MAX_LOGIN_ATTEMPTS, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_COOLDOWN_MS } from '../lib/constants'
import { MULTI_USER_ENABLED } from '../lib/appConfig'
import { TERMS_VERSION } from '../lib/legal'
import { validatePassword } from '../lib/passwordPolicy'
import { PasswordRules } from '../components/PasswordRules'
import { logAudit } from '../lib/auditLog'
import { setRememberMe } from '../lib/supabase'
import { peekAuthRedirectError, clearAuthRedirectError } from '../lib/authRedirectError'
import {
  recordClientRateLimitFailure,
  clearClientRateLimit,
  getClientRateLimitStatus,
} from '../lib/rateLimiter'

function getInitialInfo(searchParams) {
  if (searchParams.get('reset') === 'success') {
    return 'Password updated. Please sign in with your new password.'
  }
  if (searchParams.get('email_change') === 'requested') {
    return 'Email change requested. Check your current and new email inboxes, then sign in again.'
  }
  if (searchParams.get('email_change') === 'verified') {
    return 'Email confirmation received. If another confirmation email was sent, open that link too, then sign in with your new email.'
  }
  if (searchParams.get('account_deleted') === '1') {
    return 'Your account was permanently deleted.'
  }
  return ''
}

/**
 * Ask the browser's password manager to save the credential. SPA logins submit
 * over fetch with no navigation, so the native "save password?" prompt usually
 * never fires on its own; storing it explicitly lets future autofill work.
 * Best-effort and Chromium-only (guarded); other browsers ignore it.
 */
async function saveBrowserCredential(id, password) {
  try {
    if (id && password && window.PasswordCredential && navigator.credentials?.store) {
      await navigator.credentials.store(
        new window.PasswordCredential({ id, password, name: id })
      )
    }
  } catch {
    // Saving is a convenience; never block sign-in on it.
  }
}

export default function LoginPage() {
  const { signIn, signUp, requestPasswordReset } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  // The route decides the page: /signup is create-account, everything else is
  // sign in. "Forgot password" is a sub-state of the sign-in page.
  const pathMode = location.pathname === '/signup' ? 'signup' : 'signin'
  const [forgot, setForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [remember, setRemember] = useState(true)
  // Explicit consent to the Terms and Privacy Policy, required before an account
  // can be created (GDPR/DPDP: record affirmative agreement at sign-up).
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const confirmRef = useRef(null)

  // When the browser autofills a field it sets the DOM value but React's
  // onChange may not fire, leaving state empty (so the gated submit button stays
  // disabled and submit sees nothing). The onAutoFillStart animation (index.css)
  // fires on autofill; sync the DOM values into state here.
  const syncAutofill = (e) => {
    if (e?.animationName && e.animationName !== 'onAutoFillStart') return
    if (emailRef.current && emailRef.current.value !== email) setEmail(emailRef.current.value)
    if (passwordRef.current && passwordRef.current.value !== password) setPassword(passwordRef.current.value)
    if (confirmRef.current && confirmRef.current.value !== confirmPassword) setConfirmPassword(confirmRef.current.value)
  }

  // Warn if Caps Lock is on while typing a password (a common cause of a
  // rejected sign-in that the masked field hides).
  const onPasswordKey = e => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'))
    }
  }
  const [resetSent, setResetSent] = useState(false)
  // A failed email link (e.g. expired sign-up confirmation) captured at startup.
  const [error, setError] = useState(() => peekAuthRedirectError() || '')
  const [info, setInfo] = useState(() => getInitialInfo(searchParams))
  // Show that link error only once (cleared after mount, which keeps the lazy
  // initializer pure under StrictMode's double call).
  useEffect(() => { clearAuthRedirectError() }, [])
  const [loading, setLoading] = useState(false)

  const [, setCooldownTick] = useState(0)

  const loginRateKey = email.trim().toLowerCase() ? `login:${email.trim().toLowerCase()}` : 'login:anonymous'

  const cooldownStatus = getClientRateLimitStatus(loginRateKey, MAX_LOGIN_ATTEMPTS)
  const cooldownRemaining = cooldownStatus.blocked ? cooldownStatus.retryAfter * 1000 : 0
  const isCoolingDown = cooldownRemaining > 0

  useEffect(() => {
    if (!isCoolingDown) return
    const timer = setInterval(() => setCooldownTick(tick => tick + 1), 1000)
    return () => clearInterval(timer)
  }, [isCoolingDown, loginRateKey])

  const isSignUp = pathMode === 'signup' && MULTI_USER_ENABLED
  const isForgot = forgot && pathMode === 'signin'

  // Keep the submit button disabled until the required fields are filled: email
  // for the reset flow, email + password (+ confirm on sign-up) otherwise.
  const canSubmit = isForgot
    ? Boolean(email.trim())
    : isSignUp
      ? Boolean(email.trim() && password && confirmPassword && acceptedTerms)
      : Boolean(email.trim() && password)

  // Sign-up is only reachable when multi-user mode is on; otherwise send the
  // /signup route back to sign in.
  useEffect(() => {
    if (pathMode === 'signup' && !MULTI_USER_ENABLED) {
      navigate('/login', { replace: true })
    }
  }, [pathMode, navigate])

  // Reset the form when switching between sign in and create account. Only on
  // an actual mode change, so an initial message (after a password reset, or a
  // failed email link) is kept even when StrictMode runs effects twice.
  const lastMode = useRef(pathMode)
  useEffect(() => {
    if (lastMode.current === pathMode) return
    lastMode.current = pathMode
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setForgot(false)
    setResetSent(false)
    setError('')
    setInfo('')
    setAcceptedTerms(false)
  }, [pathMode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if ((!isForgot && isCoolingDown) || loading) return

    if (!isForgot) {
      const status = getClientRateLimitStatus(loginRateKey, MAX_LOGIN_ATTEMPTS)
      if (status.blocked) {
        setCooldownTick(tick => tick + 1)
        setError(`Too many failed attempts. Please wait ${status.retryAfter} seconds.`)
        return
      }
    }

    setError('')
    setInfo('')

    if (isForgot) {
      if (!email.trim()) {
        setError('Enter your email address.')
        return
      }
      setLoading(true)
      // Ignore the result on purpose: showing the same confirmation whether or
      // not the address is registered prevents account enumeration. (Supabase
      // also succeeds silently for unknown emails.)
      await requestPasswordReset(email).catch(() => {})
      setLoading(false)
      setResetSent(true)
      return
    }

    if (isSignUp) {
      const passwordError = validatePassword(password)
      if (passwordError) {
        setError(passwordError)
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      if (!acceptedTerms) {
        setError('Please accept the Terms of Service and Privacy Policy to continue.')
        return
      }
      setLoading(true)
      // Record which policy version was accepted. The server stamps the
      // authoritative accepted-at time (see the user_consent trigger); the
      // client timestamp is sent for reference only.
      const { data, error: signUpError } = await signUp(email, password, {
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      })
      setLoading(false)
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      if (data.session) {
        await saveBrowserCredential(email, password)
        setInfo('Account created. Set your vault PIN on the next screen.')
        return
      }
      // Shown identically whether the email is new or already registered, so it
      // never reveals which - preventing account enumeration.
      setInfo('Check your email to confirm your address and finish signing up. Already have an account? Sign in instead.')
      setPassword('')
      setConfirmPassword('')
      return
    }

    setLoading(true)
    // Choose persistent vs session-only storage before the session is written.
    setRememberMe(remember)
    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      recordClientRateLimitFailure(loginRateKey, MAX_LOGIN_ATTEMPTS, LOGIN_ATTEMPT_WINDOW_MS, LOGIN_COOLDOWN_MS)
      const status = getClientRateLimitStatus(loginRateKey, MAX_LOGIN_ATTEMPTS)
      setError(signInError.message)
      if (status.blocked) {
        setCooldownTick(tick => tick + 1)
        setError(`Too many failed attempts. Please wait ${status.retryAfter} seconds.`)
      }
      setLoading(false)
      return
    }

    logAudit({ action: 'login' })
    clearClientRateLimit(loginRateKey)
    setCooldownTick(tick => tick + 1)
    await saveBrowserCredential(email, password)

    setLoading(false)
  }

  return (
    <div className="min-h-[100svh] bg-bg-base flex items-start sm:items-center justify-center px-4 pt-16 pb-6 sm:p-4 relative overflow-y-auto overflow-x-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full opacity-[0.03] blur-3xl animate-float-slow"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full opacity-[0.03] blur-3xl animate-float-slow-reverse"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary">
            {isForgot
              ? 'Reset your password'
              : isSignUp
                ? 'Sign up for ArcheSpace'
                : 'Sign in to ArcheSpace'}
          </h1>
        </div>

        <div className="bg-bg-card rounded-2xl p-6 shadow-sm">
          {isForgot && resetSent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-success/20 bg-success/10">
                <Mail size={20} className="text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Check your email</p>
                <p className="mt-1.5 text-xs leading-5 text-text-muted">
                  If an account exists for{' '}
                  {email.trim() ? (
                    <span className="text-text-secondary">{email.trim()}</span>
                  ) : (
                    'that email'
                  )}
                  , we've sent a password reset link. Check your inbox and spam folder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setForgot(false); setResetSent(false); setError(''); setInfo('') }}
                className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>
          ) : (
          <>
          {isForgot && (
            <>
              <button
                type="button"
                onClick={() => { setForgot(false); setResetSent(false); setError(''); setInfo('') }}
                className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors mb-4"
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
              <p className="text-xs leading-5 text-text-muted mb-4">
                Enter your account email and we'll send a link to reset your password.
              </p>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
              <input
                ref={emailRef}
                id="login-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); if (error) setError('') }}
                onAnimationStart={syncAutofill}
                required
                autoFocus
                autoComplete="username"
                disabled={!isForgot && isCoolingDown}
                className="w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
              />
            </div>
            {!isForgot && (
              <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (error) setError('') }}
                  onAnimationStart={syncAutofill}
                  onKeyUp={onPasswordKey}
                  onKeyDown={onPasswordKey}
                  onBlur={() => setCapsLock(false)}
                  required
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  aria-describedby={isSignUp ? 'signup-password-rules' : undefined}
                  disabled={isCoolingDown}
                  className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 pr-11 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm disabled:opacity-50"
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
              {isSignUp && <PasswordRules id="signup-password-rules" password={password} />}
              </div>
            )}

            {isSignUp && (
              <div>
                <label htmlFor="login-confirm" className="block text-xs font-medium text-text-secondary mb-1.5">Confirm password</label>
                <input
                  ref={confirmRef}
                  id="login-confirm"
                  name="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (error) setError('') }}
                  onAnimationStart={syncAutofill}
                  required
                  autoComplete="new-password"
                  className="password-field w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
            )}

            {isSignUp && (
              <label className="flex cursor-pointer select-none items-start gap-2.5 pt-0.5 text-xs leading-5 text-text-secondary">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => { setAcceptedTerms(e.target.checked); if (error) setError('') }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-bg-border bg-bg-elevated accent-accent"
                />
                <span>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-medium">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            )}

            {error && (
              <div role="alert" className="bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 animate-shake">
                <p className="text-danger text-xs">{error}</p>
              </div>
            )}

            {info && (
              <div role="status" aria-live="polite" className="bg-success/10 border border-success/30 rounded-lg px-3 py-2">
                <p className="text-success text-xs">{info}</p>
              </div>
            )}

            {isCoolingDown && !isSignUp && !isForgot && (
              <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                <p className="text-amber-400 text-xs">
                  Try again in {Math.ceil(cooldownRemaining / 1000)}s
                </p>
              </div>
            )}

            {!isSignUp && !isForgot && (
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-bg-border bg-bg-elevated accent-accent"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => { setForgot(true); setResetSent(false); setError(''); setInfo('') }}
                  className="text-xs text-text-muted hover:text-accent transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit || (isCoolingDown && !isSignUp && !isForgot)}
              className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full mt-1' })}
            >
              {isForgot ? <Mail size={14} /> : isSignUp ? <UserPlus size={14} /> : <Lock size={14} />}
              {loading
                ? (isForgot ? 'Sending link...' : isSignUp ? 'Creating account...' : 'Signing in...')
                : isCoolingDown && !isSignUp && !isForgot
                  ? 'Locked'
                  : isForgot
                    ? 'Send reset link'
                    : isSignUp
                    ? 'Create account'
                    : 'Sign in'}
            </button>

          </form>
          </>
          )}
        </div>

        {!isForgot && (isSignUp || MULTI_USER_ENABLED) && (
          <p className="text-center text-text-secondary text-sm mt-5">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="text-accent hover:underline font-medium">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to ArcheSpace?{' '}
                <Link to="/signup" className="text-accent hover:underline font-medium">
                  Create an account
                </Link>
              </>
            )}
          </p>
        )}

        {!isForgot && (
          <div className="mt-6">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="h-px flex-1 bg-bg-border" />
              or
              <span className="h-px flex-1 bg-bg-border" />
            </div>
            <button
              type="button"
              onClick={enterLocalMode}
              className={buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full mt-4' })}
            >
              <HardDrive size={14} /> Use without an account
            </button>
            <p className="mt-2 text-center text-xs leading-5 text-text-muted">
              Your data stays encrypted in this browser only; nothing is sent to a server.
            </p>
          </div>
        )}

        <p className="text-center mt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors"
          >
            <ArrowLeft size={12} /> Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
