/**
 * CardSkeletons.jsx - Loading placeholders shaped like the real space and item
 * cards: the same surface, corners, padding and soft shadow, with no border,
 * so the page keeps its look as the content arrives.
 */

const BAR = 'rounded bg-bg-elevated'

/** A space card placeholder, as a grid card or a list row. */
export function SpaceCardSkeleton({ list = false }) {
  if (list) {
    return (
      <div className="flex items-center gap-3 sm:gap-4 rounded-xl pl-4 pr-3 py-3 bg-bg-card shadow-sm animate-pulse" aria-hidden="true">
        <div className={`h-4 w-32 sm:w-44 shrink-0 ${BAR}`} />
        <div className={`h-3 flex-1 ${BAR}`} />
        <div className={`h-3 w-12 shrink-0 ${BAR}`} />
      </div>
    )
  }
  return (
    <div className="rounded-2xl p-3.5 bg-bg-card shadow-sm animate-pulse" aria-hidden="true">
      <div className={`h-5 w-2/3 ${BAR}`} />
      <div className={`mt-3 h-3.5 w-full ${BAR}`} />
      <div className={`mt-2 h-3.5 w-4/5 ${BAR}`} />
      <div className="mt-4 flex items-center gap-1.5">
        <div className="h-5 w-12 rounded-md bg-bg-elevated" />
        <div className={`h-3 w-14 ${BAR}`} />
      </div>
    </div>
  )
}

/** An item card placeholder: the header with its type badge, then the
 *  content block. */
export function ItemCardSkeleton() {
  return (
    <div className="rounded-2xl bg-bg-card shadow-sm animate-pulse" aria-hidden="true">
      <div className="flex items-center gap-2 px-4 py-[9px] border-b border-bg-border">
        <div className="h-6 w-6 shrink-0 rounded-lg bg-bg-elevated" />
        <div className={`h-4 w-1/3 ${BAR}`} />
        <div className={`ml-auto h-4 w-14 ${BAR}`} />
      </div>
      <div className="px-4 py-4">
        <div className="h-20 rounded-xl bg-bg-elevated" />
      </div>
    </div>
  )
}
