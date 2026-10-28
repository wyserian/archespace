/**
 * StoredGrid.jsx - Archive and Bin: their spaces and items as the dashboard's
 * grid cards, read-only, each with the page's own buttons in its header in
 * place of the card menu (`actions(entry, kind)`), and `note(entry)` (when it
 * was archived or deleted) under its name.
 */
import { useMemo } from 'react'
import SpaceItem from './SpaceItem'
import { SpaceCard } from './space/SpaceCard'
import { CardColumns } from './ui/CardColumns'
import { MIN_SPACE_COLUMN_PX } from './ui/columnFit'
import { useMediaQuery } from '../hooks/useMediaQuery'

const SECTION_HEADING = 'mb-3 px-1 text-base font-semibold text-text-primary'

export default function StoredGrid({
  spaces, items, selectMode, selectedSpaceIds, selectedItemIds, onToggleSpace, onToggleItem, actions, note,
}) {
  const cols = useMediaQuery('(min-width: 1024px)') ? 3 : 2
  // A space's count: the items here with it (archived or deleted along with it).
  const stats = useMemo(() => {
    const counts = {}
    for (const item of items) {
      if (item.space_id) counts[item.space_id] = { total: (counts[item.space_id]?.total || 0) + 1 }
    }
    return counts
  }, [items])

  return (
    <div className="space-y-6">
      {spaces.length > 0 && (
        <section>
          <h2 className={SECTION_HEADING}>Spaces</h2>
          <CardColumns cols={cols} minWidth={MIN_SPACE_COLUMN_PX}>
            {spaces.map((col, i) => (
              <SpaceCard
                key={col.id}
                col={col}
                index={i}
                search=""
                stats={stats}
                selectMode={selectMode}
                selected={selectedSpaceIds.has(col.id)}
                onToggleSelect={() => onToggleSpace(col.id)}
                actions={actions(col, 'space')}
                note={note(col)}
              />
            ))}
          </CardColumns>
        </section>
      )}
      {items.length > 0 && (
        <section>
          <h2 className={SECTION_HEADING}>Items</h2>
          <CardColumns cols={cols}>
            {items.map((item, i) => (
              <div key={item.id} data-item-id={item.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 40}ms` }}>
                <SpaceItem
                  item={item}
                  index={i}
                  readOnly
                  grid
                  selectMode={selectMode}
                  selected={selectedItemIds.has(item.id)}
                  onSelectedChange={onToggleItem}
                  actions={actions(item, 'item')}
                  note={note(item)}
                />
              </div>
            ))}
          </CardColumns>
        </section>
      )}
    </div>
  )
}
