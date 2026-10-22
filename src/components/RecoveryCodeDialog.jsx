/**
 * RecoveryCodeDialog.jsx - One-time recovery code shown in a popup, with copy,
 * download and an explicit "I've saved it" confirmation. Used after vault
 * setup / PIN reset and from Settings.
 */
import { useState } from 'react'
import { Copy, Check, AlertTriangle, Download } from 'lucide-react'
import { Modal } from './ui/UI'
import { buttonClass } from './ui/buttonStyles'

// Shown in groups of four to read and write down; entering it ignores the
// spaces (normalizeRecoveryCode).
const groupCode = (code) => code.match(/.{1,4}/g)?.join(' ') ?? code

export default function RecoveryCodeDialog({
  code,
  title = 'Save your recovery code',
  description = "Store this somewhere safe. It's shown only once - without it, a forgotten vault PIN leaves your data unrecoverable.",
  acknowledgeLabel = 'I saved this code',
  onAcknowledge,
  busy = false,
}) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const grouped = groupCode(code)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable - the code is still shown for manual copying.
    }
  }

  const download = () => {
    const text = `ArcheSpace vault recovery code\n\n${grouped}\n\nIt sets a new vault PIN if you forget yours. Keep this file private.\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'archespace-recovery-code.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Only the button finishes, once the user has confirmed they saved the code,
  // so nothing can dismiss it (and unlock the vault) unseen.
  const finish = () => {
    if (confirmed && !busy) onAcknowledge()
  }

  return (
    <Modal
      title={title}
      dismissible={false}
      footer={
        <div className="space-y-3">
          <label className="flex cursor-pointer select-none items-start gap-2.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-bg-border bg-bg-elevated accent-accent"
            />
            I&apos;ve saved my recovery code somewhere safe.
          </label>

          <button
            type="button"
            onClick={finish}
            disabled={busy || !confirmed}
            className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}
          >
            {acknowledgeLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg bg-amber-400/10 border border-amber-400/20 px-3 py-2.5 text-xs leading-relaxed text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {description}
        </p>

        <div className="rounded-xl bg-bg-sunken p-4 space-y-3">
          <p className="text-center font-mono text-xl tracking-[0.15em] text-text-primary" aria-label={`Recovery code: ${code.split('').join(' ')}`}>
            {grouped}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copy}
              className={buttonClass({ variant: 'secondary', className: 'w-full' })}
            >
              {copied ? (
                <>
                  <Check size={15} className="text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy size={15} /> Copy
                </>
              )}
            </button>
            <button
              type="button"
              onClick={download}
              className={buttonClass({ variant: 'secondary', className: 'w-full' })}
            >
              <Download size={15} /> Download
            </button>
          </div>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {copied ? 'Recovery code copied to clipboard' : ''}
      </span>
    </Modal>
  )
}
