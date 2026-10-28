/**
 * RecycleBinPage.jsx - Soft-deleted spaces and items, as read-only grid cards
 * with Restore and Delete permanently on each.
 */
import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, RotateCcw, AlertTriangle, CheckSquare, ListChecks,
} from 'lucide-react'
import { useRecycleBin } from '../hooks/useRecycleBin'
import { useDualEntitySelection } from '../hooks/useDualEntitySelection'
import { useToast } from '../context/ToastCore'
import BulkSelectionBar from '../components/BulkSelectionBar'
import { BULK_ICONS } from '../components/BulkSelectionIcons'
import StoredGrid from '../components/StoredGrid'
import { Spinner, Modal } from '../components/ui/UI'
import { Button, IconButton } from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonStyles'
import { timeAgo } from '../lib/timeAgo'

export default function RecycleBinPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    data, isLoading, restoreSpace, purgeSpace, restoreItem, purgeItem,
    bulkRestoreSpaces, bulkRestoreItems, bulkPurgeSpaces, bulkPurgeItems,
    emptyBin, total,
  } = useRecycleBin()

  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(null)
  const [confirmBulkPurge, setConfirmBulkPurge] = useState(false)

  const spaces = data?.spaces || []
  const items = data?.items || []

  const {
    selectMode, setSelectMode, selectedSpaceIds, selectedItemIds,
    selectableTotal, selectedCount, exitSelectMode, selectAll, toggleSpace, toggleItem,
  } = useDualEntitySelection(spaces, items)

  const runBulkRestore = useCallback(async () => {
    const colIds = [...selectedSpaceIds]
    const itemIds = [...selectedItemIds]
    const count = colIds.length + itemIds.length
    if (!count) return
    try {
      if (colIds.length) await bulkRestoreSpaces.mutateAsync(colIds)
      if (itemIds.length) await bulkRestoreItems.mutateAsync(itemIds)
      toast.success(`Restored ${count} ${count === 1 ? 'item' : 'items'}`)
      exitSelectMode()
    } catch {
      toast.error("Couldn't restore selection.")
    }
  }, [selectedSpaceIds, selectedItemIds, bulkRestoreSpaces, bulkRestoreItems, exitSelectMode, toast])

  const runBulkPurge = useCallback(async () => {
    const colIds = [...selectedSpaceIds]
    const itemIds = [...selectedItemIds]
    const count = colIds.length + itemIds.length
    try {
      if (itemIds.length) await bulkPurgeItems.mutateAsync(itemIds)
      if (colIds.length) await bulkPurgeSpaces.mutateAsync(colIds)
      toast.success(`Permanently deleted ${count} ${count === 1 ? 'item' : 'items'}`)
      setConfirmBulkPurge(false)
      exitSelectMode()
    } catch {
      toast.error("Couldn't delete selection.")
    }
  }, [selectedSpaceIds, selectedItemIds, bulkPurgeSpaces, bulkPurgeItems, exitSelectMode, toast])

  const bulkActions = useMemo(() => [
    {
      id: 'restore',
      label: 'Restore',
      icon: BULK_ICONS.restore,
      onClick: runBulkRestore,
    },
    {
      id: 'purge',
      label: 'Delete permanently',
      icon: BULK_ICONS.trash,
      variant: 'danger',
      onClick: () => setConfirmBulkPurge(true),
    },
  ], [runBulkRestore])

  // A card's buttons: Restore and Delete permanently.
  const cardButtons = (entry, kind) => (
    <>
      <button
        type="button"
        onClick={() => (kind === 'space' ? restoreSpace : restoreItem).mutate(entry.id, {
          onSuccess: () => toast.success(kind === 'space' ? 'Space restored' : 'Item restored'),
          onError: () => toast.error(kind === 'space' ? "Couldn't restore space." : "Couldn't restore item."),
        })}
        className={buttonClass({ variant: 'secondary', size: 'xs' })}
      >
        <RotateCcw size={14} /> Restore
      </button>
      <button
        type="button"
        onClick={() => setConfirmPurge({ type: kind, id: entry.id, name: (kind === 'space' ? entry.name : entry.title) || 'Untitled' })}
        className={buttonClass({ variant: 'danger', size: 'xs' })}
      >
        <Trash2 size={14} /> Delete permanently
      </button>
    </>
  )

  const handleEmptyBin = async () => {
    try {
      await emptyBin.mutateAsync()
      toast.success('Bin emptied')
      setConfirmEmpty(false)
      exitSelectMode()
    } catch {
      toast.error("Couldn't empty the bin.")
    }
  }

  const handlePurge = async () => {
    if (!confirmPurge) return
    try {
      if (confirmPurge.type === 'space') {
        await purgeSpace.mutateAsync(confirmPurge.id)
      } else {
        await purgeItem.mutateAsync(confirmPurge.id)
      }
      toast.success('Permanently deleted')
      setConfirmPurge(null)
    } catch {
      toast.error("Couldn't delete permanently.")
    }
  }

  return (
    <div className="min-h-screen bg-bg-base pb-32">
      <header className="sticky top-0 z-20 glass">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Phones only: from sm up the sidebar is the way around. */}
          <IconButton icon={ArrowLeft} label="Back" size="md" className="-ml-1.5 sm:hidden" onClick={() => navigate('/app')} />

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-text-primary">Bin</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {total} {total === 1 ? 'item' : 'items'} - deleted items are kept here until permanently removed
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
            {total > 0 && !selectMode && (
              <Button variant="danger" size="sm" icon={Trash2} iconOnlyOnMobile aria-label="Empty bin" onClick={() => setConfirmEmpty(true)}>
                Empty bin
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : total === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">Bin is empty</p>
            <p className="text-text-muted text-sm mt-1">Deleted spaces and items will appear here</p>
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
              note={entry => (entry.deleted_at ? `Deleted ${timeAgo(entry.deleted_at)}` : null)}
            />

            <BulkSelectionBar
              count={selectedCount}
              onClear={exitSelectMode}
              actions={bulkActions}
            />
          </>
        )}
      </main>

      {confirmEmpty && (
        <Modal
          title="Empty the bin?"
          onClose={() => setConfirmEmpty(false)}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmEmpty(false)}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmptyBin}
                disabled={emptyBin.isPending}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                {emptyBin.isPending && <Spinner size={14} />}
                Empty bin permanently
              </button>
            </div>
          }
        >
          <div className="flex gap-3 items-start">
            <div className="w-9 h-9 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={16} className="text-danger" />
            </div>
            <p className="text-text-secondary text-sm leading-relaxed">
              This will permanently delete all <strong className="text-text-primary">{total} {total === 1 ? 'item' : 'items'}</strong> in the bin. This cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {confirmBulkPurge && (
        <Modal
          title={`Delete ${selectedCount} permanently?`}
          onClose={() => setConfirmBulkPurge(false)}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmBulkPurge(false)}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runBulkPurge}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Delete permanently
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm">Selected items cannot be recovered after this.</p>
        </Modal>
      )}

      {confirmPurge && (
        <Modal
          title="Delete permanently?"
          onClose={() => setConfirmPurge(null)}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmPurge(null)}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurge}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Delete permanently
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm leading-relaxed">
            <strong className="text-text-primary">&quot;{confirmPurge.name}&quot;</strong> will be permanently deleted and cannot be recovered.
          </p>
        </Modal>
      )}
    </div>
  )
}
