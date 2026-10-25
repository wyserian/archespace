/**
 * SpaceModal.jsx - Modal for creating or editing a space: its name,
 * description and colour. Tags are added and removed on the space card.
 */
import { useState } from 'react'
import { Ban } from 'lucide-react'
import { Modal, Spinner } from '../ui/UI'
import { SPACE_COLORS } from '../../lib/spaceColors'
import { buttonClass } from '../ui/buttonStyles'

export function SpaceModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [color, setColor] = useState(initial?.color || null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      name: name.trim(),
      description: description.trim(),
      color,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal title={initial ? 'Edit space' : 'New space'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
          <input
            autoFocus
            placeholder="Space name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Description <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            placeholder="What's this space for?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-bg-elevated border border-bg-border rounded-xl px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors text-sm resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Color</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all bg-bg-elevated ${
                !color ? 'border-accent ring-2 ring-accent/30' : 'border-bg-border'
              }`}
              title="No color"
              aria-label="No color"
              aria-pressed={!color}
            >
              <Ban size={14} className="text-text-muted" />
            </button>
            {SPACE_COLORS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                style={{ backgroundColor: c.value }}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  color === c.id ? 'border-white ring-2 ring-accent/40 scale-110' : 'border-transparent'
                }`}
                title={c.label}
                aria-label={`${c.label} color`}
                aria-pressed={color === c.id}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className={buttonClass({ variant: 'secondary' })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className={buttonClass({ variant: 'primary' })}
          >
            {saving && <Spinner size={14} />}
            {initial ? 'Save changes' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
