/**
 * SpaceDestinations.jsx - Where something can move to: the dashboard (top
 * level), then the spaces as a tree (see moveDestinations), each sub-space
 * indented under its parent with its path as the hint.
 *
 * @param {{ spaces: Array, exclude?: Set<string>, top?: { hint: string } | null,
 *   onPick: (spaceId: string | null, name: string) => void, disabled?: boolean }} props
 *   `top` offers the dashboard (spaceId null) with that hint.
 */
import { LayoutDashboard, Folder } from 'lucide-react'
import { moveDestinations, spacePathLabel } from '../../lib/spaceTree'
import { getColorPreset } from '../../lib/spaceColors'
import { menuItemClass } from '../ui/menuStyles'

export function SpaceDestinations({ spaces, exclude, top, onPick, disabled }) {
  const spacesById = new Map(spaces.map(s => [s.id, s]))
  return (
    <div className="-mx-2">
      {top && (
        <button
          type="button"
          onClick={() => onPick(null, 'Dashboard')}
          disabled={disabled}
          className={menuItemClass()}
        >
          <LayoutDashboard size={14} className="shrink-0 text-text-muted" />
          <span className="min-w-0">
            <span className="block text-text-primary truncate">Dashboard</span>
            <span className="block text-[11px] font-normal text-text-muted truncate">{top.hint}</span>
          </span>
        </button>
      )}
      {moveDestinations(spaces, exclude).map(({ space, depth }) => {
        // A sub-space shows where it is; a top-level space its description.
        const hint = depth > 0 ? spacePathLabel(space.parent_id, spacesById) : space.description
        return (
          <button
            key={space.id}
            type="button"
            onClick={() => onPick(space.id, space.name || 'space')}
            disabled={disabled}
            className={menuItemClass()}
            style={{ paddingLeft: `${8 + Math.min(depth, 4) * 14}px` }}
          >
            {/* In the space's own colour, so spaces tell apart at a glance. */}
            <Folder
              size={14}
              className="shrink-0 text-text-muted"
              style={{ color: getColorPreset(space.color)?.value }}
            />
            <span className="min-w-0">
              <span className="block text-text-primary truncate">{space.name || 'Untitled'}</span>
              {hint && (
                <span className="block text-[11px] font-normal text-text-muted truncate">{hint}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
