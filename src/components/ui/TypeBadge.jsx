/**
 * TypeBadge.jsx - An item's type as its coloured icon in a tinted pill (the
 * mark on item cards), used wherever an item is listed so types read the same
 * everywhere: cards, Archive, Recycle bin, search results. The type's name is
 * its tooltip and accessible label.
 */
import { TYPE_LABELS, TYPE_STYLES, TYPE_ICONS } from '../../lib/itemTypes'

export function TypeBadge({ type, size = 14 }) {
  const Icon = TYPE_ICONS[type]
  const style = TYPE_STYLES[type]
  if (!Icon || !style) return null
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center p-1 rounded-md border ${style.bg} ${style.text} ${style.border}`}
      title={TYPE_LABELS[type]}
      aria-label={TYPE_LABELS[type]}
    >
      <Icon size={size} />
    </span>
  )
}
