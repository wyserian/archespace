/**
 * CardColumns.jsx - Cards as a round-robin masonry in `cols` columns, so the
 * order reads left to right across the top row (pinned and newest first).
 */
export function CardColumns({ cols, children }) {
  const cards = Array.isArray(children) ? children : [children]
  return (
    <div className="flex items-start gap-2 sm:gap-3">
      {Array.from({ length: cols }, (_, col) => (
        <div key={col} className="min-w-0 flex-1 flex flex-col gap-2 sm:gap-3">
          {cards.filter((_, i) => i % cols === col)}
        </div>
      ))}
    </div>
  )
}
