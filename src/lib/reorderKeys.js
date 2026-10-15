/**
 * reorderKeys.js - Alt+Up / Alt+Down moves the focused space or item card one
 * place, so reordering works from the keyboard and with a screen reader, not
 * only by dragging. Ignored while typing (Option+Up/Down moves the text cursor
 * on a Mac).
 */

/** For `aria-keyshortcuts` on the focusable part of a reorderable card. */
export const REORDER_KEYSHORTCUTS = 'Alt+ArrowUp Alt+ArrowDown'

/** -1 for Alt+Up, 1 for Alt+Down (outside a text field), else 0. */
export function reorderKeyStep(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return 0
  const target = e.target
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return 0
  return e.key === 'ArrowUp' ? -1 : 1
}

/** Focus `selector` again once the moved card has re-rendered in its new place. */
export function refocusAfterMove(selector) {
  setTimeout(() => document.querySelector(selector)?.focus(), 60)
}
