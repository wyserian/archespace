/**
 * ArchivePage.jsx - Archived spaces and items (reversible).
 */
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Archive, RotateCcw, Trash2, Folder, LayoutList, CheckSquare, ListChecks } from 'lucide-react'
import { useArchive } from '../hooks/useArchive'
import { useDualEntitySelection } from '../hooks/useDualEntitySelection'
import { useToast } from '../context/ToastCore'
import BulkSelectionBar from '../components/BulkSelectionBar'
import { BULK_ICONS } from '../components/BulkSelectionIcons'
import SelectableRow from '../components/SelectableRow'
import { Spinner } from '../components/ui/UI'
import { Button, IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { TypeBadge } from '../components/ui/TypeBadge'
import { timeAgo } from '../lib/timeAgo'

export default function ArchivePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    data, isLoading, unarchiveSpace, unarchiveItem,
    bulkUnarchiveSpaces, bulkUnarchiveItems,
    moveSpaceToBin, moveItemToBin, bulkMoveSpacesToBin, bulkMoveItemsToBin,
    total,
  } = useArchive()

  const spaces = data?.spaces || []
  const items = data?.items || []

  const {
    selectMode, setSelectMode, selectedSpaceIds, selectedItemIds,
    selectableTotal, selectedCount, exitSelectMode, selectAll, toggleSpace, toggleItem,
  } = useDualEntitySelection(spaces, items)

  const runBulkUnarchive = useCallback(async () => {
    const colIds = [...selectedSpaceIds]
    const itemIds = [...selectedItemIds]
    const count = colIds.length + itemIds.length
    if (!count) return
    try {
      if (colIds.length) await bulkUnarchiveSpaces.mutateAsync(colIds)
      if (itemIds.length) await bulkUnarchiveItems.mutateAsync(itemIds)
      toast.success(`Restored ${count} ${count === 1 ? 'item' : 'items'} from archive`)
      exitSelectMode()
    } catch {
      toast.error("Couldn't restore selection.")
    }
  }, [selectedSpaceIds, selectedItemIds, bulkUnarchiveSpaces, bulkUnarchiveItems, exitSelectMode, toast])

  const runBulkMoveToBin = useCallback(async () => {
    const colIds = [...selectedSpaceIds]
    const itemIds = [...selectedItemIds]
    const count = colIds.length + itemIds.length
    if (!count) return
    try {
      if (colIds.length) await bulkMoveSpacesToBin.mutateAsync(colIds)
      if (itemIds.length) await bulkMoveItemsToBin.mutateAsync(itemIds)
      toast.success(`Moved ${count} ${count === 1 ? 'item' : 'items'} to bin`)
      exitSelectMode()
    } catch {
      toast.error("Couldn't move the selection to the bin.")
    }
  }, [selectedSpaceIds, selectedItemIds, bulkMoveSpacesToBin, bulkMoveItemsToBin, exitSelectMode, toast])

  const bulkActions = useMemo(() => [
    {
      id: 'restore',
      label: 'Restore from archive',
      icon: BULK_ICONS.restore,
      onClick: runBulkUnarchive,
    },
    {
      id: 'move-to-bin',
      label: 'Move to bin',
      icon: BULK_ICONS.trash,
      variant: 'danger',
      onClick: runBulkMoveToBin,
    },
  ], [runBulkUnarchive, runBulkMoveToBin])

  return (
    <div className="min-h-screen bg-bg-base pb-32">
      <header className="sticky top-0 z-20 glass">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Phones only: from sm up the sidebar is the way around. */}
          <IconButton icon={ArrowLeft} label="Back" size="md" className="-ml-1.5 sm:hidden" onClick={() => navigate('/app')} />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-text-primary">Archive</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {total} archived - hidden from dashboard, not deleted
            </p>
          </div>
          {selectMode && selectableTotal > 0 && (
            <Button variant="ghost" size="sm" icon={ListChecks} iconOnlyOnMobile aria-label="Select all" onClick={selectAll}>
              Select all
            </Button>
          )}
          {selectableTotal > 0 && (
            <Button
              variant={selectMode ? 'secondary' : 'ghost'}
              size="sm"
              icon={CheckSquare}
              aria-label={selectMode ? 'Done selecting' : 'Select'}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : total === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
              <Archive size={20} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">Archive is empty</p>
            <p className="text-text-muted text-sm mt-1">Archive spaces from the dashboard menu</p>
          </div>
        ) : (
          <div className="space-y-6">
            {spaces.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Folder size={14} className="text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Spaces</h2>
                </div>
                <div className="space-y-2">
                  {spaces.map(col => (
                    <SelectableRow
                      key={col.id}
                      selectMode={selectMode}
                      selected={selectedSpaceIds.has(col.id)}
                      onToggle={() => toggleSpace(col.id)}
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={() => unarchiveSpace.mutate(col.id, {
                              onSuccess: () => toast.success('Space restored from archive'),
                              onError: () => toast.error("Couldn't restore it."),
                            })}
                            className={buttonClass({ variant: 'secondary', size: 'sm' })}
                          >
                            <RotateCcw size={14} /> Unarchive
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSpaceToBin.mutate(col.id, {
                              onSuccess: () => toast.success('Space moved to bin'),
                              onError: () => toast.error("Couldn't move it to the bin."),
                            })}
                            title="Move to bin"
                            className={buttonClass({ variant: 'danger', size: 'sm' })}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </>
                      }
                    >
                      <p className="text-sm font-semibold text-text-primary truncate">{col.name}</p>
                      <p className="text-xs text-text-muted mt-1">Archived {timeAgo(col.archived_at)}</p>
                    </SelectableRow>
                  ))}
                </div>
              </section>
            )}
            {items.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <LayoutList size={14} className="text-text-muted" />
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Items</h2>
                </div>
                <div className="space-y-2">
                  {items.map(item => (
                    <SelectableRow
                      key={item.id}
                      selectMode={selectMode}
                      selected={selectedItemIds.has(item.id)}
                      onToggle={() => toggleItem(item.id)}
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={() => unarchiveItem.mutate(item.id, {
                              onSuccess: () => toast.success('Item restored'),
                              onError: () => toast.error("Couldn't restore it."),
                            })}
                            className={buttonClass({ variant: 'secondary', size: 'sm' })}
                          >
                            <RotateCcw size={14} /> Unarchive
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItemToBin.mutate(item.id, {
                              onSuccess: () => toast.success('Item moved to bin'),
                              onError: () => toast.error("Couldn't move it to the bin."),
                            })}
                            title="Move to bin"
                            className={buttonClass({ variant: 'danger', size: 'sm' })}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </>
                      }
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <TypeBadge type={item.type} />
                        <p className="min-w-0 text-sm font-semibold text-text-primary truncate">{item.title || 'Untitled'}</p>
                      </div>
                      {item.archived_at && (
                        <p className="text-xs text-text-muted mt-1">Archived {timeAgo(item.archived_at)}</p>
                      )}
                    </SelectableRow>
                  ))}
                </div>
              </section>
            )}

            <BulkSelectionBar
              count={selectedCount}
              onClear={exitSelectMode}
              actions={bulkActions}
            />
          </div>
        )}
      </main>
    </div>
  )
}
