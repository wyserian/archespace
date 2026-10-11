/**
 * ItemBoardModals.jsx - The item dialogs of a useItemBoard page: add item (type
 * picker), move to bin (one or many), move to another space or the dashboard,
 * and the leave-with-unsaved-edits guard.
 *
 * @param {{ board: ReturnType<import('../hooks/useItemBoard').useItemBoard>, spaces: Array }} props
 *   `spaces` are the possible move destinations (the board's own space is left out).
 */
import { LayoutDashboard, Folder } from 'lucide-react'
import { ITEM_TYPE_OPTIONS } from '../lib/itemTypes'
import { spacePathLabel, treeOrder } from '../lib/spaceTree'
import { useToast } from '../context/ToastCore'
import { Modal } from './ui/UI'
import { buttonClass } from './ui/buttonStyles'
import { menuItemClass } from './ui/menuStyles'

export default function ItemBoardModals({ board, spaces }) {
  const { toast } = useToast()
  const {
    spaceId, api, dirtyItems,
    addModal, setAddModal, handleAddItem,
    deleteConfirm, setDeleteConfirm,
    bulkDeleteConfirm, setBulkDeleteConfirm,
    moveRequest, setMoveRequest, handleMoveItems,
    navBlocker,
  } = board
  const { remove, bulkRemove, move } = api

  // Inside a space, items can also move out to the dashboard.
  // A read-only space takes no new items, so it's never a destination.
  // Listed as a tree: each space followed by its sub-spaces, indented.
  const spacesById = new Map(spaces.map(s => [s.id, s]))
  const destinationSpaces = treeOrder(spaces)
    .filter(({ space: candidate }) => candidate.id !== spaceId && !candidate.read_only)
  const canMoveToDashboard = spaceId !== null

  return (
    <>
      {/* Add item type picker modal */}
      {addModal && (
        <Modal title="Add item" onClose={() => setAddModal(false)} size="lg">
          <p className="text-text-muted text-xs mb-3">Choose the type of content to add</p>
          {/* Equal tiles, three across: icon and name on one line, a short
              hint below. */}
          <div className="grid grid-cols-3 auto-rows-fr gap-2">
            {ITEM_TYPE_OPTIONS.map(({ type, label, desc, icon: Icon, color, bg }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAddItem(type)}
                className="flex flex-col gap-1.5 p-2 bg-bg-elevated hover:bg-bg-hover rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border"
              >
                <span className="flex items-center gap-2">
                  <span className={`w-6 h-6 shrink-0 rounded-md ${bg} flex items-center justify-center`}>
                    <Icon size={14} className={color} />
                  </span>
                  <span className="text-xs font-semibold text-text-primary leading-tight">{label}</span>
                </span>
                <span className="text-[11px] text-text-muted leading-snug line-clamp-2">{desc}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Unsaved changes navigation guard */}
      {navBlocker.state === 'blocked' && (
        <Modal
          title="Leave without saving?"
          onClose={() => navBlocker.reset()}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => navBlocker.reset()}
                className={buttonClass({ variant: 'secondary' })}
              >
                Stay
              </button>
              <button
                onClick={() => navBlocker.proceed()}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Leave anyway
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm leading-relaxed">
            You have {dirtyItems.size} {dirtyItems.size === 1 ? 'item' : 'items'} with unsaved changes.
            Leaving now may discard edits that have not been saved yet.
          </p>
        </Modal>
      )}

      {bulkDeleteConfirm && (
        <Modal
          title={`Move ${bulkDeleteConfirm.ids.length} items to bin?`}
          onClose={() => setBulkDeleteConfirm(null)}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBulkDeleteConfirm(null)}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  bulkRemove.mutate(bulkDeleteConfirm.ids, {
                    onSuccess: () => {
                      toast.success(`Moved ${bulkDeleteConfirm.ids.length} items to bin`)
                      bulkDeleteConfirm.onDone?.()
                      setBulkDeleteConfirm(null)
                    },
                    onError: () => toast.error("Couldn't delete items."),
                  })
                }}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Move to bin
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm leading-relaxed">
            Selected items will be moved to the recycle bin. You can restore them later.
          </p>
        </Modal>
      )}

      {moveRequest && (
        <Modal
          title={`Move ${moveRequest.ids.length} ${moveRequest.ids.length === 1 ? 'item' : 'items'}`}
          onClose={() => setMoveRequest(null)}
        >
          {destinationSpaces.length === 0 && !canMoveToDashboard ? (
            <div className="space-y-4">
              <p className="text-text-secondary text-sm leading-relaxed">
                Create a space first, then you can move items into it.
              </p>
              <button
                type="button"
                onClick={() => setMoveRequest(null)}
                className={buttonClass({ variant: 'secondary', className: 'w-full' })}
              >
                Close
              </button>
            </div>
          ) : (
            <div className="-mx-2">
              {canMoveToDashboard && (
                <button
                  type="button"
                  onClick={() => handleMoveItems(null, 'Dashboard')}
                  disabled={move.isPending}
                  className={menuItemClass()}
                >
                  <LayoutDashboard size={14} className="shrink-0 text-text-muted" />
                  <span className="min-w-0">
                    <span className="block text-text-primary truncate">Dashboard</span>
                    <span className="block text-[11px] font-normal text-text-muted truncate">Outside any space</span>
                  </span>
                </button>
              )}
              {destinationSpaces.map(({ space: candidate, depth }) => {
                // A sub-space shows where it is; a top-level space its description.
                const hint = depth > 0
                  ? spacePathLabel(candidate.parent_id, spacesById)
                  : candidate.description
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleMoveItems(candidate.id, candidate.name || 'space')}
                    disabled={move.isPending}
                    className={menuItemClass()}
                    style={{ paddingLeft: `${8 + Math.min(depth, 4) * 14}px` }}
                  >
                    <Folder size={14} className="shrink-0 text-text-muted" />
                    <span className="min-w-0">
                      <span className="block text-text-primary truncate">{candidate.name || 'Untitled'}</span>
                      {hint && (
                        <span className="block text-[11px] font-normal text-text-muted truncate">{hint}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Modal>
      )}

      {/* Delete item confirmation modal */}
      {deleteConfirm && (
        <Modal
          title="Move to recycle bin?"
          onClose={() => setDeleteConfirm(null)}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={buttonClass({ variant: 'secondary' })}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  remove.mutate(deleteConfirm, {
                    onSuccess: () => toast.success('Item moved to recycle bin'),
                    onError: () => toast.error("Couldn't delete item."),
                  })
                  setDeleteConfirm(null)
                }}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Move to bin
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm leading-relaxed">
            This item will be moved to the recycle bin. You can restore it later or permanently delete it from there.
          </p>
        </Modal>
      )}
    </>
  )
}
