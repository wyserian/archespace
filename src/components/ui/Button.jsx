/**
 * Button.jsx - The app's buttons, in a few fixed styles so sizes and weights
 * stay the same everywhere (the styles are listed in buttonStyles.js).
 * IconButton is a round, borderless icon action with a tooltip; `active`
 * tints it for an on/off toggle (Protect, Read-only).
 */
import { BUTTON_BASE, buttonClass } from './buttonStyles'

const ICON_SIZES = { sm: 14, md: 15 }

/**
 * @param {{ variant?: string, size?: 'xs'|'sm'|'md'|'lg', icon?: Function, iconOnlyOnMobile?: boolean }} props
 *   `iconOnlyOnMobile` hides the label below the sm breakpoint (the button
 *   keeps its accessible name from `aria-label` or `title`).
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconOnlyOnMobile = false,
  className = '',
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonClass({
        variant,
        size,
        className: `${iconOnlyOnMobile ? 'max-sm:w-8 max-sm:px-0' : ''} ${className}`,
      })}
      {...props}
    >
      {Icon && <Icon size={ICON_SIZES[size]} className="shrink-0" />}
      {children != null && (
        iconOnlyOnMobile ? <span className="max-sm:hidden">{children}</span> : children
      )}
    </button>
  )
}

/**
 * A round, borderless icon action. `label` is its tooltip and accessible
 * name; `active` (when given) makes it a toggle, tinted while on.
 */
export function IconButton({
  icon: Icon,
  label,
  active,
  size = 'sm',
  className = '',
  type = 'button',
  ...props
}) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  return (
    <button
      type={type}
      aria-label={label}
      title={props.title ?? label}
      aria-pressed={active === undefined ? undefined : active}
      className={`${BUTTON_BASE} ${box} touch-target rounded-full ${
        active
          ? 'bg-accent-muted text-accent hover:text-accent-hover'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
      } ${className}`}
      {...props}
    >
      <Icon size={size === 'sm' ? 16 : 17} />
    </button>
  )
}
