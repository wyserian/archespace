/**
 * columnFit.js - How many card columns fit a width (see CardColumns).
 */

// About 45 characters of note text per line in an item card. Space cards hold
// only a name and a line or two, so they can sit narrower.
export const MIN_ITEM_COLUMN_PX = 300
export const MIN_SPACE_COLUMN_PX = 200
const GAP_PX = 12

/** How many of `cols` columns fit in `width` px without one getting narrower
 *  than `minWidth` (always at least one; `cols` while not yet measured). */
export function columnsThatFit(width, cols, minWidth = MIN_ITEM_COLUMN_PX) {
  if (!width) return cols
  return Math.max(1, Math.min(cols, Math.floor((width + GAP_PX) / (minWidth + GAP_PX))))
}
