/**
 * SettingsPage.jsx - Account, vault, appearance and backup settings.
 *
 * Each setting is a row (title, short explanation, current state, one action);
 * a row's form opens from its action, one at a time, so the page reads as a
 * list rather than a wall of fields. See components/settings/SettingRow.jsx.
 */
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Upload, Eye, EyeOff, Check, AlertTriangle, User, Palette, KeyRound, Lock, LogOut, Trash2, HardDrive, Info, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import { useVaultPinPrompt } from '../context/VaultPinPromptCore'
import { useTheme } from '../context/ThemeCore'
import { useToast } from '../context/ToastCore'
import { useSpaces } from '../hooks/useSpaces'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { exportSpaces, importSpaces } from '../lib/exportImport'
import PinInput from '../components/PinInput'
import { IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import PasskeyManager from '../components/PasskeyManager'
import MfaSettings from '../components/MfaSettings'
import { validateVaultPin, getWeakPinWarning } from '../lib/crypto/vaultPin'
import WeakPinWarning from '../components/WeakPinWarning'
import { VAULT_PIN_MIN_LENGTH, VAULT_AUTO_LOCK_OPTIONS } from '../lib/constants'
import { validatePassword } from '../lib/passwordPolicy'
import { PasswordRules } from '../components/PasswordRules'
import { logAudit } from '../lib/auditLog'
import { APP_VERSION, COMMIT_URL, REPO_URL } from '../lib/buildInfo'
import { isLocalMode, leaveLocalMode, LOCAL_USER } from '../lib/localMode'
import { eraseLocalData } from '../lib/local/localStore'
import { listPasskeys, removePasskey } from '../lib/crypto/passkeyVault'
import ReauthCode from '../components/ReauthCode'
import { Modal, ConfirmDialog } from '../components/ui/UI'
import RecoveryCodeDialog from '../components/RecoveryCodeDialog'
import { queryKeys } from '../lib/queryKeys'
import { SettingRow, SettingGroup, FormActions } from '../components/settings/SettingRow'
import {
  rowButtonClass, rowDangerButtonClass, primaryButtonClass, inputClass, labelClass,
} from '../components/settings/settingStyles'

// Local mode has no account: its own section takes the Account section's place.
const LOCAL = isLocalMode()

/** Nav entries; each section's header repeats its title and description. */
const SECTIONS = [
  LOCAL
    ? { id: 'local', title: 'Local mode', description: 'No account: everything stays in this browser.', icon: HardDrive }
    : { id: 'account', title: 'Account', description: 'Your email, login password and sign-in security.', icon: User },
  {
    id: 'vault',
    title: 'Vault',
    description: LOCAL
      ? 'Your vault PIN encrypts everything you store.'
      : 'Your vault PIN encrypts everything you store. It is separate from your login password.',
    icon: KeyRound,
  },
  { id: 'appearance', title: 'Appearance', description: 'Theme and accent colour.', icon: Palette },
  { id: 'backup', title: 'Backup', description: 'Download a copy of your data, or restore one.', icon: Download },
  { id: 'about', title: 'About', description: 'The terms, the privacy policy and the source code.', icon: Info },
]

// The confirm dialog for each sign-out scope.
const SIGN_OUT_CONFIRM = {
  local: {
    title: 'Sign out?',
    message: "You'll need your login password and vault PIN to sign back in.",
    confirmLabel: 'Sign out',
    done: 'Signed out',
  },
  global: {
    title: 'Sign out of all devices?',
    message: "This ends your session on every device, including this one. You'll need your login password and vault PIN to sign back in.",
    confirmLabel: 'Sign out everywhere',
    done: 'Signed out of all devices',
  },
}

// Sections that work offline: they apply locally or only link to pages.
const OFFLINE_SECTIONS = ['appearance', 'about']

/** The active section: its icon, title and description, then its groups. */
function SettingsSection({ id, active, children }) {
  if (active !== id) return null
  const { title, description, icon: Icon } = SECTIONS.find(s => s.id === id)
  return (
    <section>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <Icon size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, signIn, signOut, requestPasswordReset, reauthenticate, updateEmail, deleteAccount, updatePasswordAndSignOut } = useAuth()
  const { cryptoKey, unlock, updatePin, setupRecoveryCode, updatePinWithRecoveryCode, unlocking, lock, autoLockId, setAutoLock } = useEncryption()
  const askVaultPin = useVaultPinPrompt()

  // Local mode: erasing deletes everything kept in this browser, so it asks
  // for the vault PIN first (the prompt is also the confirmation).
  const eraseLocalVault = async () => {
    const ok = await askVaultPin({
      title: 'Erase local data?',
      message: 'Every space, item and your vault in this browser will be deleted permanently. Export a backup first if you might want them later. Enter your vault PIN to erase.',
      confirmLabel: 'Erase everything',
      destructive: true,
    })
    if (!ok) return
    lock()
    for (const passkey of await listPasskeys(LOCAL_USER.id).catch(() => [])) {
      await removePasskey(passkey.id).catch(() => {})
    }
    await eraseLocalData().catch(() => {})
    leaveLocalMode()
  }

  const {
    themeMode,
    themeModes,
    setThemeMode,
    accentColor,
    accentColors,
    setAccentColor,
  } = useTheme()
  const { toast } = useToast()
  const { data: spaces = [] } = useSpaces()
  const queryClient = useQueryClient()
  const importRef = useRef(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [showEmailPassword, setShowEmailPassword] = useState(false)
  const [deleteStep, setDeleteStep] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePin, setDeletePin] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)

  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [recoverySetupPin, setRecoverySetupPin] = useState('')
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [recoveryPin, setRecoveryPin] = useState('')
  const [confirmRecoveryPin, setConfirmRecoveryPin] = useState('')
  const [oneTimeRecoveryCode, setOneTimeRecoveryCode] = useState('')

  const [passwordLoading, setPasswordLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [recoverySetupLoading, setRecoverySetupLoading] = useState(false)
  const [pinRecoveryLoading, setPinRecoveryLoading] = useState(false)
  const [rawActiveSection, setActiveSection] = useState(
    () => (LOCAL ? 'local' : typeof navigator !== 'undefined' && !navigator.onLine ? 'appearance' : 'account')
  )
  const online = useOnlineStatus()
  // Offline: only Appearance and About are safe to use. Account, Vault and
  // Backup all need the server, so force Appearance while offline (derived, so
  // a dropped connection snaps back without an extra render pass).
  const activeSection = !online && !OFFLINE_SECTIONS.includes(rawActiveSection)
    ? 'appearance'
    : rawActiveSection
  // The sign-out being confirmed: 'local' (this device) or 'global' (all).
  const [confirmSignOut, setConfirmSignOut] = useState(null)
  // The one row whose form is open: 'email' | 'password' | 'pin' |
  // 'pin-recovery' | 'recovery-code' | null.
  const [openRow, setOpenRow] = useState(null)
  const [emailStep, setEmailStep] = useState('form')     // 'form' | 'code'
  const deleteConfirmationPhrase = `DELETE ${user?.email || ''}`

  const resetDeleteFlow = () => {
    setDeleteStep('')
    setDeleteConfirmText('')
    setDeletePassword('')
    setDeletePin('')
    setShowDeletePassword(false)
    setDeleteLoading(false)
  }

  /** Close the open row form and clear what was typed in it. */
  const closeRow = () => {
    setOpenRow(null)
    setEmailStep('form')
    setNewEmail('')
    setEmailPassword('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setRecoveryCodeInput('')
    setRecoveryPin('')
    setConfirmRecoveryPin('')
    setRecoverySetupPin('')
  }

  /** Open a row's form (closing any other, and its typed values). */
  const toggleRow = (row) => {
    closeRow()
    setOpenRow(row)
  }

  const openSection = (section) => {
    closeRow()
    setActiveSection(section)
  }

  const sendEmailCode = async () => {
    const { error } = await reauthenticate()
    if (error) {
      toast.error(`Couldn't send the code: ${error.message}`)
      return false
    }
    setEmailStep('code')
    toast.info('We sent a 6-digit code to your current email.')
    return true
  }

  const handleChangeEmail = async (e) => {
    e.preventDefault()
    const nextEmail = newEmail.trim().toLowerCase()
    if (!nextEmail) {
      toast.error('Enter a new email address.')
      return
    }
    if (nextEmail === user?.email?.toLowerCase()) {
      toast.error('New email must be different from current email.')
      return
    }
    if (!emailPassword) {
      toast.error('Enter your login password to continue.')
      return
    }

    setEmailLoading(true)
    const { error: verifyError } = await signIn(user.email, emailPassword)
    if (verifyError) {
      toast.error('Login password is incorrect.')
      setEmailLoading(false)
      return
    }
    // Send a reauthentication code to the CURRENT (old) email.
    await sendEmailCode()
    setEmailLoading(false)
  }

  // Confirm with the code from the old email; a link then goes to the new email.
  const handleConfirmEmailChange = async (code) => {
    const nextEmail = newEmail.trim().toLowerCase()
    setEmailLoading(true)
    const { error } = await updateEmail(nextEmail, code)
    if (error) {
      setEmailLoading(false)
      toast.error(error.message)
      return
    }
    setNewEmail('')
    setEmailPassword('')
    setEmailStep('form')
    await signOut({ scope: 'local' })
    setEmailLoading(false)
    toast.success('Confirmation link sent to your new email. Confirm it, then sign in again.')
    navigate('/login?email_change=requested', { replace: true })
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    if (deleteConfirmText !== deleteConfirmationPhrase) {
      toast.error(`Type "${deleteConfirmationPhrase}" to confirm.`)
      return
    }
    if (!deletePassword || !deletePin) {
      toast.error('Enter your login password and vault PIN.')
      return
    }

    setDeleteLoading(true)
    const { error: verifyError } = await signIn(user.email, deletePassword)
    if (verifyError) {
      toast.error('Login password is incorrect.')
      setDeleteLoading(false)
      return
    }

    try {
      await unlock(deletePin)
    } catch (err) {
      toast.error(err?.message || 'Vault PIN is incorrect.')
      setDeleteLoading(false)
      return
    }

    const { error } = await deleteAccount()
    setDeleteLoading(false)
    if (error) {
      toast.error(error.message || "Couldn't delete account.")
      return
    }

    resetDeleteFlow()
    navigate('/login?account_deleted=1', { replace: true })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      toast.error(passwordError.replace('Password', 'New password'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.')
      return
    }
    if (!currentPassword) {
      toast.error('Enter your current password.')
      return
    }
    setPasswordLoading(true)
    const { error: verifyError } = await signIn(user.email, currentPassword)
    if (verifyError) {
      const msg = verifyError.message || ''
      toast.error(
        /invalid login credentials/i.test(msg)
          ? 'Current password is incorrect.'
          : `Could not verify password: ${msg}`
      )
      setPasswordLoading(false)
      return
    }
    const { error } = await updatePasswordAndSignOut(
      newPassword,
      () => logAudit({ action: 'password_change' })
    )
    setPasswordLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.success('Login password updated. Sign in again with your new password.')
    navigate('/login?reset=success', { replace: true })
  }

  const handleSendPasswordReset = async () => {
    if (!user?.email) {
      toast.error('No email address is available for this account.')
      return
    }
    setResetLoading(true)
    const { error } = await requestPasswordReset(user.email)
    setResetLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password reset link sent. Check your email.')
  }

  const handleChangePin = async (e) => {
    e.preventDefault()
    const pinErr = validateVaultPin(newPin)
    if (pinErr) {
      toast.error(pinErr)
      return
    }
    if (newPin !== confirmPin) {
      toast.error('New PINs do not match.')
      return
    }
    setPinLoading(true)
    try {
      await updatePin(currentPin, newPin)
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setOpenRow(null)
      toast.success('Vault PIN updated.')
    } catch (err) {
      toast.error(err?.message || "Couldn't change vault PIN.")
    }
    setPinLoading(false)
  }

  const handleSetupRecoveryCode = async (e) => {
    e.preventDefault()
    setRecoverySetupLoading(true)
    try {
      const { recoveryCode } = await setupRecoveryCode(recoverySetupPin)
      setRecoverySetupPin('')
      setOpenRow(null)
      setOneTimeRecoveryCode(recoveryCode)
      toast.success('Recovery code created. Save it now.')
    } catch (err) {
      toast.error(err?.message || "Couldn't create recovery code.")
    }
    setRecoverySetupLoading(false)
  }

  const handleChangePinWithRecoveryCode = async (e) => {
    e.preventDefault()
    const pinErr = validateVaultPin(recoveryPin)
    if (pinErr) {
      toast.error(pinErr)
      return
    }
    if (recoveryPin !== confirmRecoveryPin) {
      toast.error('New PINs do not match.')
      return
    }
    setPinRecoveryLoading(true)
    try {
      const { recoveryCode } = await updatePinWithRecoveryCode(recoveryCodeInput, recoveryPin)
      setRecoveryCodeInput('')
      setRecoveryPin('')
      setConfirmRecoveryPin('')
      setOpenRow(null)
      setOneTimeRecoveryCode(recoveryCode)
      toast.success('Vault PIN updated. Save your new recovery code.')
    } catch (err) {
      toast.error(err?.message || "Couldn't reset vault PIN.")
    }
    setPinRecoveryLoading(false)
  }

  const handleExport = async () => {
    try {
      await exportSpaces(spaces, cryptoKey)
      toast.success("Backup exported")
    } catch {
      toast.error("Couldn't export backup.")
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importSpaces(file, user.id, cryptoKey, {
        // A backup from another vault (another account, or before a reset).
        askBackupPin: (check) => askVaultPin({
          title: 'Open backup',
          message: 'This backup was made in another vault. Enter the vault PIN you had when you exported it.',
          confirmLabel: 'Open',
          verify: check,
        }),
      })
      if (!result) {
        e.target.value = ''
        return
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.spaces() })
      await queryClient.invalidateQueries({ queryKey: queryKeys.bin() })
      const spacesLabel = `${result.spaces} space${result.spaces === 1 ? '' : 's'}`
      const itemsLabel = `${result.items} item${result.items === 1 ? '' : 's'}`
      const skippedLabel = result.skipped ? ` (${result.skipped} skipped)` : ''
      toast.success(`Imported ${spacesLabel} and ${itemsLabel}${skippedLabel}.`)
    } catch (err) {
      toast.error(err?.message || "That backup file isn't valid.")
      console.error(err)
    }
    e.target.value = ''
  }

  const handleLockVault = () => {
    lock()
    navigate('/app')
  }

  const passwordToggle = (shown, toggle, label) => (
    <button
      type="button"
      onClick={toggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
      aria-label={label}
    >
      {shown ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )

  const selectedTheme = themeModes.find(o => o.id === themeMode)
  const selectedAccent = accentColors.find(o => o.id === accentColor)

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="sticky top-0 z-20 glass">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
          <IconButton icon={ArrowLeft} label="Back" size="md" className="-ml-1.5" onClick={() => navigate('/app')} />
          <h1 className="text-sm font-semibold text-text-primary">Settings</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 md:flex md:h-[calc(100dvh-3.5rem)] md:flex-col md:overflow-hidden">
        <div className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row md:items-stretch">
          {/* Section nav: tabs on phones, a rail on wider screens */}
          <nav className="w-full shrink-0 md:w-52 md:self-start" aria-label="Settings sections">
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-bg-elevated p-1 md:flex-col md:overflow-visible">
              {SECTIONS.map(({ id, title, icon: NavIcon }) => {
                const on = activeSection === id
                const disabled = !online && !OFFLINE_SECTIONS.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { if (!disabled) openSection(id) }}
                    disabled={disabled}
                    aria-current={on ? 'page' : undefined}
                    title={disabled ? 'Unavailable offline' : undefined}
                    className={`flex min-w-fit items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors md:w-full ${on ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'} ${disabled ? 'cursor-not-allowed opacity-40 hover:text-text-secondary' : ''}`}
                  >
                    <NavIcon size={16} />
                    {title}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Content pane */}
          <div className="min-w-0 flex-1 md:flex md:min-h-0 md:flex-col">
            <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
              {/* Local mode */}
              <SettingsSection id="local" active={activeSection}>
                <SettingGroup label="Your data">
                  <SettingRow
                    title="Stored in this browser"
                    description="Encrypted with your vault PIN and kept only here; nothing is sent to a server. Clearing this site's data deletes it, so export a backup now and then."
                    action={
                      <button type="button" onClick={() => openSection('backup')} className={rowButtonClass}>
                        <Download size={15} /> Back up
                      </button>
                    }
                  />
                </SettingGroup>

                <SettingGroup label="Account">
                  <SettingRow
                    title="Use an account instead"
                    description="Export a backup, then sign in or create an account and import it there. Your local data stays here until you erase it."
                    action={
                      <button type="button" onClick={leaveLocalMode} className={rowButtonClass}>
                        <LogOut size={15} /> Leave local mode
                      </button>
                    }
                  />
                </SettingGroup>

                <SettingGroup label="Danger zone" danger>
                  <SettingRow
                    title="Erase local data"
                    description="Permanently deletes every space, item and your vault from this browser. This can't be undone."
                    action={
                      <button type="button" onClick={eraseLocalVault} className={rowDangerButtonClass}>
                        <Trash2 size={15} /> Erase
                      </button>
                    }
                  />
                </SettingGroup>
              </SettingsSection>

              {/* Account */}
              <SettingsSection id="account" active={activeSection}>
                <SettingGroup label="Sign-in">
                  <SettingRow
                    title="Email"
                    description={user?.email}
                    open={openRow === 'email'}
                    action={openRow !== 'email' && (
                      <button type="button" onClick={() => toggleRow('email')} className={rowButtonClass}>Change</button>
                    )}
                  >
                    <p className="mb-3 text-xs leading-relaxed text-text-muted">
                      We'll email a 6-digit code to your current address to confirm it's you. Then a link goes to the new address, and the change applies once you open it.
                    </p>
                    {emailStep === 'form' ? (
                      <form onSubmit={handleChangeEmail} className="space-y-3">
                        <div>
                          <label htmlFor="new-email" className={labelClass}>New email</label>
                          <input
                            id="new-email"
                            type="email"
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor="email-change-password" className={labelClass}>Login password</label>
                          <div className="relative">
                            <input
                              id="email-change-password"
                              type={showEmailPassword ? 'text' : 'password'}
                              value={emailPassword}
                              onChange={e => setEmailPassword(e.target.value)}
                              required
                              autoComplete="current-password"
                              className={`password-field pr-11 ${inputClass}`}
                            />
                            {passwordToggle(showEmailPassword, () => setShowEmailPassword(v => !v), 'Toggle email password visibility')}
                          </div>
                        </div>
                        <FormActions onCancel={closeRow} submitLabel="Send code" busy={emailLoading} busyLabel="Sending code..." />
                      </form>
                    ) : (
                      <ReauthCode
                        email={user?.email}
                        busy={emailLoading}
                        onConfirm={handleConfirmEmailChange}
                        onCancel={() => { setEmailStep('form'); setEmailPassword('') }}
                        onResend={sendEmailCode}
                      />
                    )}
                  </SettingRow>

                  <SettingRow
                    title="Login password"
                    description="Used to sign in. Separate from your vault PIN."
                    open={openRow === 'password'}
                    action={openRow !== 'password' && (
                      <button type="button" onClick={() => toggleRow('password')} className={rowButtonClass}>Change</button>
                    )}
                  >
                    <form onSubmit={handleChangePassword} className="space-y-3">
                      <div>
                        <label htmlFor="current-password" className={labelClass}>Current password</label>
                        <div className="relative">
                          <input
                            id="current-password"
                            type={showPasswords ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className={`password-field pr-11 ${inputClass}`}
                          />
                          {passwordToggle(showPasswords, () => setShowPasswords(v => !v), 'Toggle password visibility')}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="new-password" className={labelClass}>New password</label>
                        <input
                          id="new-password"
                          type={showPasswords ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                          aria-describedby="new-password-rules"
                          className={`password-field ${inputClass}`}
                        />
                        <PasswordRules id="new-password-rules" password={newPassword} />
                      </div>
                      <div>
                        <label htmlFor="confirm-password" className={labelClass}>Confirm new password</label>
                        <input
                          id="confirm-password"
                          type={showPasswords ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                          className={`password-field ${inputClass}`}
                        />
                      </div>
                      <p className="text-xs text-text-muted">
                        You'll be signed out and asked to sign in with the new password.
                      </p>
                      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={handleSendPasswordReset}
                          disabled={resetLoading}
                          className="text-left text-xs font-medium text-accent hover:underline disabled:opacity-50"
                        >
                          {resetLoading ? 'Sending reset link...' : 'Forgot it? Email me a reset link'}
                        </button>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={closeRow} className={rowButtonClass}>Cancel</button>
                          <button type="submit" disabled={passwordLoading} className={primaryButtonClass}>
                            {passwordLoading ? 'Updating...' : 'Change password'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </SettingRow>

                  <MfaSettings />
                </SettingGroup>

                <SettingGroup label="Sessions">
                  <SettingRow
                    title="Sign out"
                    description="Ends your session on this device. Your data stays in your account."
                    action={
                      <button type="button" onClick={() => setConfirmSignOut('local')} className={rowButtonClass}>
                        <LogOut size={15} /> Sign out
                      </button>
                    }
                  />
                  <SettingRow
                    title="Sign out of all devices"
                    description="Ends your session everywhere, including here. Use it if you've lost a device you were signed in on."
                    action={
                      <button type="button" onClick={() => setConfirmSignOut('global')} className={rowButtonClass}>
                        <LogOut size={15} /> Sign out everywhere
                      </button>
                    }
                  />
                </SettingGroup>

                <SettingGroup label="Danger zone" danger>
                  <SettingRow
                    title="Delete account"
                    description="Permanently deletes your account, spaces, items and vault. This can't be undone."
                    action={
                      <button type="button" onClick={() => setDeleteStep('warning')} className={rowDangerButtonClass}>
                        <Trash2 size={15} /> Delete account
                      </button>
                    }
                  />
                </SettingGroup>
              </SettingsSection>

              {/* Vault */}
              <SettingsSection id="vault" active={activeSection}>
                <SettingGroup label="Unlocking">
                  <SettingRow
                    title="Vault PIN"
                    description={`Unlocks your encrypted data. A PIN or passphrase of at least ${VAULT_PIN_MIN_LENGTH} characters.`}
                    open={openRow === 'pin' || openRow === 'pin-recovery'}
                    action={openRow !== 'pin' && openRow !== 'pin-recovery' && (
                      <button type="button" onClick={() => toggleRow('pin')} className={rowButtonClass}>Change</button>
                    )}
                  >
                    {openRow === 'pin' ? (
                      <form onSubmit={handleChangePin} className="space-y-3">
                        <PinInput
                          id="settings-current-pin"
                          label="Current vault PIN"
                          value={currentPin}
                          onChange={setCurrentPin}
                          disabled={pinLoading || unlocking}
                        />
                        <PinInput
                          id="settings-new-pin"
                          label="New vault PIN"
                          value={newPin}
                          onChange={setNewPin}
                          disabled={pinLoading || unlocking}
                        />
                        <PinInput
                          id="settings-confirm-pin"
                          label="Confirm new vault PIN"
                          value={confirmPin}
                          onChange={setConfirmPin}
                          disabled={pinLoading || unlocking}
                        />
                        <WeakPinWarning message={!validateVaultPin(newPin) ? getWeakPinWarning(newPin) : null} />
                        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                          <button
                            type="button"
                            onClick={() => setOpenRow('pin-recovery')}
                            className="text-left text-xs font-medium text-accent hover:underline"
                          >
                            Forgot your PIN? Use your recovery code
                          </button>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={closeRow} className={rowButtonClass}>Cancel</button>
                            <button type="submit" disabled={pinLoading || unlocking} className={primaryButtonClass}>
                              {pinLoading || unlocking ? 'Updating...' : 'Change PIN'}
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleChangePinWithRecoveryCode} className="space-y-3">
                        <p className="text-xs leading-relaxed text-text-muted">
                          Set a new PIN with your recovery code. You'll get a new recovery code afterwards.
                        </p>
                        <div>
                          <label htmlFor="pin-recovery-code" className={labelClass}>Recovery code</label>
                          <input
                            id="pin-recovery-code"
                            type="text"
                            value={recoveryCodeInput}
                            onChange={e => setRecoveryCodeInput(e.target.value)}
                            required
                            autoComplete="off"
                            inputMode="text"
                            className={`password-field ${inputClass}`}
                          />
                        </div>
                        <PinInput
                          id="settings-recovery-pin"
                          label="New vault PIN"
                          value={recoveryPin}
                          onChange={setRecoveryPin}
                          disabled={pinRecoveryLoading || unlocking}
                        />
                        <PinInput
                          id="settings-recovery-confirm-pin"
                          label="Confirm new vault PIN"
                          value={confirmRecoveryPin}
                          onChange={setConfirmRecoveryPin}
                          disabled={pinRecoveryLoading || unlocking}
                        />
                        <WeakPinWarning message={!validateVaultPin(recoveryPin) ? getWeakPinWarning(recoveryPin) : null} />
                        <FormActions
                          onCancel={closeRow}
                          submitLabel="Reset PIN"
                          busy={pinRecoveryLoading || unlocking}
                          busyLabel="Updating..."
                        />
                      </form>
                    )}
                  </SettingRow>

                  <PasskeyManager />
                </SettingGroup>

                <SettingGroup label="Recovery">
                  <SettingRow
                    title="Recovery code"
                    description="A one-time code that resets your vault PIN if you forget it. Making a new one replaces the old one."
                    open={openRow === 'recovery-code'}
                    action={openRow !== 'recovery-code' && (
                      <button type="button" onClick={() => toggleRow('recovery-code')} className={rowButtonClass}>Create new</button>
                    )}
                  >
                    <form onSubmit={handleSetupRecoveryCode} className="space-y-3">
                      <PinInput
                        id="settings-recovery-setup-pin"
                        label="Current vault PIN"
                        value={recoverySetupPin}
                        onChange={setRecoverySetupPin}
                        disabled={recoverySetupLoading || unlocking}
                      />
                      <FormActions
                        onCancel={closeRow}
                        submitLabel="Create code"
                        busy={recoverySetupLoading || unlocking}
                        busyLabel="Creating..."
                        disabled={!recoverySetupPin}
                      />
                    </form>
                  </SettingRow>
                </SettingGroup>

                {oneTimeRecoveryCode && (
                  <RecoveryCodeDialog
                    code={oneTimeRecoveryCode}
                    description="Save this code now. It replaces your previous recovery code."
                    onAcknowledge={() => setOneTimeRecoveryCode('')}
                  />
                )}

                <SettingGroup label="Locking">
                  <SettingRow
                    title="Auto-lock"
                    description="Lock the vault after a period of inactivity. Applies to this device only."
                    action={
                      <select
                        value={autoLockId}
                        onChange={(e) => { setAutoLock(e.target.value); toast.success('Auto-lock updated.') }}
                        aria-label="Auto-lock after"
                        className="rounded-xl border border-bg-border-soft bg-bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                      >
                        {VAULT_AUTO_LOCK_OPTIONS.map(o => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                    }
                  />
                  <SettingRow
                    title="Lock now"
                    description="Your PIN or passkey will be needed again to see your data."
                    action={
                      <button type="button" onClick={handleLockVault} className={rowButtonClass}>
                        <Lock size={15} /> Lock vault
                      </button>
                    }
                  />
                </SettingGroup>
              </SettingsSection>

              {/* Appearance */}
              <SettingsSection id="appearance" active={activeSection}>
                <SettingGroup>
                  <SettingRow
                    title="Theme"
                    description={selectedTheme?.description}
                    action={
                      <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-bg-elevated p-0.5">
                        {themeModes.map(option => {
                          const selected = themeMode === option.id
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => setThemeMode(option.id)}
                              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                selected ? 'bg-bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                              }`}
                            >
                              {option.name}
                            </button>
                          )
                        })}
                      </div>
                    }
                  />
                  <SettingRow
                    title="Accent colour"
                    description={selectedAccent?.name}
                    action={
                      <div role="radiogroup" aria-label="Accent colour" className="flex items-center gap-2">
                        {accentColors.map(option => {
                          const selected = accentColor === option.id
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={option.name}
                              title={option.name}
                              onClick={() => setAccentColor(option.id)}
                              className={`flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-bg-surface transition-shadow ${
                                selected ? 'ring-2 ring-text-primary' : 'hover:ring-2 hover:ring-bg-border'
                              }`}
                              style={{ backgroundColor: option.swatch }}
                            >
                              {selected && <Check size={15} className="text-white drop-shadow" />}
                            </button>
                          )
                        })}
                      </div>
                    }
                  />
                </SettingGroup>
                <p className="mt-3 px-1 text-xs text-text-muted">
                  {LOCAL ? 'Saved in this browser.' : 'Synced to your account, so every device looks the same.'}
                </p>
              </SettingsSection>

              {/* Backup */}
              <SettingsSection id="backup" active={activeSection}>
                <SettingGroup>
                  <SettingRow
                    title="Export backup"
                    description="Downloads all your spaces and items as an encrypted file."
                    action={
                      <button type="button" onClick={handleExport} className={rowButtonClass}>
                        <Download size={15} /> Export
                      </button>
                    }
                  />
                  <SettingRow
                    title="Import backup"
                    description="Adds the spaces and items from a backup file. Nothing you already have is replaced."
                    action={
                      <button type="button" onClick={() => importRef.current?.click()} className={rowButtonClass}>
                        <Upload size={15} /> Import
                      </button>
                    }
                  />
                </SettingGroup>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-relaxed text-text-muted">
                  <Lock size={14} className="mt-0.5 shrink-0 text-accent" />
                  Backups are encrypted. They open in this vault as they are, and anywhere else with the vault PIN you had when exporting. After a PIN change, older backups still need the earlier PIN.
                </p>
              </SettingsSection>

              {/* About */}
              <SettingsSection id="about" active={activeSection}>
                <SettingGroup>
                  <SettingRow
                    title="Terms of Service"
                    action={
                      <a href="/terms" target="_blank" rel="noreferrer" className={rowButtonClass}>
                        <ExternalLink size={15} /> Open
                      </a>
                    }
                  />
                  <SettingRow
                    title="Privacy Policy"
                    action={
                      <a href="/privacy" target="_blank" rel="noreferrer" className={rowButtonClass}>
                        <ExternalLink size={15} /> Open
                      </a>
                    }
                  />
                  <SettingRow
                    title="Open Source"
                    action={
                      <a href={REPO_URL} target="_blank" rel="noreferrer" className={rowButtonClass}>
                        <ExternalLink size={15} /> Open
                      </a>
                    }
                  />
                </SettingGroup>
              </SettingsSection>
            </div>

            <p className="mt-6 shrink-0 text-center text-xs text-text-muted">
              <a
                href={COMMIT_URL}
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-text-primary transition-colors"
                title="View this build's source commit"
              >
                v{APP_VERSION}
              </a>
            </p>
          </div>
        </div>
      </main>

      {deleteStep === 'warning' && (
        <Modal
          title="Delete account permanently"
          onClose={resetDeleteFlow}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetDeleteFlow}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setDeleteStep('confirm')}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                I understand
              </button>
            </div>
          }
        >
          <div className="flex items-start gap-3 text-sm leading-6 text-text-secondary">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-2">
              <p>All spaces and items will be permanently deleted.</p>
              <p>Your encrypted vault cannot be recovered afterward, even with your recovery code.</p>
              <p className="font-semibold text-danger">This action is permanent. It cannot be undone.</p>
            </div>
          </div>
        </Modal>
      )}

      {deleteStep === 'confirm' && (
        <Modal
          title="Confirm account deletion"
          onClose={resetDeleteFlow}
          onSubmit={handleDeleteAccount}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetDeleteFlow}
                disabled={deleteLoading}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleteLoading || unlocking}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                {deleteLoading || unlocking ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          }
        >
          <p className="text-xs text-text-muted mb-3">
            Type <span className="font-mono text-danger">{deleteConfirmationPhrase}</span> and re-enter your credentials.
          </p>
          <div className="space-y-3">
            <div>
              <label htmlFor="delete-confirm-text" className="block text-xs font-medium text-text-secondary mb-1.5">
                Confirmation text
              </label>
              <input
                id="delete-confirm-text"
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                required
                autoComplete="off"
                className="w-full bg-bg-elevated border border-bg-border-soft rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="delete-password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Login password
              </label>
              <div className="relative">
                <input
                  id="delete-password"
                  type={showDeletePassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="password-field w-full bg-bg-elevated border border-bg-border-soft rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                  aria-label="Toggle delete password visibility"
                >
                  {showDeletePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <PinInput
              id="delete-vault-pin"
              label="Vault PIN"
              value={deletePin}
              onChange={setDeletePin}
              disabled={deleteLoading || unlocking}
            />
          </div>
        </Modal>
      )}

      {confirmSignOut && (
        <ConfirmDialog
          title={SIGN_OUT_CONFIRM[confirmSignOut].title}
          message={SIGN_OUT_CONFIRM[confirmSignOut].message}
          confirmLabel={SIGN_OUT_CONFIRM[confirmSignOut].confirmLabel}
          destructive
          onConfirm={() => {
            setConfirmSignOut(null)
            signOut({ scope: confirmSignOut })
            toast.info(SIGN_OUT_CONFIRM[confirmSignOut].done)
          }}
          onClose={() => setConfirmSignOut(null)}
        />
      )}
    </div>
  )
}
