/**
 * colorActions.jsx - The colour choices a Kanban stage offers in
 * its menu, and the tint a coloured one takes.
 */
import { Ban } from 'lucide-react'
import { SPACE_COLORS, getColorPreset, softColorValue } from '../../lib/spaceColors'

// A colour swatch as a menu icon, one per preset.
const SWATCHES = Object.fromEntries(SPACE_COLORS.map(c => [
  c.id,
  function Swatch({ className = '' }) {
    return <span className={`h-3 w-3 rounded-full ${className}`} style={{ backgroundColor: c.value }} />
  },
]))

/**
 * ActionMenu rows: "No color", then one per preset, `current` marked.
 * @param {string|null|undefined} current - a preset id, or none
 * @param {(id: string|null) => void} onPick
 */
export function colorActions(current, onPick) {
  return [
    { id: 'color-none', group: 'color', label: 'No color', icon: Ban, active: !getColorPreset(current), onClick: () => onPick(null) },
    ...SPACE_COLORS.map(c => ({
      id: `color-${c.id}`,
      group: 'color',
      label: c.label,
      icon: SWATCHES[c.id],
      active: current === c.id,
      onClick: () => onPick(c.id),
    })),
  ]
}

/**
 * The inline style for a coloured stage: a faint tint and a thin,
 * soft strip along the top, like a space card's. Undefined for no colour.
 */
export function colorTint(id) {
  const color = getColorPreset(id)?.value
  return color ? { backgroundColor: `${color}14`, boxShadow: `inset 0 2px 0 ${softColorValue(id, '80')}` } : undefined
}
