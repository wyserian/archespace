/**
 * ColorSwatches.jsx - "No color" plus one swatch per space colour preset,
 * for a space (SpaceModal) or an item card. `value` is a preset id or null.
 */
import { Ban } from 'lucide-react'
import { SPACE_COLORS } from '../../lib/spaceColors'

export function ColorSwatches({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all bg-bg-elevated ${
          !value ? 'border-accent ring-2 ring-accent/30' : 'border-bg-border'
        }`}
        title="No color"
        aria-label="No color"
        aria-pressed={!value}
      >
        <Ban size={14} className="text-text-muted" />
      </button>
      {SPACE_COLORS.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          style={{ backgroundColor: c.value }}
          className={`w-8 h-8 rounded-lg border-2 transition-all ${
            value === c.id ? 'border-white ring-2 ring-accent/40 scale-110' : 'border-transparent'
          }`}
          title={c.label}
          aria-label={`${c.label} color`}
          aria-pressed={value === c.id}
        />
      ))}
    </div>
  )
}
