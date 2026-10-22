/**
 * menuStyles.js - The one compact look shared by every popup menu and option
 * list (action, sort and settings menus, editor pickers, search results, the
 * command palette and dialog pickers), so their rows match everywhere.
 */

/** The floating panel around a menu's rows. */
export const MENU_PANEL = 'rounded-xl border border-bg-border bg-bg-surface p-1 shadow-2xl shadow-black/30'

/** A small heading above a group of rows. */
export const MENU_HEADING = 'px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted'

/** A shortcut hint at the end of a row. */
export const MENU_HINT = 'ml-auto shrink-0 font-sans text-[10px] text-text-muted'

/**
 * One row. `active`: the current choice (accent); `highlighted`: the row the
 * arrow keys are on; `danger`: a destructive action. Keyboard focus shows as
 * the hover highlight rather than the app-wide ring, which spills past rows
 * this small.
 */
export function menuItemClass({ active = false, highlighted = false, danger = false } = {}) {
  const tone = danger
    ? 'text-danger hover:bg-danger-muted focus-visible:bg-danger-muted'
    : active
      ? 'text-accent bg-accent-muted hover:bg-accent/20 focus-visible:bg-accent/20'
      : highlighted
        ? 'text-text-primary bg-bg-elevated'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated focus-visible:text-text-primary focus-visible:bg-bg-elevated'
  return `w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors focus-visible:!outline-none disabled:opacity-50 disabled:cursor-not-allowed ${tone}`
}
