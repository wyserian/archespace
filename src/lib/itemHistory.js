/**
 * itemHistory.js - Undo / redo history of item content edits on a page (see
 * useItemBoard). Each saved change of an item's content is one step: what
 * it was before and after. A rename, star, move or anything else is not.
 */

export const EMPTY_HISTORY = { past: [], future: [] }

// Steps kept; the oldest go first.
const MAX_STEPS = 100

export const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** `history` with a saved edit of item `id` added (a new edit ends redo). */
export function recordEdit(history, id, before, after) {
  if (sameContent(before, after)) return history
  return { past: [...history.past, { id, before, after }].slice(-MAX_STEPS), future: [] }
}

/** After undoing the latest step: it moves to redo. */
export const afterUndo = ({ past, future }) =>
  ({ past: past.slice(0, -1), future: [...future, past.at(-1)] })

/** After redoing the latest undone step: it moves back to undo. */
export const afterRedo = ({ past, future }) =>
  ({ past: [...past, future.at(-1)], future: future.slice(0, -1) })

/** Without the step at the top of `side` ('past' or 'future'), e.g. one that can't apply. */
export const withoutTop = (history, side) => ({ ...history, [side]: history[side].slice(0, -1) })
