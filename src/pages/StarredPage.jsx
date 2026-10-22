/**
 * StarredPage.jsx - Quick access to starred spaces and items from anywhere.
 *
 * Starring never moves anything: spaces and items keep their place in their
 * own lists; this view only gathers what's starred. Spaces show as space cards
 * and items as full item cards (editable here, like inside a space), each
 * labelled with where it lives.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Star } from 'lucide-react'
import { useSpaces } from '../hooks/useSpaces'
import { useSpaceStats } from '../hooks/useSpaceStats'
import { useItemBoard } from '../hooks/useItemBoard'
import { useColumnCount } from '../hooks/useColumnCount'
import { CardColumns } from '../components/ui/CardColumns'
import { spacePathLabel } from '../lib/spaceTree'
import { STARRED_ITEMS } from '../hooks/useSpaceItems'
import { useToast } from '../context/ToastCore'
import { useRegisterPageActions } from '../context/PageActionsCore'
import SpaceItem from '../components/SpaceItem'
import { IconButton } from '../components/ui/Button'
import ItemBoardModals from '../components/ItemBoardModals'
import { SpaceCard } from '../components/space/SpaceCard'
import { SpaceModal } from '../components/space/SpaceModal'
import { MoveSpacesDialog } from '../components/space/MoveSpacesDialog'
import { ConfirmDialog, Spinner } from '../components/ui/UI'

export default function StarredPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    data: spaces = [], isLoading: spacesLoading,
    update, togglePin, toggleStar, toggleReadOnly, toggleLock, remove, archive, duplicate, move,
  } = useSpaces()
  const { data: spaceStats = {} } = useSpaceStats()
  // Starred items from every space (and the dashboard).
  const board = useItemBoard(STARRED_ITEMS)
  const { items, isLoading: itemsLoading } = board
  const cols = useColumnCount()

  const [spaceModal, setSpaceModal] = useState(null) // { type: 'edit', col }
  const [spaceDeleteConfirm, setSpaceDeleteConfirm] = useState(null)
  const [moveSpaceId, setMoveSpaceId] = useState(null)

  const starredSpaces = useMemo(() => spaces.filter(s => s.starred), [spaces])
  // Where each item lives: its space's path.
  const spaceNames = useMemo(() => {
    const byId = new Map(spaces.map(s => [s.id, s]))
    return Object.fromEntries(spaces.map(s => [s.id, spacePathLabel(s.id, byId)]))
  }, [spaces])
  const readOnlySpaceIds = useMemo(
    () => new Set(spaces.filter(s => s.read_only).map(s => s.id)),
    [spaces]
  )

  const { closeAll: closeItemDialogs } = board
  const pageActions = useMemo(() => ({
    onEscape: () => {
      closeItemDialogs()
      setSpaceModal(null)
      setSpaceDeleteConfirm(null)
      setMoveSpaceId(null)
    },
  }), [closeItemDialogs])
  useRegisterPageActions(pageActions)

  const total = starredSpaces.length + items.length
  const isLoading = spacesLoading || itemsLoading

  const renderSpaceCard = (space, index) => (
    <SpaceCard
      key={space.id}
      col={space}
      index={index}
      search=""
      layout="grid"
      stats={spaceStats}
      reorderDisabled
      dragIndex={-1}
      dragOverIndex={-1}
      handleDragStart={() => {}}
      handleDragOver={() => {}}
      handleDrop={() => {}}
      handleDragEnd={() => {}}
      navigate={navigate}
      togglePin={togglePin}
      toggleStar={toggleStar}
      toggleReadOnly={toggleReadOnly}
      toggleLock={toggleLock}
      setModal={setSpaceModal}
      setDeleteConfirm={setSpaceDeleteConfirm}
      onDuplicate={(id) => duplicate.mutate(id, {
        onSuccess: () => toast.success('Space duplicated'),
        onError: () => toast.error("Couldn't duplicate the space."),
      })}
      onMove={setMoveSpaceId}
      onArchive={(id) => archive.mutate(id, {
        onSuccess: () => toast.success('Space archived'),
        onError: () => toast.error("Couldn't archive the space."),
      })}
    />
  )

  const renderItemCard = (item, index) => (
    <div
      key={item.id}
      data-item-id={item.id}
      className={`transition-all duration-300 animate-fade-in-up ${
        board.flashItemId === item.id ? 'rounded-2xl ring-2 ring-accent' : ''
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <SpaceItem
        item={item}
        index={index}
        forcedCollapsed={board.collapsedIds.has(item.id)}
        {...board.cardProps}
        // Starred items come from many spaces, so there's no one order to drag.
        dragDisabled
        readOnly={readOnlySpaceIds.has(item.space_id)}
        contextLabel={item.space_id ? spaceNames[item.space_id] || 'Space' : 'Dashboard'}
      />
    </div>
  )

  const renderSection = (nodes) => <CardColumns cols={cols}>{nodes}</CardColumns>

  const showSpaces = starredSpaces.length > 0
  const showItems = items.length > 0
  const sectionLabel = 'mb-3 px-1 text-base font-semibold text-text-primary'

  return (
    <div className="min-h-screen bg-bg-base pb-24">
      <header className="sticky top-0 z-20 glass">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
          <IconButton icon={ArrowLeft} label="Back" size="md" className="-ml-1.5" onClick={() => navigate('/app')} />
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-text-primary">Starred</h1>
            <p className="text-xs text-text-muted mt-0.5">
              {total} starred - quick access, kept in place
            </p>
          </div>
        </div>
      </header>

      <main className="px-2 sm:px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : total === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-14 h-14 rounded-2xl bg-bg-surface border border-bg-border flex items-center justify-center mx-auto mb-4">
              <Star size={20} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">Nothing starred yet</p>
            <p className="text-text-muted text-sm mt-1">
              Star a space or an item from its menu to keep it here for quick access.
            </p>
          </div>
        ) : (
          <>
            {showSpaces && showItems && <h2 className={sectionLabel}>Spaces</h2>}
            {showSpaces && renderSection(starredSpaces.map(renderSpaceCard))}
            {showSpaces && showItems && <h2 className={`${sectionLabel} mt-6`}>Items</h2>}
            {showItems && renderSection(items.map(renderItemCard))}
          </>
        )}
      </main>

      {/* Space edit / move / delete */}
      {moveSpaceId && (
        <MoveSpacesDialog ids={[moveSpaceId]} spaces={spaces} move={move} onClose={() => setMoveSpaceId(null)} />
      )}
      {spaceModal?.type === 'edit' && (
        <SpaceModal
          initial={spaceModal.col}
          onSave={({ name, description, color, tags }) => {
            update.mutate({ id: spaceModal.col.id, name, description, color, tags }, {
              onSuccess: () => toast.success('Space updated'),
              onError: () => toast.error("Couldn't update space."),
            })
          }}
          onClose={() => setSpaceModal(null)}
        />
      )}
      {spaceDeleteConfirm && (
        <ConfirmDialog
          title="Move space to recycle bin?"
          message="This space and all its items will be moved to the recycle bin."
          confirmLabel="Move to recycle bin"
          destructive
          onConfirm={() => {
            remove.mutate(spaceDeleteConfirm, {
              onSuccess: () => toast.success('Space moved to recycle bin'),
              onError: () => toast.error("Couldn't delete space."),
            })
            setSpaceDeleteConfirm(null)
          }}
          onClose={() => setSpaceDeleteConfirm(null)}
        />
      )}

      {/* Item dialogs: move to bin, move, unsaved guard */}
      <ItemBoardModals board={board} spaces={spaces} />
    </div>
  )
}
