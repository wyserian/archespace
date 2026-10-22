/**
 * PasskeyManager.jsx - Enable or remove biometric (WebAuthn PRF) unlock for the
 * vault. One passkey per browser (stored locally in IndexedDB). A row in
 * Settings > Vault; the PIN form opens from "Set up".
 */
import { useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { useEncryption } from '../context/EncryptionCore'
import { useToast } from '../context/ToastCore'
import PinInput from './PinInput'
import { ConfirmDialog } from './ui/UI'
import { SettingRow, FormActions } from './settings/SettingRow'
import { rowButtonClass, rowDangerButtonClass } from './settings/settingStyles'

function formatDate(value) {
  if (!value) return null
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return null
  }
}

export default function PasskeyManager() {
  const {
    passkeySupported,
    passkeys,
    enrollPasskey,
    removePasskey,
    vaultStatus,
    unlocking,
  } = useEncryption()
  const { toast } = useToast()

  const [pin, setPin] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [open, setOpen] = useState(false)

  const passkey = passkeys[0] || null

  const handleEnable = async (e) => {
    e.preventDefault()
    if (!pin) {
      toast.error('Enter your current vault PIN to enable biometric unlock.')
      return
    }
    setAdding(true)
    try {
      await enrollPasskey(pin)
      setPin('')
      setOpen(false)
      toast.success('Biometric unlock enabled.')
    } catch (err) {
      toast.error(err?.message || "Couldn't enable biometric unlock.")
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async () => {
    if (!passkey) return
    setRemoving(true)
    try {
      await removePasskey(passkey.id)
      setConfirmRemove(false)
      toast.success('Biometric unlock disabled.')
    } catch (err) {
      toast.error(err?.message || "Couldn't disable biometric unlock.")
    } finally {
      setRemoving(false)
    }
  }

  const closeForm = () => {
    setOpen(false)
    setPin('')
  }

  const since = passkey ? formatDate(passkey.createdAt) : null
  let description
  let action = null
  if (!passkeySupported) {
    description = 'Not available on this device or browser.'
  } else if (!vaultStatus.hasVault) {
    description = 'Create a vault PIN first, then you can turn this on.'
  } else if (passkey) {
    description = `On for this browser${since ? ` since ${since}` : ''}. Your PIN and recovery code still work.`
    action = (
      <button type="button" onClick={() => setConfirmRemove(true)} disabled={removing} className={rowDangerButtonClass}>
        Turn off
      </button>
    )
  } else {
    description = 'Unlock with Face ID, Touch ID or Windows Hello instead of typing your PIN, on this browser.'
    action = !open && (
      <button type="button" onClick={() => setOpen(true)} className={rowButtonClass}>
        <Fingerprint size={15} /> Set up
      </button>
    )
  }

  // One element, so it sits as a single row in the settings group's list.
  return (
    <div>
      <SettingRow title="Biometric unlock" description={description} action={action} open={open && !passkey}>
        <form onSubmit={handleEnable} className="space-y-3">
          <PinInput
            id="passkey-current-pin"
            label="Current vault PIN"
            value={pin}
            onChange={setPin}
            disabled={adding || unlocking}
          />
          <FormActions
            onCancel={closeForm}
            submitLabel="Turn on"
            busy={adding}
            busyLabel="Waiting for device..."
            disabled={unlocking || !pin}
          />
        </form>
      </SettingRow>

      {confirmRemove && (
        <ConfirmDialog
          title="Turn off biometric unlock?"
          message="This browser will no longer unlock with biometrics. You can still unlock with your PIN, and turn it on again later."
          confirmLabel="Turn off"
          destructive
          busy={removing}
          onConfirm={handleRemove}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  )
}
