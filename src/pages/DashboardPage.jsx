/**
 * DashboardPage.jsx - The signed-in home: a searchable, sortable grid or list
 * of the user's spaces followed by their dashboard items (items that belong to
 * no space), laid out like the inside of a space.
 */

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Folder, FolderPlus,
  Trash2, Archive, Command, CheckSquare, ListChecks, Settings, Lock, Menu, Keyboard, LogOut,
  Star, Bell, X,
} from 'lucide-react'
import SpaceItem from '../components/SpaceItem'
import ItemBoardModals from '../components/ItemBoardModals'
import { useItemBoard } from '../hooks/useItemBoard'
import { useDualEntitySelection } from '../hooks/useDualEntitySelection'
import { useShortcut } from '../context/ShortcutsCore'
import GlobalSearchResults from '../components/GlobalSearchResults'
import { useDragReorder } from '../hooks/useDragReorder'
import { useCommandPalette } from '../context/CommandPaletteCore'
import BulkSelectionBar from '../components/BulkSelectionBar'
import { BULK_ICONS } from '../components/BulkSelectionIcons'
import { useAuth } from '../context/AuthContextCore'
import { useEncryption } from '../context/EncryptionCore'
import { useToast } from '../context/ToastCore'
import { useRegisterPageActions } from '../context/PageActionsCore'
import { useSpaces } from '../hooks/useSpaces'
import { useRecycleBin } from '../hooks/useRecycleBin'
import { useArchive } from '../hooks/useArchive'
import { useStarredItemCount } from '../hooks/useStarredItemCount'
import { useReminders, useRemindersNowCount } from '../hooks/useReminders'
import { useSpaceStats } from '../hooks/useSpaceStats'
import { useGlobalSearchData } from '../hooks/useGlobalSearch'
import { filterGlobalSearch, searchOptionId, SEARCH_ITEM_DISPLAY_LIMIT } from '../lib/search'
import { Modal, ConfirmDialog } from '../components/ui/UI'
import { SIGN_OUT_TEXT } from '../lib/localMode'
import { SortMenu } from '../components/ui/SortMenu'
import { ActionMenu } from '../components/ui/ActionMenu'
import { Button, IconButton } from '../components/ui/Button'
import { ViewToggle } from '../components/ui/ViewToggle'
import { SpaceCardSkeleton } from '../components/ui/CardSkeletons'
import { CardColumns } from '../components/ui/CardColumns'
import { MIN_SPACE_COLUMN_PX } from '../components/ui/columnFit'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SpaceModal } from '../components/space/SpaceModal'
import { SpaceCard } from '../components/space/SpaceCard'
import { MoveSpacesDialog } from '../components/space/MoveSpacesDialog'
import { usePersistedSort } from '../hooks/usePersistedSort'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { sortEntities } from '../lib/sortEntities'
import { refocusAfterMove, reorderKeyStep } from '../lib/reorderKeys'
import { buttonClass } from '../components/ui/buttonStyles'
import { MENU_PANEL } from '../components/ui/menuStyles'

const NO_REMINDERS = []

export default function DashboardPage() {
  const { signOut } = useAuth()
  const { lock, isUnlocked } = useEncryption()
  const { toast } = useToast()
  const { openPalette, registerCommands, closePalette } = useCommandPalette()
  const {
    data: spaces = [], isLoading, create, update, setTags, togglePin, toggleStar, toggleReadOnly, toggleLock, remove, reorder,
    archive, move, duplicate, bulkRemove, bulkArchive, bulkSetPinned, bulkDuplicate,
  } = useSpaces()
  // Dashboard items: items that belong to no space, shown after the spaces.
  const board = useItemBoard(null)
  const { items: dashboardItems, isLoading: itemsLoading } = board
  const itemsApi = board.api
  const { total: binTotal } = useRecycleBin()
  const { total: archiveTotal } = useArchive()
  const { data: starredItemCount = 0 } = useStarredItemCount()
  const { data: reminders = NO_REMINDERS } = useReminders()
  const remindersNowTotal = useRemindersNowCount(reminders)
  const { data: stats = {} } = useSpaceStats()
  const { data: globalSearchData } = useGlobalSearchData()
  const navigate = useNavigate()
  const headerRef = useRef(null)
  const searchInputRef = useRef(null)
  const mobileSearchInputRef = useRef(null)

  // Local state
  const [modal, setModal] = useState(null) // { type: 'create' } | { type: 'edit', col } | null
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchActive, setSearchActive] = useState(-1)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  // { spaceIds, itemIds } awaiting the "move to bin" confirmation.
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(null)
  // { ids, onDone } of the spaces being moved.
  const [moveSpaces, setMoveSpaces] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const online = useOnlineStatus()
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('arche:spaces-view')
      if (saved === 'list' || saved === 'grid') return saved
    } catch { /* storage unavailable */ }
    // No saved preference: grid on large screens, list on mobile.
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'list' : 'grid'
  })

  const changeViewMode = useCallback((mode) => {
    setViewMode(mode)
    try { localStorage.setItem('arche:spaces-view', mode) } catch { /* storage unavailable */ }
  }, [])

  // Grid is a masonry of 2 columns, 3 on lg.
  const gridCols = useMediaQuery('(min-width: 1024px)') ? 3 : 2

  // One sort for the whole dashboard: spaces by name, items by title.
  const [spaceSort, setSpaceSort] = usePersistedSort('arche-sort-spaces')

  // On small screens grid cards are narrow (two columns), so dashboard items
  // render denser, as they do inside a space.
  const isSmallScreen = useMediaQuery('(max-width: 639px)')
  const denseItems = viewMode === 'grid' && isSmallScreen

  // "New item" on the dashboard too: command palette entry + the "I" shortcut.
  const { openAddItem } = board
  useShortcut('new-item', openAddItem)
  useEffect(() => registerCommands([
    { id: 'new-item', label: 'New item', hint: 'I', icon: Plus, run: () => { closePalette(); openAddItem() } },
  ]), [registerCommands, closePalette, openAddItem])

  const focusMainSearch = useCallback(() => {
    setMobileMenuOpen(false)
    const isMobile = window.matchMedia('(max-width: 639px)').matches
    const ref = isMobile ? mobileSearchInputRef : searchInputRef
    setTimeout(() => ref.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const handlePointerDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [mobileMenuOpen])

  // Derived state
  const globalMatches = useMemo(() => (
    filterGlobalSearch({
      spaces: globalSearchData?.spaces || [],
      items: globalSearchData?.items || [],
      itemMeta: globalSearchData?.itemMeta || {},
    }, search)
  ), [globalSearchData, search])

  // Only top-level spaces on the dashboard; sub-spaces live inside their parent.
  const topLevelSpaces = useMemo(() => spaces.filter(s => !s.parent_id), [spaces])
  // Sidebar-style Starred count for the phone menu (the sidebar is hidden there).
  const starredTotal = spaces.filter(s => s.starred).length + starredItemCount

  const filtered = useMemo(() => {
    const q = search.trim()
    if (!q) return topLevelSpaces

    const matchedSpaceIds = new Set([
      ...globalMatches.spaces.map(c => c.id),
      ...globalMatches.items.map(i => i.space_id),
    ])
    return topLevelSpaces.filter(c => matchedSpaceIds.has(c.id))
  }, [topLevelSpaces, globalMatches, search])

  // Dashboard items matching the search (the same matching as global search).
  const searchedItems = useMemo(() => {
    if (!search.trim()) return dashboardItems
    return filterGlobalSearch({ spaces: [], items: dashboardItems }, search).items
  }, [dashboardItems, search])
  const hasEntries = filtered.length + searchedItems.length > 0

  // Tag filter (spaces and dashboard items)
  const [selectedTags, setSelectedTags] = useState([])
  const allTags = useMemo(() => {
    const set = new Set()
    for (const s of topLevelSpaces) for (const t of (s.tags || [])) set.add(t)
    for (const it of dashboardItems) for (const t of (it.tags || [])) set.add(t)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [topLevelSpaces, dashboardItems])
  // Only selected tags that a space or item still carries take effect, so a tag
  // removed from its last carrier can't leave the dashboard looking empty.
  const activeTags = useMemo(
    () => selectedTags.filter(t => allTags.includes(t)),
    [selectedTags, allTags]
  )
  const toggleTagFilter = useCallback((tag) => {
    setSelectedTags(prev => {
      const current = prev.filter(t => allTags.includes(t))
      return current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    })
  }, [allTags])
  const tagFiltered = useMemo(() => {
    if (activeTags.length === 0) return filtered
    return filtered.filter(s => (s.tags || []).some(t => activeTags.includes(t)))
  }, [filtered, activeTags])
  const tagFilteredItems = useMemo(() => {
    if (activeTags.length === 0) return searchedItems
    return searchedItems.filter(it => (it.tags || []).some(t => activeTags.includes(t)))
  }, [searchedItems, activeTags])

  const sortedSpaces = useMemo(
    () => sortEntities(tagFiltered, spaceSort, s => s.name),
    [tagFiltered, spaceSort]
  )
  const sortedItems = useMemo(
    () => sortEntities(tagFilteredItems, spaceSort, i => i.title),
    [tagFilteredItems, spaceSort]
  )

  // Selection: spaces and dashboard items together
  const {
    selectMode, setSelectMode, selectedSpaceIds, selectedItemIds,
    selectedCount, exitSelectMode, selectAll, toggleSpace, toggleItem,
  } = useDualEntitySelection(sortedSpaces, sortedItems)
  const selectedSpaces = useMemo(
    () => spaces.filter(c => selectedSpaceIds.has(c.id)),
    [spaces, selectedSpaceIds]
  )
  const selectedItems = useMemo(
    () => dashboardItems.filter(i => selectedItemIds.has(i.id)),
    [dashboardItems, selectedItemIds]
  )

  const { closeAll: closeItemDialogs } = board
  const pageActions = useMemo(() => ({
    onNewSpace: () => setModal({ type: 'create' }),
    onOpenSearch: () => focusMainSearch(),
    onEscape: () => {
      setModal(null)
      setDeleteConfirm(null)
      setMobileMenuOpen(false)
      setBulkDeleteConfirm(null)
      setMoveSpaces(null)
      closeItemDialogs()
      exitSelectMode()
    },
  }), [exitSelectMode, focusMainSearch, closeItemDialogs])

  useRegisterPageActions(pageActions)

  // Manual drag order only applies to the default sort, unfiltered.
  const reorderDisabled = !!search || selectMode || spaceSort !== 'default' || activeTags.length > 0

  const showSearchResults = search.trim().length > 0 && searchFocused

  const closeSearch = useCallback(() => {
    setSearchFocused(false)
    setSearch('')
    setSearchActive(-1)
  }, [])

  // Clears the search box (desktop and phone) and keeps typing focus in it.
  const searchClear = (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={() => { setSearch(''); setSearchActive(-1) }}
      aria-label="Clear search"
      title="Clear"
      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
    >
      <X size={14} />
    </button>
  )

  const goSpaceFromSearch = useCallback((spaceId) => {
    closeSearch()
    navigate(`/space/${spaceId}`)
  }, [closeSearch, navigate])

  const goItemFromSearch = useCallback((item) => {
    closeSearch()
    // A dashboard item (no space) stays on this page, scrolled to and
    // highlighted like an item opened inside a space.
    navigate(item.space_id ? `/space/${item.space_id}` : '/app', { state: { focusItemId: item.id } })
  }, [closeSearch, navigate])

  // Flat, ordered list of visible results for keyboard nav - must match
  // GlobalSearchResults' render order (spaces, then capped items).
  const searchOptions = useMemo(() => [
    ...globalMatches.spaces.map(s => ({
      id: searchOptionId('space', s.id),
      run: () => goSpaceFromSearch(s.id),
    })),
    ...globalMatches.items.slice(0, SEARCH_ITEM_DISPLAY_LIMIT).map(i => ({
      id: searchOptionId('item', i.id),
      run: () => goItemFromSearch(i),
    })),
  ], [globalMatches, goSpaceFromSearch, goItemFromSearch])

  const searchActiveIndex = searchOptions.length === 0 ? -1 : Math.min(searchActive, searchOptions.length - 1)
  const activeOptionId = searchActiveIndex >= 0 ? searchOptions[searchActiveIndex].id : undefined

  const handleSearchKeyDown = useCallback((e) => {
    if (!showSearchResults || searchOptions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSearchActive(i => Math.min(i + 1, searchOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSearchActive(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && searchActiveIndex >= 0) {
      e.preventDefault()
      searchOptions[searchActiveIndex].run()
    } else if (e.key === 'Escape') {
      setSearch('')
      setSearchActive(-1)
    }
  }, [showSearchResults, searchOptions, searchActiveIndex])

  const {
    dragIndex, dragOverIndex,
    handleDragStart, handleDragOver, handleDrop, handleDragEnd, handleKeyMove,
  } = useDragReorder({
    disabled: reorderDisabled,
    onDrop: (fromIndex, toIndex) => {
      const fromId = sortedSpaces[fromIndex]?.id
      const toId = sortedSpaces[toIndex]?.id
      if (!fromId || !toId) return

      const reordered = [...spaces]
      const fromIdx = reordered.findIndex(c => c.id === fromId)
      const toIdx = reordered.findIndex(c => c.id === toId)
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)

      reorder.mutate(reordered, {
        onError: () => toast.error("Couldn't reorder spaces."),
      })
    },
  })

  const renderSpaceCard = (col, index) => (
    <SpaceCard
      key={col.id}
      col={col}
      index={index}
      search={search}
      stats={stats}
      layout="grid"
      reorderDisabled={reorderDisabled}
      selectMode={selectMode}
      selected={selectedSpaceIds.has(col.id)}
      onToggleSelect={() => toggleSpace(col.id)}
      dragIndex={dragIndex}
      dragOverIndex={dragOverIndex}
      handleDragStart={handleDragStart}
      handleDragOver={handleDragOver}
      handleDrop={handleDrop}
      handleDragEnd={handleDragEnd}
      onKeyMove={(index, step) => {
        if (handleKeyMove(index, step, sortedSpaces.length)) {
          refocusAfterMove(`[data-space-id="${col.id}"]`)
        }
      }}
      navigate={navigate}
      activeTags={activeTags}
      onTagClick={toggleTagFilter}
      togglePin={togglePin}
      toggleStar={toggleStar}
      toggleReadOnly={toggleReadOnly}
      toggleLock={toggleLock}
      setTags={setTags}
      setModal={setModal}
      setDeleteConfirm={setDeleteConfirm}
      onDuplicate={(id) => duplicate.mutate(id, {
        onSuccess: () => toast.success('Space duplicated'),
        onError: () => toast.error("Couldn't duplicate the space."),
      })}
      onMove={(id) => setMoveSpaces({ ids: [id] })}
      onArchive={(id) => archive.mutate(id, {
        onSuccess: () => toast.success('Space archived'),
        onError: () => toast.error("Couldn't archive the space."),
      })}
    />
  )

  // Dashboard items reorder among themselves (separately from spaces).
  const itemDrag = useDragReorder({
    disabled: reorderDisabled,
    onDrop: (fromIndex, toIndex) => {
      const reordered = [...dashboardItems]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      itemsApi.reorder.mutate(reordered, {
        onError: () => toast.error("Couldn't reorder items."),
      })
    },
  })

  const renderItemCard = (item, index) => (
    <div
      key={item.id}
      data-item-id={item.id}
      onDragOver={reorderDisabled ? undefined : (e) => itemDrag.handleDragOver(e, index)}
      onDrop={reorderDisabled ? undefined : () => itemDrag.handleDrop(index)}
      onKeyDown={reorderDisabled ? undefined : (e) => {
        const step = reorderKeyStep(e)
        if (step && itemDrag.handleKeyMove(index, step, sortedItems.length)) {
          e.preventDefault()
          refocusAfterMove(`[data-item-id="${item.id}"] button[aria-label="Item actions"]`)
        }
      }}
      className={`rounded-2xl transition-all duration-300 animate-fade-in-up ${
        // Where a dragged item would land (only while an item, not a space, is
        // dragged): the soft ring of a selected card.
        !reorderDisabled && itemDrag.dragIndex !== null && itemDrag.dragOverIndex === index && itemDrag.dragIndex !== index
          ? 'ring-[1.5px] ring-accent-border'
          : ''
      } ${!reorderDisabled && itemDrag.dragIndex === index ? 'opacity-40' : ''} ${
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
        onDragStart={itemDrag.handleDragStart}
        onDragEnd={itemDrag.handleDragEnd}
        dragDisabled={reorderDisabled}
        dense={denseItems}
        grid={viewMode === 'grid'}
      />
    </div>
  )

  // Spaces and items are separate sections under the shared controls. The page
  // heading names the first section; a matching "Items" heading starts the
  // second, only when both show.
  const showSpacesSection = sortedSpaces.length > 0
  const showItemsSection = sortedItems.length > 0
  const firstSectionLabel = showSpacesSection || !showItemsSection ? 'Spaces' : 'Items'

  // One section's cards: masonry in grid view, one column in list.
  const renderSection = (nodes, cols = gridCols, minWidth) => (viewMode === 'grid' ? (
    <CardColumns cols={cols} minWidth={minWidth}>{nodes}</CardColumns>
  ) : (
    // The grid's own gap (see CardColumns), so switching views keeps the spacing.
    <div className="grid grid-cols-1 gap-2 sm:gap-3">
      {nodes}
    </div>
  ))

  // "2 spaces", "3 items", or "2 spaces and 3 items" (for bulk-action toasts).
  const describeSelection = (spaceCount, itemCount) => [
    spaceCount > 0 && `${spaceCount} ${spaceCount === 1 ? 'space' : 'spaces'}`,
    itemCount > 0 && `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
  ].filter(Boolean).join(' and ')

  /** Run a bulk action on the selected spaces and items, then leave select mode. */
  const runBulkAction = async (fn, successMessage, errorMessage) => {
    if (selectedCount === 0) return
    if (board.hasDirty([...selectedItemIds])) {
      toast.error('Save or discard unsaved changes before bulk actions')
      return
    }
    try {
      await fn([...selectedSpaceIds], [...selectedItemIds])
      toast.success(successMessage)
      exitSelectMode()
    } catch {
      toast.error(errorMessage)
    }
  }
  const selectionLabel = describeSelection(selectedSpaceIds.size, selectedItemIds.size)
  const hasSelectedItems = selectedItemIds.size > 0

  // The page's one main action.
  const newMenu = (
    <ActionMenu
      label={online ? 'New' : 'Unavailable offline'}
      triggerLabel="New"
      icon={Plus}
      disabled={!online}
      actions={[
        // First, nearest the button: the one-click way to jot something down.
        { id: 'quick-note', label: 'Quick note', onClick: board.addQuickNote },
        { id: 'item', label: 'New item', onClick: openAddItem },
        { id: 'space', label: 'New space', onClick: () => setModal({ type: 'create' }) },
      ]}
    />
  )

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header (mobile only) */}
      <header ref={headerRef} className="sm:hidden sticky top-0 z-20 glass">
        <div className="w-full px-4 h-14 flex items-center justify-between gap-3">
          {/* The name, as in the sidebar (hidden on phones) and the emails. */}
          <span className="text-base font-bold leading-none tracking-[0.03em] text-text-primary select-none" aria-hidden="true">
            <span className="text-accent">ARCHE</span>SPACE
          </span>
          {/* Actions - mobile: lock + ordered menu (search is the bar below) */}
          <div className="flex sm:hidden items-center gap-2">
            {isUnlocked && (
              <IconButton
                icon={Lock}
                label="Lock vault"
                size="md"
                onClick={() => {
                  lock()
                  toast.info('Vault locked')
                }}
              />
            )}
            <IconButton
              icon={Menu}
              label="More actions"
              title="More"
              size="md"
              active={mobileMenuOpen}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(v => !v)}
            />
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-bg-border bg-bg-surface px-3 py-2 flex flex-col gap-0.5">
            {/* Navigation first, then tools, then sign out. */}
            <button
              type="button"
              onClick={() => { navigate('/reminders'); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Bell size={16} />
              Reminders
              {remindersNowTotal > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1">
                  {remindersNowTotal > 99 ? '99+' : remindersNowTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { navigate('/starred'); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Star size={16} />
              Starred
              {starredTotal > 0 && (
                <span className="ml-auto text-xs tabular-nums text-text-muted">{starredTotal}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { navigate('/archive'); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Archive size={16} />
              Archive
              {archiveTotal > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1">
                  {archiveTotal > 99 ? '99+' : archiveTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { navigate('/recycle-bin'); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Trash2 size={16} />
              Bin
              {binTotal > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold px-1">
                  {binTotal > 99 ? '99+' : binTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { navigate('/settings'); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Settings size={16} />
              Settings
            </button>

            <button
              type="button"
              onClick={() => { openPalette(); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Command size={16} />
              Commands
            </button>
            <button
              type="button"
              onClick={() => { window.dispatchEvent(new CustomEvent('arche:open-shortcuts')); setMobileMenuOpen(false) }}
              className="relative flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              <Keyboard size={16} />
              Keyboard shortcuts
            </button>

            {/* Sign out (Leave local mode) sits apart, so it isn't tapped by mistake. */}
            <div className="border-t border-bg-border mt-1 pt-2">
              <button
                type="button"
                onClick={() => { setMobileMenuOpen(false); setConfirmSignOut(true) }}
                className="w-full flex items-center gap-2.5 px-3 h-10 rounded-lg hover:bg-danger-muted text-text-secondary hover:text-danger transition-colors text-sm font-medium"
              >
                <LogOut size={16} />
                {SIGN_OUT_TEXT.label}
              </button>
            </div>
          </div>
        )}
      </header>

      {confirmSignOut && (
        <ConfirmDialog
          title={SIGN_OUT_TEXT.title}
          message={SIGN_OUT_TEXT.message}
          confirmLabel={SIGN_OUT_TEXT.label}
          onConfirm={() => { setConfirmSignOut(false); signOut(); toast.info(SIGN_OUT_TEXT.done) }}
          onClose={() => setConfirmSignOut(false)}
        />
      )}

      {/* Main content */}
      <main className="px-4 sm:px-6 py-6">
        {/* Search - desktop (stays fixed at the top; the header, tag filter and
            grid scroll beneath it). */}
        <div className="hidden sm:block sticky top-0 z-30 bg-bg-base -mx-4 sm:-mx-6 px-4 sm:px-6 pt-6 pb-3 mb-3 -mt-6">
          <div className="flex items-center gap-2">
          <div className="relative w-full max-w-xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchActive(-1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={handleSearchKeyDown}
              role="combobox"
              aria-expanded={showSearchResults}
              aria-controls="global-search-listbox"
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="w-full h-9 bg-bg-card rounded-full pl-9 pr-12 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-border transition-shadow"
            />
            {search ? searchClear : (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted font-mono">/</kbd>
            )}
            {showSearchResults && (
              <GlobalSearchResults
                search={search}
                globalMatches={globalMatches}
                itemMeta={globalSearchData?.itemMeta}
                truncated={globalSearchData?.truncated}
                onSelectSpace={goSpaceFromSearch}
                onSelectItem={goItemFromSearch}
                activeOptionId={activeOptionId}
                listboxId="global-search-listbox"
                className={`absolute top-full mt-2 left-0 right-0 z-40 max-h-[60vh] overflow-y-auto ${MENU_PANEL}`}
              />
            )}
          </div>
          {!selectMode && <div className="ml-auto">{newMenu}</div>}
          </div>
        </div>

        {/* Mobile search */}
        <div className="sm:hidden mb-4">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={mobileSearchInputRef}
              placeholder="Search..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchActive(-1) }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={handleSearchKeyDown}
              role="combobox"
              aria-expanded={showSearchResults}
              aria-controls="global-search-listbox-mobile"
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="w-full h-10 bg-bg-card rounded-full pl-9 pr-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent-border transition-shadow"
            />
            {search && searchClear}
            {showSearchResults && (
              <GlobalSearchResults
                search={search}
                globalMatches={globalMatches}
                itemMeta={globalSearchData?.itemMeta}
                truncated={globalSearchData?.truncated}
                onSelectSpace={goSpaceFromSearch}
                onSelectItem={goItemFromSearch}
                activeOptionId={activeOptionId}
                listboxId="global-search-listbox-mobile"
                className={`mt-2 z-30 max-h-[50vh] overflow-y-auto ${MENU_PANEL}`}
              />
            )}
          </div>
        </div>

        {/* Page heading */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-text-primary">{firstSectionLabel}</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* View, sort and select are quiet tools. */}
            {hasEntries && !selectMode && (
              <ViewToggle value={viewMode} onChange={changeViewMode} />
            )}
            {topLevelSpaces.length + dashboardItems.length > 1 && !selectMode && (
              <SortMenu value={spaceSort} onChange={setSpaceSort} />
            )}
            {selectMode && hasEntries && (
              <Button variant="ghost" size="sm" icon={ListChecks} iconOnlyOnMobile aria-label="Select all" onClick={selectAll}>
                Select all
              </Button>
            )}
            {hasEntries && (
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
            {/* From sm up, New sits in the search row instead. */}
            {!selectMode && <div className="sm:hidden">{newMenu}</div>}
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && !selectMode && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
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

        {/* Spaces, then dashboard items */}
        {isLoading || itemsLoading ? (
          <div className={viewMode === 'list' ? 'max-w-[52rem] mx-auto' : ''}>
            {renderSection(
              [...Array(6)].map((_, i) => <SpaceCardSkeleton key={i} list={viewMode === 'list'} />),
              gridCols,
            )}
          </div>
        ) : !hasEntries ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
              <Folder size={24} className="text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">{search ? 'Nothing matches your search' : 'Nothing here yet'}</p>
            <p className="text-text-muted text-sm mt-1">{search ? `Nothing found for "${search.trim()}"` : 'Create a space or add an item to get started'}</p>
            {search ? (
              <Button className="mt-4" onClick={closeSearch}>Clear search</Button>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="primary"
                  icon={Plus}
                  disabled={!online}
                  title={online ? undefined : 'Unavailable offline'}
                  onClick={openAddItem}
                >
                  Add item
                </Button>
                <Button
                  icon={FolderPlus}
                  disabled={!online}
                  title={online ? undefined : 'Unavailable offline'}
                  onClick={() => setModal({ type: 'create' })}
                >
                  New space
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className={`pb-32 ${viewMode === 'list' ? 'max-w-[52rem] mx-auto' : ''}`}>
              {showSpacesSection && renderSection(sortedSpaces.map(renderSpaceCard), gridCols, MIN_SPACE_COLUMN_PX)}
              {showItemsSection && (
                <>
                  {showSpacesSection && (
                    <h2 className="mt-6 mb-4 text-xl font-semibold text-text-primary">Items</h2>
                  )}
                  {renderSection(sortedItems.map(renderItemCard))}
                </>
              )}
            </div>
            <BulkSelectionBar
              count={selectedCount}
              onClear={exitSelectMode}
              actions={[
                {
                  id: 'pin',
                  label: 'Pin',
                  icon: BULK_ICONS.pin,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkSetPinned.mutateAsync({ ids: spaceIds, pinned: true }),
                      itemIds.length && itemsApi.bulkSetPinned.mutateAsync({ ids: itemIds, pinned: true }),
                    ]),
                    `Pinned ${selectionLabel}`,
                    "Couldn't pin the selection.",
                  ),
                },
                {
                  id: 'unpin',
                  label: 'Unpin',
                  icon: BULK_ICONS.unpin,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkSetPinned.mutateAsync({ ids: spaceIds, pinned: false }),
                      itemIds.length && itemsApi.bulkSetPinned.mutateAsync({ ids: itemIds, pinned: false }),
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
                {
                  id: 'duplicate',
                  label: 'Duplicate',
                  icon: BULK_ICONS.copy,
                  onClick: () => runBulkAction(
                    () => Promise.all([
                      selectedSpaces.length && bulkDuplicate.mutateAsync(selectedSpaces),
                      selectedItems.length && itemsApi.bulkDuplicate.mutateAsync(selectedItems),
                    ]),
                    `Duplicated ${selectionLabel}`,
                    "Couldn't duplicate the selection.",
                  ),
                },
                // Spaces or items move, not both at once (a read-only space
                // stays where it is).
                hasSelectedItems && selectedSpaceIds.size === 0 && {
                  id: 'move',
                  label: 'Move',
                  icon: BULK_ICONS.move,
                  onClick: () => board.openMoveItems([...selectedItemIds], exitSelectMode),
                },
                !hasSelectedItems && selectedSpaces.length > 0 && !selectedSpaces.some(s => s.read_only) && {
                  id: 'move',
                  label: 'Move',
                  icon: BULK_ICONS.move,
                  onClick: () => setMoveSpaces({ ids: [...selectedSpaceIds], onDone: exitSelectMode }),
                },
                {
                  id: 'archive',
                  label: 'Archive',
                  icon: BULK_ICONS.archive,
                  onClick: () => runBulkAction(
                    (spaceIds, itemIds) => Promise.all([
                      spaceIds.length && bulkArchive.mutateAsync(spaceIds),
                      itemIds.length && itemsApi.bulkArchive.mutateAsync(itemIds),
                    ]),
                    `Archived ${selectionLabel}`,
                    "Couldn't archive the selection.",
                  ),
                },
                {
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
              ].filter(Boolean)}
            />
          </>
        )}
      </main>

      {/* Modals */}
      {modal?.type === 'create' && (
        <SpaceModal
          onSave={({ name, description, color }) => {
            create.mutate({ name, description, color }, {
              onSuccess: () => toast.success('Space created'),
              onError: () => toast.error("Couldn't create space.")
            })
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <SpaceModal
          initial={modal.col}
          onSave={({ name, description, color }) => {
            update.mutate({ id: modal.col.id, name, description, color }, {
              onSuccess: () => toast.success('Space updated'),
              onError: () => toast.error("Couldn't update space.")
            })
          }}
          onClose={() => setModal(null)}
        />
      )}
      {bulkDeleteConfirm && (
        <Modal
          title={`Move ${describeSelection(bulkDeleteConfirm.spaceIds.length, bulkDeleteConfirm.itemIds.length)} to the bin?`}
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
                onClick={async () => {
                  const { spaceIds, itemIds } = bulkDeleteConfirm
                  try {
                    await Promise.all([
                      spaceIds.length && bulkRemove.mutateAsync(spaceIds),
                      itemIds.length && itemsApi.bulkRemove.mutateAsync(itemIds),
                    ])
                    toast.success(`Moved ${describeSelection(spaceIds.length, itemIds.length)} to the bin`)
                    setBulkDeleteConfirm(null)
                    exitSelectMode()
                  } catch {
                    toast.error("Couldn't delete the selection.")
                  }
                }}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Move to the bin
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm">
            {bulkDeleteConfirm.spaceIds.length > 0
              ? 'All items inside these spaces go to the bin as well.'
              : 'You can restore them later from the bin.'}
          </p>
        </Modal>
      )}

      {/* Dashboard item dialogs: add, move to bin, move, unsaved guard */}
      <ItemBoardModals board={board} spaces={spaces} />

      {moveSpaces && (
        <MoveSpacesDialog
          ids={moveSpaces.ids}
          spaces={spaces}
          move={move}
          onDone={moveSpaces.onDone}
          onClose={() => setMoveSpaces(null)}
        />
      )}

      {deleteConfirm && (
        <Modal
          title="Move space to the bin?"
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
                    onSuccess: () => toast.success('Space moved to the bin'),
                    onError: () => toast.error("Couldn't delete space.")
                  })
                  setDeleteConfirm(null)
                }}
                className={buttonClass({ variant: 'dangerSolid' })}
              >
                Move to the bin
              </button>
            </div>
          }
        >
          <p className="text-text-secondary text-sm leading-relaxed">
            This space and all its items will be moved to the bin.
            You can restore them later or permanently delete them from there.
          </p>
        </Modal>
      )}
    </div>
  )
}
