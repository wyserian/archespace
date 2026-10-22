/**
 * CardColumns.jsx - Cards as a round-robin masonry in up to `cols` columns, so
 * the order reads left to right across the top row (pinned and newest first).
 * It measures its own width and drops to fewer columns rather than let a card
 * get narrower than `minWidth`, so note text keeps a readable line length
 * whatever the sidebar and window leave.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { columnsThatFit, MIN_ITEM_COLUMN_PX } from './columnFit'

export function CardColumns({ cols, minWidth = MIN_ITEM_COLUMN_PX, children }) {
  const cards = Array.isArray(children) ? children : [children]
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fit = columnsThatFit(width, cols, minWidth)

  return (
    <div ref={ref} className="flex items-start gap-2 sm:gap-3">
      {Array.from({ length: fit }, (_, col) => (
        <div key={col} className="min-w-0 flex-1 flex flex-col gap-2 sm:gap-3">
          {cards.filter((_, i) => i % fit === col)}
        </div>
      ))}
    </div>
  )
}
