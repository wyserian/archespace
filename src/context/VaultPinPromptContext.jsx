/**
 * VaultPinPromptContext.jsx - Asks for the vault PIN before showing protected
 * content or erasing the local vault, or for the PIN of a backup made in
 * another vault. This vault's PIN is checked like an unlock: wrong entries
 * count towards the same lockout.
 */
import { useCallback, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { useEncryption } from './EncryptionCore'
import { VaultPinPromptContext } from './VaultPinPromptCore'
import { Modal } from '../components/ui/UI'
import PinInput from '../components/PinInput'
import { buttonClass } from '../components/ui/buttonStyles'

export function VaultPinPromptProvider({ children }) {
  const [request, setRequest] = useState(null)
  const resolveRef = useRef(null)

  const askVaultPin = useCallback((options = {}) => new Promise((resolve) => {
    // A second request replaces (and cancels) one still open.
    resolveRef.current?.(false)
    resolveRef.current = resolve
    setRequest(options)
  }), [])

  const finish = useCallback((ok) => {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setRequest(null)
  }, [])

  return (
    <VaultPinPromptContext.Provider value={askVaultPin}>
      {children}
      {request && <VaultPinDialog {...request} onDone={finish} />}
    </VaultPinPromptContext.Provider>
  )
}

function VaultPinDialog({
  title = 'Enter vault PIN',
  message = 'Enter your vault PIN to continue.',
  confirmLabel = 'Unlock',
  // Checks a PIN; defaults to this vault's PIN. A backup from another vault
  // passes its own check.
  verify,
  // The confirm button in red, for an action that deletes something.
  destructive = false,
  onDone,
}) {
  const { verifyVaultPin: verifyThisVault } = useEncryption()
  const verifyVaultPin = verify || verifyThisVault
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    setError('')
    try {
      if (await verifyVaultPin(pin)) {
        onDone(true)
        return
      }
      setError('Incorrect PIN.')
      setPin('')
    } catch (err) {
      setError(err?.message || "Couldn't check the PIN.")
    }
    setBusy(false)
  }

  return (
    <Modal
      title={title}
      onClose={() => onDone(false)}
      onSubmit={submit}
      footer={
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => onDone(false)}
            disabled={busy}
            className={buttonClass({ variant: 'secondary' })}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !pin}
            className={buttonClass({ variant: destructive ? 'dangerSolid' : 'primary' })}
          >
            {busy ? 'Checking...' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-muted text-accent">
          <Lock size={16} />
        </span>
        <p className="text-sm leading-6 text-text-secondary">{message}</p>
      </div>
      <PinInput
        id="vault-pin-prompt"
        label="Vault PIN"
        value={pin}
        onChange={(v) => { setPin(v); if (error) setError('') }}
        disabled={busy}
        autoFocus
        autoComplete="current-password"
      />
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </Modal>
  )
}
