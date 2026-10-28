/**
 * ArchivePage.jsx - Archived spaces and items (reversible), as read-only grid
 * cards with Unarchive and Delete on each.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Archive, RotateCcw, Trash2, CheckSquare, ListChecks } from 'lucide-react'
import { useArchive } from '../hooks/useArchive'
import { useDualEntitySelection } from '../hooks/useDualEntitySelection'
import { useToast } from '../context/ToastCore'
import BulkSelectionBar from '../components/BulkSelectionBar'
import { BULK_ICONS } from '../components/BulkSelectionIcons'
import StoredGrid from '../components/StoredGrid'
import { ConfirmDialog, Spinner } from '../components/ui/UI'
import { Button, IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
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

  // What's waiting for the "move to the bin" confirmation: one space or item
  // ({ kind, id, name }), or the selection ({ kind: 'bulk' }).
  const [binConfirm, setBinConfirm] = useState(null)

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
      toast.success(`Moved ${count} ${count === 1 ? 'item' : 'items'} to the bin`)
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
      label: 'Move to the bin',
      icon: BULK_ICONS.trash,
      variant: 'danger',
      onClick: () => setBinConfirm({ kind: 'bulk' }),
    },
  ], [runBulkUnarchive])

  // A card's buttons: Unarchive and Delete (to the bin).
  const cardButtons = (entry, kind) => (
    <>
      <button
        type="button"
        onClick={() => (kind === 'space' ? unarchiveSpace : unarchiveItem).mutate(entry.id, {
          onSuccess: () => toast.success(kind === 'space' ? 'Space restored from archive' : 'Item restored'),
          onError: () => toast.error("Couldn't restore it."),
        })}
        className={buttonClass({ variant: 'secondary', size: 'xs' })}
      >
        <RotateCcw size={14} /> Unarchive
      </button>
      <button
        type="button"
        onClick={() => setBinConfirm({ kind, id: entry.id, name: kind === 'space' ? entry.name : entry.title })}
        title="Move to the bin"
        className={buttonClass({ variant: 'danger', size: 'xs' })}
      >
        <Trash2 size={14} /> Delete
      </button>
    </>
  )

  const confirmMoveToBin = () => {
    const target = binConfirm
    setBinConfirm(null)
    if (target.kind === 'bulk') return runBulkMoveToBin()
    const isSpace = target.kind === 'space'
    ;(isSpace ? moveSpaceToBin : moveItemToBin).mutate(target.id, {
      onSuccess: () => toast.success(isSpace ? 'Space moved to the bin' : 'Item moved to the bin'),
      onError: () => toast.error("Couldn't move it to the bin."),
    })
  }

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

      <main className="px-4 sm:px-6 py-6">
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
          <>
            <StoredGrid
              spaces={spaces}
              items={items}
              selectMode={selectMode}
              selectedSpaceIds={selectedSpaceIds}
              selectedItemIds={selectedItemIds}
              onToggleSpace={toggleSpace}
              onToggleItem={toggleItem}
              actions={cardButtons}
              note={entry => (entry.archived_at ? `Archived ${timeAgo(entry.archived_at)}` : null)}
            />

            <BulkSelectionBar
              count={selectedCount}
              onClear={exitSelectMode}
              actions={bulkActions}
            />
          </>
        )}
      </main>

      {binConfirm && (
        <ConfirmDialog
          title={binConfirm.kind === 'bulk'
            ? `Move ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} to the bin?`
            : `Move ${binConfirm.kind} to the bin?`}
          message={binConfirm.kind === 'bulk'
            ? 'They go to the bin, where they can still be restored.'
            : `"${binConfirm.name || 'Untitled'}" will be moved to the bin, where it can still be restored.`}
          confirmLabel="Move to the bin"
          destructive
          onConfirm={confirmMoveToBin}
          onClose={() => setBinConfirm(null)}
        />
      )}
    </div>
  )
}
