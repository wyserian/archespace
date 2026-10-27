/**
 * SpacePage.jsx - One space: its sub-spaces and items.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, CheckSquare, ListChecks, FileDown, Search, SearchX, X, PencilOff, PencilLine, Shield, ShieldCheck, ShieldOff,
  ChevronRight, MoreHorizontal, MoreVertical, Folder,
} from 'lucide-react'
import { useDragReorder } from '../hooks/useDragReorder'
import { useDualEntitySelection } from '../hooks/useDualEntitySelection'
import { useSpaces } from '../hooks/useSpaces'
import { useItemBoard } from '../hooks/useItemBoard'
import ItemBoardModals from '../components/ItemBoardModals'
import { useToast } from '../context/ToastCore'
import { useRegisterPageActions } from '../context/PageActionsCore'
import { useCommandPalette } from '../context/CommandPaletteCore'
import { useShortcut } from '../context/ShortcutsCore'
import SpaceItem from '../components/SpaceItem'
import { SpaceCard } from '../components/space/SpaceCard'
import { SpaceModal } from '../components/space/SpaceModal'
import { MoveSpacesDialog } from '../components/space/MoveSpacesDialog'
import { exportSpaceToPdf } from '../lib/pdfExport'
import BulkSelectionBar from '../components/BulkSelectionBar'
import { BULK_ICONS } from '../components/BulkSelectionIcons'
import { ConfirmDialog } from '../components/ui/UI'
import { SortMenu } from '../components/ui/SortMenu'
import { ActionMenu } from '../components/ui/ActionMenu'
import { Button, IconButton } from '../components/ui/Button'
import { ViewToggle } from '../components/ui/ViewToggle'
import { ItemCardSkeleton } from '../components/ui/CardSkeletons'
import { CardColumns } from '../components/ui/CardColumns'
import { MIN_SPACE_COLUMN_PX } from '../components/ui/columnFit'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePersistedSort } from '../hooks/usePersistedSort'
import { useSpaceStats } from '../hooks/useSpaceStats'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useRouteMeta } from '../hooks/useRouteMeta'
import { sortEntities } from '../lib/sortEntities'
import { pathOf } from '../lib/spaceTree'
import { refocusAfterMove, reorderKeyStep } from '../lib/reorderKeys'
import { isItemRevealed, revealSpace, useSpaceHidden } from '../lib/itemLock'
import { useVaultPinPrompt } from '../context/VaultPinPromptCore'

/**
 * The spaces above this one as links (A › B ›), before its title. Deeper than
 * two levels, the middle folds into a "…" menu of the spaces it hides.
 */
function SpaceBreadcrumbs({ ancestors, navigate }) {
  if (ancestors.length === 0) return null
  const link = (s) => (
    <button
      key={s.id}
      type="button"
      onClick={() => navigate(`/space/${s.id}`)}
      title={s.name || 'Untitled'}
      className="min-w-0 max-w-[9rem] truncate text-sm text-text-muted hover:text-text-primary transition-colors"
    >
      {s.name || 'Untitled'}
    </button>
  )
  const separator = (key) => <ChevronRight key={key} size={13} className="shrink-0 text-text-muted/70" aria-hidden="true" />
  const folded = ancestors.length > 2 ? ancestors.slice(1, -1) : []
  const shown = folded.length ? [ancestors[0], null, ancestors.at(-1)] : ancestors
  return (
    <nav aria-label="Space path" className="flex items-center gap-1 min-w-0 shrink">
      {shown.map((s, i) => [
        s ? link(s) : (
          <ActionMenu
            key="more"
            label="More spaces in this path"
            icon={MoreHorizontal}
            bordered={false}
            compact
            align="left"
            actions={folded.map(f => ({
              id: f.id,
              label: f.name || 'Untitled',
              icon: Folder,
              onClick: () => navigate(`/space/${f.id}`),
            }))}
          />
        ),
        separator(`sep-${i}`),
      ])}
    </nav>
  )
}

export default function SpacePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Single call to useSpaces (avoids duplicate subscriptions)
  const {
    data: spaces = [],
    create: createSpace,
    update: updateSpace,
    togglePin: toggleSpacePin,
    toggleStar: toggleSpaceStar,
    toggleReadOnly: toggleSpaceReadOnly,
    toggleLock: toggleSpaceLock,
    setTags: setSpaceTags,
    remove: removeSpace,
    archive: archiveSpace,
    duplicate: duplicateSpace,
    move: moveSpace,
    reorder: reorderSpaces,
    bulkRemove: bulkRemoveSpaces,
    bulkArchive: bulkArchiveSpaces,
    bulkSetPinned: bulkSetSpacesPinned,
    bulkDuplicate: bulkDuplicateSpaces,
  } = useSpaces()

  // Items, their card callbacks, unsaved-edit guard and item dialogs.
  const board = useItemBoard(id)
  const { items, isLoading } = board
  const { reorder, bulkArchive, bulkSetPinned, bulkDuplicate } = board.api

  /** The space object for this page */
  const space = spaces.find(c => c.id === id)
  // Read-only (stored on the server): items can be viewed, copied and
  // exported, but nothing in the space can be added or changed.
  const readOnly = !!space?.read_only
  // Spaces nest to any depth: the spaces above this one (top first), for the
  // breadcrumbs and the back button, and its own sub-spaces.
  const ancestors = useMemo(
    () => pathOf(id, new Map(spaces.map(s => [s.id, s]))).slice(0, -1),
    [spaces, id]
  )
  const parentSpace = ancestors.at(-1) ?? null
  const subSpaces = useMemo(() => spaces.filter(s => s.parent_id === id), [spaces, id])
  const { data: spaceStats = {} } = useSpaceStats()
  const [spaceModal, setSpaceModal] = useState(null) // { type:'create' } | { type:'edit', col }
  const [spaceDeleteConfirm, setSpaceDeleteConfirm] = useState(null)
  // { ids, onDone } of the sub-spaces being moved.
  const [spaceMoveRequest, setSpaceMoveRequest] = useState(null)
  // { spaceIds, itemIds } awaiting the "move to bin" confirmation.
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null)

  // Private route: noindex, and a generic tab title - never the space name,
  // which would leak private data into the browser tab, history, and app
  // switcher. Item names are likewise kept out of the title.
  useRouteMeta({ title: 'Space' })

  const { registerCommands, closePalette } = useCommandPalette()

  const [itemSort, setItemSort] = usePersistedSort('arche-sort-items')

  // While inside a space, expose a "New item" entry in the command palette
  // and bind it to the same "I" shortcut advertised there.
  const { openAddItem: boardOpenAddItem } = board
  const openAddItem = useCallback(() => {
    if (!readOnly) boardOpenAddItem()
  }, [readOnly, boardOpenAddItem])
  useShortcut('new-item', openAddItem)
  useEffect(() => (readOnly ? undefined : registerCommands([
    { id: 'new-item', label: 'New item', hint: 'I', icon: Plus, run: () => { closePalette(); openAddItem() } },
  ])), [registerCommands, closePalette, openAddItem, readOnly])

  const handleToggleReadOnly = () => {
    // Turning it on would strand unsaved edits, so they go first.
    if (!readOnly && board.dirtyItems.size > 0) {
      toast.error('Save or discard unsaved changes first')
      return
    }
    toggleSpaceReadOnly.mutate({ id, read_only: readOnly }, {
      onSuccess: () => toast.success(readOnly ? 'Editing allowed' : 'Space is now read-only'),
      onError: () => toast.error("Couldn't change read-only."),
    })
  }

  // Protected (this space or its parent) and not opened: the page shows a
  // Protected view and asks for the vault PIN as it opens.
  const askVaultPin = useVaultPinPrompt()
  const hidden = useSpaceHidden(id)
  const locked = !!space?.locked
  const spaceName = space?.name || 'Untitled'
  const unlockSpace = useCallback(async () => {
    const ok = await askVaultPin({
      title: 'Open protected space',
      confirmLabel: 'Open',
      message: `Enter your vault PIN to open "${spaceName}".`,
    })
    if (ok) revealSpace(id)
  }, [askVaultPin, spaceName, id])
  const promptedFor = useRef(null)
  useEffect(() => {
    if (!space || promptedFor.current === id) return
    // Once per visit, and only when it opens hidden (not after protecting it here).
    promptedFor.current = id
    if (hidden) unlockSpace()
  }, [hidden, space, id, unlockSpace])

  // Protecting is instant and hides the space. Removing protection asks for the
  // PIN unless the space was opened with it (it always is, on this page).
  const handleToggleLock = async () => {
    if (!locked && board.dirtyItems.size > 0) {
      toast.error('Save or discard unsaved changes first')
      return
    }
    if (locked && !isItemRevealed(id)) {
      const ok = await askVaultPin({
        title: 'Remove protection',
        message: 'Enter your vault PIN to remove protection. The space will open without the PIN.',
        confirmLabel: 'Remove protection',
      })
      if (!ok) return
    }
    toggleSpaceLock.mutate({ id, locked }, {
      onSuccess: () => toast.success(locked ? 'Protection removed' : 'Space protected'),
      onError: () => toast.error(locked ? "Couldn't remove protection." : "Couldn't protect the space."),
    })
  }

  // Tag filter (within this space: its sub-spaces and items)
  const [selectedTags, setSelectedTags] = useState([])
  const allTags = useMemo(() => {
    const set = new Set()
    for (const entry of [...subSpaces, ...items]) for (const t of (entry.tags || [])) set.add(t)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [subSpaces, items])
  // Only selected tags that something here still carries take effect. A
  // selected tag that was just removed from everything (its pill disappears)
  // would otherwise leave the filter matching nothing and the space looking empty.
  const activeTags = useMemo(
    () => selectedTags.filter(t => allTags.includes(t)),
    [selectedTags, allTags]
  )
  const toggleTagFilter = useCallback((tag) => {
    setSelectedTags(prev => {
      // Drop stale selections so a removed tag doesn't come back into effect
      // if it is re-added later.
      const current = prev.filter(t => allTags.includes(t))
      return current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    })
  }, [allTags])
  // In-space search (sub-space names, item titles, and tags)
  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim().toLowerCase()

  // A sub-space or item matches when it carries any of the active tags (OR)
  // and, while searching, its name or title or one of its tags contains the query.
  const matches = useCallback((name, tags = []) => {
    if (activeTags.length > 0 && !tags.some(t => activeTags.includes(t))) return false
    if (!trimmedQuery) return true
    return (name || '').toLowerCase().includes(trimmedQuery)
      || tags.some(t => t.toLowerCase().includes(trimmedQuery))
  }, [activeTags, trimmedQuery])
  const filtering = activeTags.length > 0 || !!trimmedQuery

  const sortedSubSpaces = useMemo(() => sortEntities(
    filtering ? subSpaces.filter(s => matches(s.name, s.tags)) : subSpaces,
    itemSort,
    s => s.name,
  ), [subSpaces, filtering, matches, itemSort])
  const sortedItems = useMemo(() => sortEntities(
    filtering ? items.filter(it => matches(it.title, it.tags)) : items,
    itemSort,
    i => i.title,
  ), [items, filtering, matches, itemSort])

  // Selection: sub-spaces and items together, as on the dashboard.
  const {
    selectMode, setSelectMode, selectedSpaceIds, selectedItemIds,
    selectedCount, exitSelectMode, selectAll, toggleSpace, toggleItem,
  } = useDualEntitySelection(sortedSubSpaces, sortedItems)
  const selectedSpaces = useMemo(
    () => subSpaces.filter(s => selectedSpaceIds.has(s.id)),
    [subSpaces, selectedSpaceIds]
  )
  const selectedItems = useMemo(
    () => items.filter(i => selectedItemIds.has(i.id)),
    [items, selectedItemIds]
  )
  // Grid (masonry) and list share the same items; list is a single column.
  const online = useOnlineStatus()
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('arche:items-view')
      if (saved === 'list' || saved === 'grid') return saved
    } catch { /* storage unavailable */ }
    // No saved preference: grid on large screens, list on mobile.
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'grid'
  })
  const changeViewMode = (mode) => {
    setViewMode(mode)
    try { localStorage.setItem('arche:items-view', mode) } catch { /* storage unavailable */ }
  }

  // On small screens grid cards are narrow (two columns), so render them denser
  // (smaller text and padding) while still showing the full item content.
  const isSmallScreen = useMediaQuery('(max-width: 639px)')
  const denseItems = viewMode === 'grid' && isSmallScreen

  // Grid is a masonry of 2 columns, 3 on xl.
  const gridCols = useMediaQuery('(min-width: 1280px)') ? 3 : 2

  // Manual drag order (in both list and grid views) only applies to the
  // default sort; other sorts and select mode disable it.
  const reorderDisabled = readOnly || selectMode || itemSort !== 'default' || filtering

  const { closeAll: closeItemDialogs } = board
  const pageActions = useMemo(() => ({
    onEscape: () => {
      closeItemDialogs()
      setBulkDeleteConfirm(null)
      exitSelectMode()
    },
  }), [closeItemDialogs, exitSelectMode])
  useRegisterPageActions(pageActions)

  const dragItemRef = useRef(null)
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })

  const {
    dragIndex, dragOverIndex,
    handleDragStart: onDragStart, handleDragOver, handleDrop, handleDragEnd, handleKeyMove,
  } = useDragReorder({
    disabled: reorderDisabled,
    onDrop: (fromIndex, toIndex) => {
      const reordered = [...items]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      reorder.mutate(reordered, {
        onError: () => toast.error("Couldn't reorder items."),
      })
    },
  })

  // Sub-spaces reorder among themselves, by dragging their cards. The whole
  // list is saved, so the other spaces keep their places.
  const subSpaceDrag = useDragReorder({
    disabled: reorderDisabled,
    onDrop: (fromIndex, toIndex) => {
      const fromId = sortedSubSpaces[fromIndex]?.id
      const toId = sortedSubSpaces[toIndex]?.id
      if (!fromId || !toId) return
      const reordered = [...spaces]
      const [moved] = reordered.splice(reordered.findIndex(s => s.id === fromId), 1)
      reordered.splice(reordered.findIndex(s => s.id === toId) + (fromIndex < toIndex ? 1 : 0), 0, moved)
      reorderSpaces.mutate(reordered, {
        onError: () => toast.error("Couldn't reorder spaces."),
      })
    },
  })

  const handleItemDragStart = useCallback((index) => {
    onDragStart(index)
    dragItemRef.current = itemsRef.current[index]
  }, [onDragStart])

  /** "2 spaces", "3 items", or "2 spaces and 3 items". */
  const describeSelection = (spaceCount, itemCount) => [
    spaceCount > 0 && `${spaceCount} ${spaceCount === 1 ? 'space' : 'spaces'}`,
    itemCount > 0 && `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
  ].filter(Boolean).join(' and ')
  const selectionLabel = describeSelection(selectedSpaceIds.size, selectedItemIds.size)
  const hasSelectedItems = selectedItemIds.size > 0

  /** Run a bulk action on the selected sub-spaces and items, then leave select mode. */
  const runBulkAction = async (fn, successMessage, errorMessage) => {
    if (selectedCount === 0) return
    if (board.hasDirty([...selectedItemIds])) {
      toast.error('Save or discard unsaved changes before bulk actions')
      return
    }
    try {
      await fn([...selectedSpaceIds], [...selectedItemIds])
      if (successMessage) toast.success(successMessage)
      exitSelectMode()
    } catch {
      toast.error(errorMessage || "Couldn't complete that action.")
    }
  }

  // Not found state
  if (!space && !isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-secondary mb-4">Space not found</p>
          <button onClick={() => navigate('/app')} className="text-accent text-sm hover:underline">Go back</button>
        </div>
      </div>
    )
  }

  // Protected state: the name only, until the vault PIN opens it
  if (space && hidden) {
    return (
      <div className="min-h-screen bg-bg-base flex flex-col">
        <header className="sticky top-0 z-20 glass">
          <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
            <IconButton
              icon={ArrowLeft}
              label="Back"
              size="md"
              className="-ml-1.5"
              onClick={() => navigate(parentSpace ? `/space/${parentSpace.id}` : '/app')}
            />
            <div className="flex-1 min-w-0 flex items-center gap-1">
              <SpaceBreadcrumbs ancestors={ancestors} navigate={navigate} />
              <h1 className="min-w-0 text-sm font-semibold text-text-primary truncate">{spaceName}</h1>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6 pb-16">
          <div className="text-center max-w-xs">
            <div className="w-14 h-14 rounded-2xl bg-accent-muted text-accent flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={22} />
            </div>
            <p className="text-text-primary font-semibold">Protected</p>
            <p className="text-text-muted text-sm mt-1">Enter your vault PIN to open this space.</p>
            <Button variant="primary" className="mt-5" onClick={unlockSpace}>Open</Button>
          </div>
        </main>
      </div>
    )
  }

  const renderItemCard = (item, index) => (
    <div
      key={item.id}
      data-item-id={item.id}
      onDragOver={reorderDisabled ? undefined : (e) => handleDragOver(e, index)}
      onDrop={reorderDisabled ? undefined : () => handleDrop(index)}
      onKeyDown={reorderDisabled ? undefined : (e) => {
        const step = reorderKeyStep(e)
        if (step && handleKeyMove(index, step, sortedItems.length)) {
          e.preventDefault()
          refocusAfterMove(`[data-item-id="${item.id}"] button[aria-label="Item actions"]`)
        }
      }}
      className={`rounded-2xl transition-all duration-300 animate-fade-in-up ${
        // Where a dragged card would land: the soft ring of a selected card.
        !reorderDisabled && dragOverIndex === index && dragIndex !== index
          ? 'ring-[1.5px] ring-accent-border'
          : ''
      } ${!reorderDisabled && dragIndex === index ? 'opacity-40' : ''} ${
        board.flashItemId === item.id ? 'rounded-2xl ring-2 ring-accent' : ''
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <SpaceItem
        item={item}
        index={index}
        selectMode={selectMode}
        selected={selectedItemIds.has(item.id)}
        onSelectedChange={toggleItem}
        forcedCollapsed={board.collapsedIds.has(item.id)}
        editTitleOnMount={board.addedItemId === item.id}
        {...board.cardProps}
        onDragStart={handleItemDragStart}
        onDragEnd={handleDragEnd}
        dragDisabled={reorderDisabled}
        dense={denseItems}
        grid={viewMode === 'grid'}
        readOnly={readOnly}
      />
    </div>
  )

  // Sub-spaces render as space cards in the same layout as items, listed first.
  const renderSubSpaceCard = (sub, i) => (
    <SpaceCard
      key={sub.id}
      col={sub}
      index={i}
      search=""
      layout={viewMode === 'grid' ? 'grid' : 'list'}
      stats={spaceStats}
      activeTags={activeTags}
      onTagClick={toggleTagFilter}
      selectMode={selectMode}
      selected={selectedSpaceIds.has(sub.id)}
      onToggleSelect={() => toggleSpace(sub.id)}
      reorderDisabled={reorderDisabled}
      dragIndex={subSpaceDrag.dragIndex}
      dragOverIndex={subSpaceDrag.dragOverIndex}
      handleDragStart={subSpaceDrag.handleDragStart}
      handleDragOver={subSpaceDrag.handleDragOver}
      handleDrop={subSpaceDrag.handleDrop}
      handleDragEnd={subSpaceDrag.handleDragEnd}
      onKeyMove={(index, step) => {
        if (subSpaceDrag.handleKeyMove(index, step, sortedSubSpaces.length)) {
          refocusAfterMove(`[data-space-id="${sub.id}"]`)
        }
      }}
      navigate={navigate}
      togglePin={toggleSpacePin}
      toggleStar={toggleSpaceStar}
      toggleReadOnly={toggleSpaceReadOnly}
      toggleLock={toggleSpaceLock}
      setTags={setSpaceTags}
      setModal={setSpaceModal}
      setDeleteConfirm={setSpaceDeleteConfirm}
      onDuplicate={(sid) => duplicateSpace.mutate(sid, {
        onSuccess: () => toast.success('Space duplicated'),
        onError: () => toast.error("Couldn't duplicate the space."),
      })}
      onMove={(sid) => setSpaceMoveRequest({ ids: [sid] })}
      onArchive={(sid) => archiveSpace.mutate(sid, {
        onSuccess: () => toast.success('Space archived'),
        onError: () => toast.error("Couldn't archive the space."),
      })}
    />
  )

  // Sub-spaces, then items, as separate sections, each labelled only when both
  // show. Search, tags, sort and select cover both.
  const hasContent = subSpaces.length + items.length > 0
  const subSpaceNodes = sortedSubSpaces.map((sub, i) => renderSubSpaceCard(sub, i))
  const itemNodes = sortedItems.map((item, index) => renderItemCard(item, index))
  const labelSections = subSpaceNodes.length > 0 && itemNodes.length > 0
  const sectionLabelClass = 'mb-3 px-1 text-base font-semibold text-text-primary'

  // One section's cards: masonry in grid view, one column in list.
  // Sub-space cards take the full width on phones, where two columns would
  // cut their names short.
  const renderSection = (nodes, cols = gridCols, minWidth) => (viewMode === 'grid' ? (
    <CardColumns cols={cols} minWidth={minWidth}>{nodes}</CardColumns>
  ) : (
    // The grid's own gap (see CardColumns), so switching views keeps the spacing.
    <div className="flex flex-col gap-2 sm:gap-3">
      {nodes}
    </div>
  ))

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">

      {/* Sticky header */}
      <header className="sticky top-0 z-20 glass">
        <div className="w-full px-4 sm:px-6 h-14 flex items-center gap-3">
          {/* Back button - to the parent space for a sub-space, else the dashboard */}
          <IconButton
            icon={ArrowLeft}
            label={parentSpace ? `Back to ${parentSpace.name}` : 'Back'}
            size="md"
            className="-ml-1.5"
            onClick={() => navigate(parentSpace ? `/space/${parentSpace.id}` : '/app')}
          />

          {/* Where it sits (the spaces above it), then its title & description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <SpaceBreadcrumbs ancestors={ancestors} navigate={navigate} />
              <h1 className="min-w-0 text-sm font-semibold text-text-primary truncate">{space?.name}</h1>
              {locked && <ShieldCheck size={13} className="shrink-0 text-text-muted" aria-label="Protected" />}
            </div>
            {space?.description && (
              <p className="text-xs text-text-muted truncate mt-0.5">{space.description}</p>
            )}
          </div>

          {/* Unsaved badge */}
          {board.dirtyItems.size > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1 shrink-0">
              {board.dirtyItems.size} unsaved
            </span>
          )}

          {/* Header actions: the one main action, then a menu of things done
              to the space itself. The view, sort and select controls live in
              the search row above the items. */}
          <div className="flex items-center gap-1 shrink-0 relative">
            {/* New: a menu of New item / New space (a sub-space of this one,
                at any depth). */}
            {!readOnly && !selectMode && (
              <ActionMenu
                label={online ? 'New' : 'Unavailable offline'}
                triggerLabel="New"
                icon={Plus}
                disabled={!online}
                actions={[
                  // First, nearest the button: the one-click way to jot something down.
                  { id: 'quick-note', label: 'Quick note', onClick: board.addQuickNote },
                  { id: 'item', label: 'New item', onClick: openAddItem },
                  { id: 'space', label: 'New space', onClick: () => setSpaceModal({ type: 'create' }) },
                ]}
              />
            )}
            {space && !selectMode && (
              <ActionMenu
                label="Space actions"
                bordered={false}
                icon={MoreVertical}
                actions={[
                  items.length > 0 && {
                    id: 'export-pdf',
                    group: 'content',
                    label: 'Export PDF',
                    icon: FileDown,
                    onClick: () => exportSpaceToPdf(space, items, subSpaces),
                  },
                  {
                    id: 'read-only',
                    group: 'keep',
                    label: readOnly ? 'Allow editing' : 'Read-only',
                    icon: readOnly ? PencilLine : PencilOff,
                    disabled: !online,
                    onClick: handleToggleReadOnly,
                  },
                  {
                    id: 'lock',
                    group: 'keep',
                    label: locked ? 'Remove protection' : 'Protect',
                    icon: locked ? ShieldOff : Shield,
                    disabled: !online,
                    onClick: handleToggleLock,
                  },
                ]}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`flex-1 flex flex-col px-2 sm:px-4 pt-3 ${selectMode ? 'pb-32' : 'pb-6'}`}>
        {readOnly && (
          <p className="mb-3 px-1 flex items-center gap-2 text-sm text-text-muted">
            <PencilOff size={14} className="shrink-0" />
            Read-only. Items can be viewed, copied and exported, not changed.
          </p>
        )}
        {isLoading ? (
          <div className={viewMode === 'grid' ? '' : 'max-w-5xl mx-auto w-full'}>
            {renderSection([...Array(viewMode === 'grid' ? gridCols * 2 : 3)].map((_, i) => <ItemCardSkeleton key={i} />))}
          </div>
        ) : !hasContent ? (
          /* Empty state */
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
              <Plus size={20} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">Nothing here yet</p>
            {!readOnly && <p className="text-text-muted text-sm mt-1">Add your first item to this space</p>}
            {!readOnly && (
              <Button
                variant="primary"
                icon={Plus}
                className="mt-4"
                disabled={!online}
                title={online ? undefined : 'Unavailable offline'}
                onClick={openAddItem}
              >
                Add first item
              </Button>
            )}
          </div>
        ) : (
          /* Sub-spaces and items in list (single column) or grid (round-robin masonry) view */
          <>
            {/* Search row: compact in-space search (names, titles and tags) on
                the left; the view, sort and select controls right-aligned. In
                select mode the search gives way to Select all + Done, with Done
                where Select was. */}
            {hasContent && (
              <div className="mb-3 flex items-center gap-2">
                {!selectMode && (
                  <div className="flex h-8 sm:h-9 min-w-0 flex-1 sm:max-w-md items-center gap-2 rounded-full bg-bg-card pl-3.5 pr-1.5 focus-within:ring-1 focus-within:ring-accent-border transition-shadow">
                    <Search size={15} className="shrink-0 text-text-muted" />
                    <input
                      type="text"
                      enterKeyHint="search"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape' && query) {
                          e.stopPropagation()
                          setQuery('')
                        }
                      }}
                      placeholder="Search this space"
                      aria-label="Search this space"
                      className="min-w-0 flex-1 bg-transparent text-[13.5px] text-text-primary placeholder-text-muted focus:outline-none"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        title="Clear"
                        className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {!selectMode && (
                    <ViewToggle value={viewMode} onChange={changeViewMode} />
                  )}
                  {!selectMode && subSpaces.length + items.length > 1 && (
                    <SortMenu value={itemSort} onChange={setItemSort} />
                  )}
                  {selectMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={ListChecks}
                      iconOnlyOnMobile
                      aria-label="Select all"
                      onClick={selectAll}
                    >
                      Select all
                    </Button>
                  )}
                  <Button
                    variant={selectMode ? 'secondary' : 'ghost'}
                    size="sm"
                    icon={CheckSquare}
                    aria-label={selectMode ? 'Done selecting' : 'Select'}
                    onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                  >
                    {selectMode ? 'Done' : 'Select'}
                  </Button>
                </div>
              </div>
            )}
            {allTags.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(() => {
                  const pill = (active) =>
                    `text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-accent-muted border-accent-border text-accent'
                        : 'bg-bg-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                    }`
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedTags([])}
                        aria-pressed={activeTags.length === 0}
                        className={pill(activeTags.length === 0)}
                      >
                        All
                      </button>
                      {allTags.map(tag => {
                        const active = activeTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTagFilter(tag)}
                            aria-pressed={active}
                            className={pill(active)}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
            )}
            {/* A search or tag filter that matches nothing (the search bar above
                stays usable). */}
            {filtering && sortedSubSpaces.length + sortedItems.length === 0 && (
              <div className="flex flex-col items-center px-6 pt-12 pb-6 text-center">
                <SearchX size={36} className="text-text-muted" />
                <p className="mt-3 font-medium text-text-secondary">Nothing matches</p>
                <p className="mt-1 text-sm text-text-muted">
                  {trimmedQuery ? `Nothing here matches "${query.trim()}".` : 'Nothing here has the selected tags.'}
                </p>
              </div>
            )}
            {/* Only the cards narrow and centre in list view; the search row
                and tags above stay where they are. */}
            <div className={viewMode === 'grid' ? '' : 'max-w-5xl mx-auto w-full'}>
              {labelSections && <h2 className={sectionLabelClass}>Spaces</h2>}
              {subSpaceNodes.length > 0 && renderSection(subSpaceNodes, gridCols, MIN_SPACE_COLUMN_PX)}
              {labelSections && <h2 className={`${sectionLabelClass} mt-4`}>Items</h2>}
              {itemNodes.length > 0 && renderSection(itemNodes)}
            </div>

            <BulkSelectionBar
              count={selectedCount}
              onClear={exitSelectMode}
              actions={[
                !readOnly && {
                  id: 'pin',
                  label: 'Pin',
                  icon: BULK_ICONS.pin,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkSetSpacesPinned.mutateAsync({ ids: spaceIds, pinned: true }),
                      itemIds.length && bulkSetPinned.mutateAsync({ ids: itemIds, pinned: true }),
                    ]),
                    `Pinned ${selectionLabel}`,
                    "Couldn't pin the selection.",
                  ),
                },
                !readOnly && {
                  id: 'unpin',
                  label: 'Unpin',
                  icon: BULK_ICONS.unpin,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkSetSpacesPinned.mutateAsync({ ids: spaceIds, pinned: false }),
                      itemIds.length && bulkSetPinned.mutateAsync({ ids: itemIds, pinned: false }),
                    ]),
                    `Unpinned ${selectionLabel}`,
                    "Couldn't unpin the selection.",
                  ),
                },
                // Collapse / expand only apply to item cards.
                hasSelectedItems && {
                  id: 'collapse',
                  label: 'Collapse',
                  icon: BULK_ICONS.collapse,
                  onClick: () => {
                    board.setManyCollapsed([...selectedItemIds], true)
                    toast.info(`Collapsed ${selectedItemIds.size} items`)
                  },
                },
                hasSelectedItems && {
                  id: 'expand',
                  label: 'Expand',
                  icon: BULK_ICONS.expand,
                  onClick: () => {
                    board.setManyCollapsed([...selectedItemIds], false)
                    toast.info('Expanded items')
                  },
                },
                !readOnly && {
                  id: 'duplicate',
                  label: 'Duplicate',
                  icon: BULK_ICONS.copy,
                  onClick: () => runBulkAction(
                    () => Promise.all([
                      selectedSpaces.length && bulkDuplicateSpaces.mutateAsync(selectedSpaces),
                      selectedItems.length && bulkDuplicate.mutateAsync(selectedItems),
                    ]),
                    `Duplicated ${selectionLabel}`,
                    "Couldn't duplicate the selection.",
                  ),
                },
                // Sub-spaces or items move, not both at once (a read-only
                // space stays where it is).
                !readOnly && hasSelectedItems && selectedSpaceIds.size === 0 && {
                  id: 'move',
                  label: 'Move',
                  icon: BULK_ICONS.move,
                  onClick: () => board.openMoveItems([...selectedItemIds], exitSelectMode),
                },
                !readOnly && !hasSelectedItems && selectedSpaces.length > 0 && !selectedSpaces.some(s => s.read_only) && {
                  id: 'move',
                  label: 'Move',
                  icon: BULK_ICONS.move,
                  onClick: () => setSpaceMoveRequest({ ids: [...selectedSpaceIds], onDone: exitSelectMode }),
                },
                !readOnly && {
                  id: 'archive',
                  label: 'Archive',
                  icon: BULK_ICONS.archive,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkArchiveSpaces.mutateAsync(spaceIds),
                      itemIds.length && bulkArchive.mutateAsync(itemIds),
                    ]),
                    `Archived ${selectionLabel}`,
                    "Couldn't archive the selection.",
                  ),
                },
                !readOnly && {
                  id: 'delete',
                  label: 'Delete',
                  icon: BULK_ICONS.trash,
                  variant: 'danger',
                  onClick: () => {
                    if (board.hasDirty([...selectedItemIds])) {
                      toast.error('Save or discard unsaved changes first')
                      return
                    }
                    setBulkDeleteConfirm({ spaceIds: [...selectedSpaceIds], itemIds: [...selectedItemIds] })
                  },
                },
              ]}
            />
          </>
        )}
      </main>

      {/* Sub-space create / edit modal */}
      {spaceModal?.type === 'create' && (
        <SpaceModal
          onSave={({ name, description, color }) => {
            createSpace.mutate({ name, description, color, parentId: id }, {
              onSuccess: () => toast.success('Space created'),
              onError: () => toast.error("Couldn't create space."),
            })
          }}
          onClose={() => setSpaceModal(null)}
        />
      )}
      {spaceModal?.type === 'edit' && (
        <SpaceModal
          initial={spaceModal.col}
          onSave={({ name, description, color }) => {
            updateSpace.mutate({ id: spaceModal.col.id, name, description, color }, {
              onSuccess: () => toast.success('Space updated'),
              onError: () => toast.error("Couldn't update space."),
            })
          }}
          onClose={() => setSpaceModal(null)}
        />
      )}
      {spaceDeleteConfirm && (
        <ConfirmDialog
          title="Move space to the bin?"
          message="This space and all its items will be moved to the bin."
          confirmLabel="Move to the bin"
          destructive
          onConfirm={() => {
            removeSpace.mutate(spaceDeleteConfirm, {
              onSuccess: () => toast.success('Space moved to the bin'),
              onError: () => toast.error("Couldn't delete space."),
            })
            setSpaceDeleteConfirm(null)
          }}
          onClose={() => setSpaceDeleteConfirm(null)}
        />
      )}

      {bulkDeleteConfirm && (
        <ConfirmDialog
          title={`Move ${describeSelection(bulkDeleteConfirm.spaceIds.length, bulkDeleteConfirm.itemIds.length)} to the bin?`}
          message={bulkDeleteConfirm.spaceIds.length > 0
            ? 'All items inside these spaces go to the bin as well.'
            : 'You can restore them later from the bin.'}
          confirmLabel="Move to the bin"
          destructive
          onConfirm={async () => {
            const { spaceIds, itemIds } = bulkDeleteConfirm
            setBulkDeleteConfirm(null)
            try {
              await Promise.all([
                spaceIds.length && bulkRemoveSpaces.mutateAsync(spaceIds),
                itemIds.length && board.api.bulkRemove.mutateAsync(itemIds),
              ])
              toast.success(`Moved ${describeSelection(spaceIds.length, itemIds.length)} to the bin`)
              exitSelectMode()
            } catch {
              toast.error("Couldn't delete the selection.")
            }
          }}
          onClose={() => setBulkDeleteConfirm(null)}
        />
      )}

      {spaceMoveRequest && (
        <MoveSpacesDialog
          ids={spaceMoveRequest.ids}
          spaces={spaces}
          move={moveSpace}
          onDone={spaceMoveRequest.onDone}
          onClose={() => setSpaceMoveRequest(null)}
        />
      )}

      {/* Item dialogs: add, move to bin, move, unsaved-edit guard */}
      <ItemBoardModals board={board} spaces={spaces} />
    </div>
  )
}
