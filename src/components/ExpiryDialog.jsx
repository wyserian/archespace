/**
 * ExpiryDialog.jsx - Set, change or cancel a space's or item's self-destruct
 * time (lib/expiry.js): a quick choice from now, or an exact day and time.
 * When it passes, the space or item is deleted for good on every device.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui/UI'
import { buttonClass } from './ui/buttonStyles'
import { EXPIRY_PRESETS, formatExpiryTime } from '../lib/expiry'
import { useNow } from '../hooks/useReminders'

const FIELD =
  'w-full bg-bg-elevated border border-bg-border rounded-xl px-3 py-2.5 text-sm text-text-primary ' +
  'focus:outline-none focus:border-accent transition-colors'

const pad = n => String(n).padStart(2, '0')
/** A Date as a datetime-local value ("2026-11-12T14:30"), in local time. */
const toLocalInput = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * @param {{ kind: 'item'|'space', initial?: string|null, onSave: (iso: string) => void, onRemove: () => void, onClose: () => void }} props
 */
export function ExpiryDialog({ kind, initial, onSave, onRemove, onClose }) {
  const [value, setValue] = useState(() => toLocalInput(initial ? new Date(initial) : new Date(Date.now() + EXPIRY_PRESETS[1].ms)))
  const [preset, setPreset] = useState(initial ? null : EXPIRY_PRESETS[1].id)
  const now = useNow()
  const at = value ? new Date(value) : null
  const valid = at && !Number.isNaN(at.getTime()) && at.getTime() > now.getTime() + 60 * 1000
  const what = kind === 'space' ? 'This space, with all its items and sub-spaces,' : 'This item'

  const save = (e) => {
    e?.preventDefault()
    if (!valid) return
    onSave(at.toISOString())
    onClose()
  }

  const dialog = (
    <Modal
      title="Self-destruct"
      onClose={onClose}
      onSubmit={save}
      footer={
        <div className="flex items-center gap-2">
          {initial && (
            <button type="button" onClick={() => { onRemove(); onClose() }} className={buttonClass({ variant: 'secondary' })}>
              Cancel self-destruct
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary' })}>
              Close
            </button>
            <button type="submit" disabled={!valid} className={buttonClass({ variant: 'danger' })}>
              {initial ? 'Save' : 'Set'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Deletes in">
          {EXPIRY_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPreset(p.id); setValue(toLocalInput(new Date(Date.now() + p.ms))) }}
              aria-pressed={preset === p.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                preset === p.id
                  ? 'border-accent-border bg-accent-muted text-accent'
                  : 'border-bg-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="expiry-at" className="block text-xs font-medium text-text-secondary mb-1.5">Deletes on</label>
          <input
            id="expiry-at"
            type="datetime-local"
            required
            min={toLocalInput(now)}
            value={value}
            onChange={e => { setValue(e.target.value); setPreset(null) }}
            className={FIELD}
          />
        </div>
        <p className="text-xs leading-5 text-text-muted">
          {valid
            ? <>{what} will be <strong className="text-danger">deleted permanently</strong> on {formatExpiryTime(at.toISOString())}, from all your devices. It won&apos;t go to the Recycle Bin and can&apos;t be restored.</>
            : 'Pick a time in the future.'}
        </p>
      </div>
    </Modal>
  )

  // Above a full-screen item card.
  return createPortal(<div className="relative z-[90]">{dialog}</div>, document.body)
}
