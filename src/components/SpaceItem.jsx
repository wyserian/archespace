/**
 * SpaceItem.jsx - An item card: type badge, inline-editable title, actions,
 * and the editor for its type.
 *
 * It keeps a local copy of `title` and `content` so edits feel instant; they
 * are marked unsaved and saved with the Save button or automatically after
 * AUTO_SAVE_DELAY_MS, and collapsing with unsaved edits asks first.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, memo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import {
  Trash2, ChevronDown, ChevronUp, Pencil, Check, X, Star, StarOff,
  Pin, PinOff, Save, AlertTriangle, Copy, Archive,
  Maximize2, Minimize2, MoveRight, MoreVertical,
  ClipboardCopy, ClipboardCheck, FileDown, PencilOff, Shield, ShieldCheck, ShieldOff, EyeOff, Loader2,
  Bell,
} from 'lucide-react'
import { TextboxEditor, MarkdownEditor, ChecklistEditor, ListItemsEditor, CardListEditor } from './editors/ItemEditors'
// The Rich text editor (Tiptap) loads only when a Rich text item is shown.
const RichTextEditor = lazy(() => import('./editors/RichTextEditor'))
const RichTextToolbar = lazy(() =>
  import('./editors/RichTextEditor').then(m => ({ default: m.RichTextToolbar }))
)
// Excalidraw loads only when a Whiteboard opens full screen; its card shows
// the saved preview.
const WhiteboardEditor = lazy(() => import('./editors/WhiteboardEditor'))
import { WhiteboardPreview } from './editors/WhiteboardPreview'
import { TableEditor } from './editors/TableEditor'
import { KanbanEditor } from './editors/KanbanEditor'
import { CodeEditor } from './editors/CodeEditor'
import { ItemTags } from './ItemTags'
import { ReminderChip } from './ReminderChip'
import { ReminderDialog } from './ReminderDialog'
import { ActionMenu } from './ui/ActionMenu'
import { buttonClass } from './ui/buttonStyles'
import { getChecklistProgress } from '../lib/checklistProgress'
import { isOnline, enqueueOffline } from '../lib/offlineQueue'
import { isReachable, isNetworkError, setReachable } from '../lib/connectivity'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useEncryption } from '../context/EncryptionCore'
import { useVaultPinPrompt } from '../context/VaultPinPromptCore'
import { encryptItem } from '../lib/dataProtection'
import { hideItem, revealContent, useContentHidden } from '../lib/itemLock'
import { REORDER_KEYSHORTCUTS } from '../lib/reorderKeys'
import { itemToClipboardText } from '../lib/itemClipboard'
import { exportItemToPdf } from '../lib/pdfExport'
import { TypeBadge } from './ui/TypeBadge'
import { AUTO_SAVE_DELAY_MS } from '../lib/constants'

// When an item's content is taller than this (px), it collapses to a fixed
// preview of this height by default. Collapsing clamps the card to this height
// (with a fade) rather than hiding the content; expanding restores full height.
const COLLAPSED_MAX_PX = 640

/**
 * The handlers come from useItemBoard's `cardProps`.
 */
function SpaceItem({
  item,
  onUpdate,
  onSetTags,
  onSetReminder,
  onSetListNumbered,
  onTogglePin,
  onToggleStar,
  onToggleLock,
  onDelete,
  onDuplicate,
  onArchive,
  onMove,
  onDirtyChange,
  index,
  onDragStart,
  onDragEnd,
  dragDisabled = false,
  forcedCollapsed = false,
  onCollapsedChange,
  selectMode = false,
  selected = false,
  onSelectedChange,
  dense = false,
  // Where the item lives, shown beside the title outside its space (Starred).
  contextLabel,
  // In a read-only space: content stays readable and copyable, but every edit
  // (content, title, tags, pin, order, move, archive, delete) is off. A
  // reminder, like a star, can still be set.
  readOnly = false,
}) {
  const { cryptoKey } = useEncryption()
  const askVaultPin = useVaultPinPrompt()
  // A protected item, or one in a protected space, shows its content only
  // after the vault PIN (see itemLock).
  const hidden = useContentHidden(item)

  // Local state
  const [editingTitle, setEditingTitle]   = useState(false)
  const [titleVal, setTitleVal]           = useState(item.title)
  const [localContent, setLocalContent]   = useState(item.content)
  const [isDirty, setIsDirty]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [collapseGuard, setCollapseGuard] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  // Measured: is the content taller than the collapse threshold? Drives both the
  // auto-collapse default and whether the collapse/expand control is shown.
  const [overflowing, setOverflowing] = useState(false)
  // Local tap-to-reveal for a long, clamped body. Independent of the header
  // collapse chevron (which hides the body entirely).
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef(null)
  const [copied, setCopied] = useState(false)
  // The Rich text editor instance, for its toolbar on the tags row.
  const [richEditor, setRichEditor] = useState(null)
  const [reminderOpen, setReminderOpen] = useState(false)
  const online = useOnlineStatus()

  const latestState = useRef({ title: item.title, content: item.content })
  
  useEffect(() => {
    latestState.current = { title: titleVal, content: localContent }
  }, [titleVal, localContent])

  const autoSaveTimer = useRef(null)
  const copyTimer = useRef(null)
  const checklistProgress = item.type === 'checkbox_list' ? getChecklistProgress(localContent) : null

  // Built here (rather than passed as a fresh object from the parent) so that
  // React.memo can skip re-rendering this card when the list re-renders for
  // reasons that don't affect it (drag-hover, a sibling going dirty, etc.).
  const dragHandleProps = useMemo(
    () => (dragDisabled || readOnly
      ? {}
      : {
          draggable: true,
          onDragStart: (e) => { e.stopPropagation(); onDragStart?.(index) },
          onDragEnd,
        }),
    [dragDisabled, readOnly, index, onDragStart, onDragEnd]
  )

  // Sync from server when not dirty (realtime / parent update)
  const [syncedItem, setSyncedItem] = useState({ id: item.id, title: item.title, content: item.content })
  if (
    !isDirty &&
    (syncedItem.id !== item.id ||
      syncedItem.title !== item.title ||
      syncedItem.content !== item.content)
  ) {
    setSyncedItem({ id: item.id, title: item.title, content: item.content })
    setTitleVal(item.title)
    setLocalContent(item.content)
    setEditorVersion(version => version + 1)
    // Reset the tap-to-reveal state when the card is reused for a new item.
    if (syncedItem.id !== item.id) setExpanded(false)
  }

  // Notify parent about dirty state (for beforeunload warning)
  useEffect(() => {
    onDirtyChange?.(item.id, isDirty)
  }, [isDirty, item.id, onDirtyChange])

  // Header collapse (the chevron): an explicit, header-only collapse that hides
  // the body entirely - only the header (and tags) stay visible. Never applies
  // in fullscreen or select mode. Defined here (above the measure effect) so
  // that re-expanding a card re-measures its body.
  const headerCollapsed = !isFullscreen && !selectMode && forcedCollapsed

  // Measure content height to decide if the card is "long"
  // scrollHeight reports the full natural height even while the card is clamped,
  // so this stays correct whether the card is collapsed or expanded. While the
  // header is collapsed the body isn't rendered, so this simply re-runs (and
  // re-measures) when the card is expanded again.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => {
      const long = el.scrollHeight > COLLAPSED_MAX_PX + 24
      setOverflowing(prev => (prev !== long ? long : prev))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [localContent, editorVersion, headerCollapsed])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimer.current)
      clearTimeout(copyTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!isFullscreen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  /**
   * Called by editors on every content change.
   * Marks the item as dirty and schedules an auto-save.
   */
  /**
   * Persist the current local state to the server.
   * Accepts optional overrides for title/content (used by auto-save
   * to avoid stale closures).
   */
  const performSave = useCallback(async (overrideTitle, overrideContent) => {
    const payload = {
      id: item.id,
      title: overrideTitle ?? latestState.current.title,
      content: overrideContent ?? latestState.current.content,
    }

    const queueEdit = async () => {
      const encrypted = await encryptItem(
        { title: payload.title, content: payload.content },
        cryptoKey
      )
      enqueueOffline({
        type: 'item-update',
        payload: {
          id: payload.id,
          title: encrypted.title,
          content: encrypted.content,
        },
      })
      setIsDirty(false)
      setPendingSync(true)
      setCollapseGuard(false)
      clearTimeout(autoSaveTimer.current)
    }

    // Queue when offline/unreachable. Use the reachability signal, not just
    // navigator.onLine (which reads "online" on a LAN with no internet).
    if (!isOnline() || !isReachable()) {
      await queueEdit()
      return
    }

    setSaving(true)
    setPendingSync(false)
    try {
      await onUpdate(payload)
      setIsDirty(false)
      setCollapseGuard(false)
      clearTimeout(autoSaveTimer.current)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      // Lost the connection mid-save: queue the edit so nothing is lost.
      if (isNetworkError(err)) {
        setReachable(false)
        await queueEdit()
      }
      // Other errors: keep dirty state so the user can retry.
    } finally {
      setSaving(false)
    }
  }, [item.id, onUpdate, cryptoKey])

  useEffect(() => {
    const onFlush = () => { if (isDirty) performSave() }
    window.addEventListener('arche:flush-saves', onFlush)
    return () => window.removeEventListener('arche:flush-saves', onFlush)
  }, [isDirty, performSave])

  const handleContentChange = useCallback((newContent) => {
    if (readOnly) return
    setLocalContent(newContent)
    setIsDirty(true)

    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      performSave(latestState.current.title, newContent)
    }, AUTO_SAVE_DELAY_MS)
  }, [performSave, readOnly])

  /** Manual save button handler */
  const handleSave = () => performSave()

  /** Copy the item's current content to the clipboard as plain text */
  const handleCopy = useCallback(async () => {
    const text = itemToClipboardText({ type: item.type, content: latestState.current.content })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access denied (e.g. insecure context); silently ignore.
    }
  }, [item.type])

  /** Open a protected item with the vault PIN. */
  const handleReveal = async () => {
    const ok = await askVaultPin({
      title: 'Open protected item',
      confirmLabel: 'Open',
      message: `Enter your vault PIN to open "${item.title || 'Untitled'}".`,
    })
    if (ok) revealContent(item)
  }

  /** Hide an opened protected item again (saving any edit first). */
  const handleHide = () => {
    if (isDirty) performSave()
    setIsFullscreen(false)
    hideItem(item.id)
  }

  /** Discard all local edits and revert to server state */
  const handleDiscard = () => {
    setTitleVal(item.title)
    setLocalContent(item.content)
    setEditorVersion(version => version + 1)
    setIsDirty(false)
    setCollapseGuard(false)
    clearTimeout(autoSaveTimer.current)
  }

  /**
   * Collapse toggle with guard:
   * If the user tries to collapse while dirty, show a warning
   * instead of losing their edits.
   */
  const handleCollapseClick = () => {
    if (!headerCollapsed && isDirty) {
      setCollapseGuard(true)
      return
    }
    setCollapseGuard(false)
    onCollapsedChange?.(item.id, !headerCollapsed)
  }

  const handleFullscreenClick = () => {
    if (!isFullscreen && headerCollapsed) {
      onCollapsedChange?.(item.id, false)
      setCollapseGuard(false)
    }
    setIsFullscreen(v => !v)
  }

  // In grid view on small screens the card is shown denser (smaller text and
  // padding) so its full content still fits in a narrow two-column cell.
  const denseView = dense && !isFullscreen && !selectMode
  // Clamping applies in the normal list card, not in fullscreen or the dense
  // grid preview (which has its own tap-to-open behaviour).
  const canClamp = !isFullscreen && !denseView
  // The header drags the card only where reordering works, and not while the
  // title is being edited (so its text can be selected).
  const canDrag = !selectMode && !readOnly && !isFullscreen && !denseView && !editingTitle
  // Long-content clamp: a body taller than the threshold shows as a fixed-height
  // preview (with a fade) until tapped to reveal in full. Independent of the
  // header collapse, and never while editing (unsaved) so typing can't clamp the
  // card out from under the user.
  const clamped = canClamp && !headerCollapsed && overflowing && !isDirty && !expanded
  // The collapse/expand chevron is always available outside fullscreen.
  const showCollapseToggle = !isFullscreen
  // Whether the tags row (with the reminder) is shown (drives content top
  // padding so the two don't stack into a large gap).
  const showTags = !selectMode && ((item.tags?.length ?? 0) > 0 || !!item.reminder || (online && !readOnly))
  const canSetReminder = !!onSetReminder && online
  // The Rich text toolbar: a bar across the top of the note, always shown
  // (it scrolls sideways when narrow) - except read-only, collapsed or select
  // mode. On a clamped preview it expands the note first; on a dense grid card
  // it opens full screen (how those cards edit).
  const showRichToolbar = item.type === 'richtext' && !readOnly && !headerCollapsed && !selectMode && !hidden
  // Copy and Export PDF release the content, so a hidden protected item has none.
  const canCopy = !hidden && item.type !== 'whiteboard'

  /** Save the title instantly to the server without marking dirty */
  const saveTitle = async () => {
    setEditingTitle(false)
    if (titleVal !== item.title) {
      // Route through performSave so a rename is queued when offline, just like
      // a content edit, instead of failing on a doomed network request.
      latestState.current = { ...latestState.current, title: titleVal }
      await performSave(titleVal, localContent)
    }
  }

  // Styled like a space card: borderless on a soft shadow that deepens on
  // hover, a thin accent ring when selected, and no border when pinned (the
  // pin icon marks it). The space card's press shrink and hover background
  // are left out: this card is an inline editor, so they would fire while
  // typing or clicking into content (and clash with the fade).
  const itemCard = (
    <div className={`${
      isFullscreen
        ? 'fixed inset-0 z-[80] flex flex-col rounded-none border-0 bg-bg-base'
        : 'relative rounded-2xl bg-bg-card shadow-sm hover:shadow-md transition-shadow duration-200'
    } ${denseView ? 'text-[13px]' : ''} ${
      isFullscreen ? '' : selected ? 'ring-[1.5px] ring-accent-border'
        // Soft ring + lift while one of its text fields has the cursor
        // (index.css), marking the item being edited. Read-only never edits.
        : readOnly ? '' : 'item-card-editable'
    }`}
    >
      {/* Header */}
      {/* The header is the drag area (no handle icon): the cursor turns into a
          grab hand over it. */}
      <div
        {...(canDrag ? dragHandleProps : {})}
        className={`flex items-center gap-2 flex-wrap gap-y-2 ${
          denseView ? 'px-2.5 py-[7px]' : 'px-4 py-[9px]'
        } ${
          isFullscreen ? 'sticky top-0 z-10 bg-bg-surface/95 backdrop-blur-md' : ''
        } ${
          !headerCollapsed || collapseGuard ? 'border-b border-bg-border' : ''
        } ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Pin indicator */}
        {item.pinned && <Pin size={14} className="text-accent shrink-0 fill-accent" />}
        {/* Type badge: the type's colored icon in a tinted pill. */}
        <TypeBadge type={item.type} />

        {/* Title (inline editable), plus where the item lives when shown
            outside its space (the Starred view). */}
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          {editingTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') { setTitleVal(item.title); setEditingTitle(false) }
              }}
              onBlur={saveTitle}
              className="w-full bg-bg-elevated border border-accent rounded-lg px-2.5 py-1 text-sm font-medium text-text-primary focus:outline-none"
            />
          ) : (
            <span className={`min-w-0 text-sm font-medium truncate block ${item.title ? 'text-text-primary' : 'text-text-muted italic'}`}>
              {item.title || 'Untitled'}
            </span>
          )}
          {/* Starred, right after the name, in the accent colour. */}
          {item.starred && !editingTitle && (
            <Star size={13} className="shrink-0 self-center text-accent fill-accent" aria-label="Starred" />
          )}
          {/* Protected: a shield, or once the PIN has opened it, a button to
              hide it again. */}
          {(item.locked || hidden) && !editingTitle && (!hidden ? (
            <button
              type="button"
              onClick={handleHide}
              className="shrink-0 self-center -m-1 p-1 rounded-md text-accent hover:bg-bg-hover transition-colors"
              aria-label="Hide again"
              title="Hide again"
            >
              <EyeOff size={13} />
            </button>
          ) : (
            <ShieldCheck size={13} className="shrink-0 self-center text-text-muted" aria-label="Protected" />
          ))}
          {/* Outside its space, say why it can't be edited. */}
          {readOnly && contextLabel && (
            <span className="shrink-0 self-center text-text-muted" title="In a read-only space">
              <PencilOff size={13} aria-label="Read-only" />
            </span>
          )}
          {contextLabel && !editingTitle && (
            <span className="shrink-0 max-w-[45%] truncate text-xs text-text-muted" title={contextLabel}>
              {contextLabel}
            </span>
          )}
        </div>

        {checklistProgress?.total > 0 && !hidden && (
          <span className="shrink-0 text-xs text-text-muted font-medium tabular-nums">
            {checklistProgress.done}/{checklistProgress.total} done
          </span>
        )}

        {/* Dirty indicator badge */}
        {pendingSync && (
          <span className="shrink-0 text-xs text-blue-400 font-medium px-2 py-0.5 bg-blue-400/10 rounded-md border border-blue-400/20">
            Saved offline
          </span>
        )}
        {savedFlash && !isDirty && !saving && (
          <span className="shrink-0 text-xs text-success font-medium px-2 py-0.5 bg-success/10 rounded-md border border-success/30">
            Saved
          </span>
        )}
        {isDirty && !saving && (
          <span className="shrink-0 text-xs text-amber-400 font-medium px-2 py-0.5 bg-amber-400/10 rounded-md border border-amber-400/20">
            Unsaved
          </span>
        )}

        {/* Saving indicator */}
        {saving && (
          <span className="shrink-0 text-xs text-accent font-medium px-2 py-0.5 bg-accent-muted rounded-md">
            Saving...
          </span>
        )}

        {/* Action buttons */}
        {!selectMode && (
        <div className="flex items-center gap-1 shrink-0 flex-wrap">
          {isDirty ? (
            /* Save / Discard mode */
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className={buttonClass({ variant: 'primary', size: 'xs' })}
              >
                {saving
                  ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  : <Save size={14} />}
                Save
              </button>
              <button
                onClick={handleDiscard}
                className={buttonClass({ variant: 'secondary', size: 'xs' })}
              >
                <X size={14} /> Discard
              </button>
            </>
          ) : (
            /* Normal action buttons */
            <>
              {editingTitle ? (
                <>
                  <button onClick={saveTitle} className={buttonClass({ variant: 'primary', size: 'xs' })}>
                    <Check size={14} /> Save
                  </button>
                  <button onClick={() => { setTitleVal(item.title); setEditingTitle(false) }} className={buttonClass({ variant: 'secondary', size: 'xs' })}>
                    <X size={14} /> Cancel
                  </button>
                </>
              ) : (
                <>
                  {showCollapseToggle && (
                  <button
                    type="button"
                    onClick={handleCollapseClick}
                    className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                    aria-label={headerCollapsed ? 'Expand item' : 'Collapse item'}
                    title={headerCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {headerCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                  )}
                  {!hidden && (
                  <button
                    type="button"
                    onClick={handleFullscreenClick}
                    className={`p-1.5 rounded-full transition-colors ${
                      isFullscreen
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                    }`}
                    aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                    title={isFullscreen ? 'Exit full screen' : 'Full screen'}
                  >
                    {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                  )}
                  <ActionMenu
                    label="Item actions"
                    bordered={false}
                    compact
                    icon={MoreVertical}
                    // Alt+Up / Alt+Down here move the card (handled by the page).
                    triggerProps={canDrag && !dragDisabled ? { 'aria-keyshortcuts': REORDER_KEYSHORTCUTS } : undefined}
                    actions={[
                      !readOnly && {
                        id: 'pin',
                        label: item.pinned ? 'Unpin' : 'Pin',
                        icon: item.pinned ? PinOff : Pin,
                        active: item.pinned,
                        disabled: !online,
                        onClick: () => onTogglePin(item.id, item.pinned),
                      },
                      onToggleStar && {
                        id: 'star',
                        label: item.starred ? 'Unstar' : 'Star',
                        icon: item.starred ? StarOff : Star,
                        active: item.starred,
                        disabled: !online,
                        onClick: () => onToggleStar(item.id, item.starred),
                      },
                      onSetReminder && {
                        id: 'reminder',
                        label: item.reminder ? 'Change reminder' : 'Add reminder',
                        icon: Bell,
                        disabled: !online,
                        onClick: () => setReminderOpen(true),
                      },
                      canCopy && {
                        id: 'copy',
                        label: copied ? 'Copied' : 'Copy',
                        icon: copied ? ClipboardCheck : ClipboardCopy,
                        onClick: handleCopy,
                      },
                      onToggleLock && {
                        id: 'lock',
                        label: item.locked ? 'Remove protection' : 'Protect',
                        icon: item.locked ? ShieldOff : Shield,
                        disabled: !online,
                        onClick: () => onToggleLock(item.id, !!item.locked),
                      },
                      !readOnly && { id: 'rename', label: 'Rename', icon: Pencil, onClick: () => setEditingTitle(true) },
                      !readOnly && onDuplicate && { id: 'duplicate', label: 'Duplicate', icon: Copy, disabled: !online, onClick: () => onDuplicate(item) },
                      !readOnly && onMove && { id: 'move', label: 'Move', icon: MoveRight, disabled: !online, onClick: () => onMove(item.id) },
                      !hidden && {
                        id: 'export-pdf',
                        label: 'Export PDF',
                        icon: FileDown,
                        onClick: () => exportItemToPdf({
                          type: item.type,
                          title: latestState.current.title,
                          content: latestState.current.content,
                        }),
                      },
                      !readOnly && onArchive && { id: 'archive', label: 'Archive', icon: Archive, disabled: !online, onClick: () => onArchive(item.id) },
                      !readOnly && { id: 'delete', label: 'Delete', icon: Trash2, variant: 'danger', disabled: !online, onClick: () => onDelete(item.id) },
                    ]}
                  />
                </>
              )}
            </>
          )}
        </div>
        )}
        {selectMode && (
          <button
            type="button"
            onClick={() => onSelectedChange?.(item.id)}
            aria-label={selected ? 'Deselect' : 'Select'}
            aria-pressed={selected}
            className={`shrink-0 ml-auto flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
              selected ? 'bg-accent border-accent text-accent-fg' : 'border-bg-border text-transparent'
            }`}
          >
            <Check size={14} />
          </button>
        )}
      </div>

      {/* Tags */}
      {showTags && (
        <div className={`flex flex-wrap items-center gap-1.5 ${denseView ? 'px-2.5 py-2' : 'px-4 py-2.5'}`}>
          {item.reminder && (
            <ReminderChip
              reminder={item.reminder}
              onClick={canSetReminder ? () => setReminderOpen(true) : undefined}
            />
          )}
          <ItemTags
            tags={item.tags || []}
            onChange={(tags) => onSetTags?.(item.id, tags)}
            disabled={!online || readOnly}
          />
        </div>
      )}
      {reminderOpen && (
        <ReminderDialog
          initial={item.reminder}
          onSave={(reminder) => onSetReminder(item.id, reminder)}
          onRemove={() => onSetReminder(item.id, null)}
          onClose={() => setReminderOpen(false)}
        />
      )}

      {/* Rich text toolbar: a bar across the top of the note with a rule
          above and below, inset from the card's edges (no box, same
          background as the card), shown whenever its editor is live. */}
      {showRichToolbar && (
        <div
          onMouseDownCapture={() => {
            if (clamped) setExpanded(true)
            else if (denseView) setIsFullscreen(true)
          }}
          className={`${denseView ? 'mx-2.5' : 'mx-4'} border-y border-bg-border py-1 ${showTags ? '' : 'mt-3'}`}
        >
          <Suspense fallback={<div className="h-8" />}>
            <RichTextToolbar editor={richEditor} />
          </Suspense>
        </div>
      )}

      {/* Unsaved collapse warning */}
      {collapseGuard && (
        <div className="px-4 py-3 bg-amber-400/8 border-b border-amber-400/20 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <span className="text-sm text-amber-400 flex-1">You have unsaved changes.</span>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className={buttonClass({ variant: 'primary', size: 'xs' })}
            >
              <Save size={14} /> Save & collapse
            </button>
            <button
              onClick={() => { handleDiscard(); onCollapsedChange?.(item.id, true) }}
              className={buttonClass({ variant: 'secondary', size: 'xs' })}
            >
              Discard & collapse
            </button>
            <button
              type="button"
              onClick={() => setCollapseGuard(false)}
              aria-label="Dismiss warning"
              title="Dismiss"
              className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Content editor
          The header chevron hides the body entirely (only the header and tags
          stay). When shown, a long body is clamped to a fixed preview height
          (with a fade) that expands to full height when tapped. A protected item
          shows a Protected panel instead until the vault PIN opens it. */}
      {!headerCollapsed && hidden && (
        <div className={`${denseView ? 'px-2.5 pb-3' : 'px-4 pb-4'} ${showTags ? 'pt-0' : denseView ? 'pt-3' : 'pt-4'}`}>
          <button
            type="button"
            onClick={handleReveal}
            disabled={selectMode}
            className={`w-full flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-bg-border bg-bg-sunken text-text-muted transition-colors enabled:hover:border-accent-border enabled:hover:text-text-primary ${
              denseView ? 'py-4' : 'py-7'
            }`}
          >
            <ShieldCheck size={denseView ? 16 : 18} className="mb-1" />
            <span className="text-sm font-medium text-text-secondary">Protected</span>
            <span className="text-xs">Open with your vault PIN</span>
          </button>
        </div>
      )}
      {!headerCollapsed && !hidden && (
      <div
        ref={contentRef}
        onClick={
          clamped && !selectMode
            ? () => setExpanded(true)
            : denseView
              ? () => setIsFullscreen(true)
              : undefined
        }
        style={clamped ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        className={`${
          isFullscreen
            // Sides lined up with the header and tags. A Whiteboard's canvas
            // or a Kanban's columns fill the space and scroll themselves; a
            // Kanban sits closer under the tags.
            ? `flex-1 px-4 ${item.type === 'kanban' ? 'pt-1 pb-4' : 'py-5'} ${item.type === 'whiteboard' || item.type === 'kanban' ? 'min-h-0' : 'overflow-y-auto'}`
            : denseView
              ? `px-2.5 ${showTags && !showRichToolbar ? 'pt-0' : 'pt-3'} pb-3 cursor-pointer`
              : `px-4 ${showRichToolbar ? 'pt-3' : showTags ? 'pt-0' : 'pt-4'} pb-4`
        }${clamped ? ` relative overflow-hidden rounded-b-2xl${selectMode ? '' : ' cursor-pointer'}` : ''}`}
      >
        {/* In the dense grid, or while clamped, the content is a non-interactive
            preview; tapping it opens full screen / expands instead of editing. */}
        <div className={denseView || clamped ? 'pointer-events-none' : 'contents'}>
        {/* Only the editor for this item's type */}
        {item.type === 'textbox'       && <TextboxEditor    key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {item.type === 'markdown'      && <MarkdownEditor   key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {item.type === 'richtext' && (
          <Suspense fallback={<div className="min-h-[80px] rounded-xl border border-bg-border bg-bg-sunken" />}>
            <RichTextEditor
              key={`${item.id}:${editorVersion}`}
              content={localContent}
              onChange={handleContentChange}
              readOnly={readOnly}
              onEditor={setRichEditor}
            />
          </Suspense>
        )}
        {item.type === 'code'          && <CodeEditor       key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {item.type === 'checkbox_list' && <ChecklistEditor  key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {/* One List type: bullets (menu_list) or numbers (numbered_list); the
            Numbered checkbox switches between them without remounting. */}
        {(item.type === 'menu_list' || item.type === 'numbered_list') && (
          <ListItemsEditor
            key={`${item.id}:${editorVersion}`}
            content={localContent}
            onChange={handleContentChange}
            readOnly={readOnly}
            numbered={item.type === 'numbered_list'}
            onNumberedChange={onSetListNumbered && online ? (numbered) => onSetListNumbered(item.id, numbered) : undefined}
          />
        )}
        {item.type === 'card_list'     && <CardListEditor   key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {item.type === 'whiteboard' && (isFullscreen ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin text-text-muted" /></div>}>
            <WhiteboardEditor key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />
          </Suspense>
        ) : (
          <WhiteboardPreview content={localContent} onOpen={handleFullscreenClick} onUpgrade={handleContentChange} readOnly={readOnly} />
        ))}
        {item.type === 'table'         && <TableEditor      key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} />}
        {item.type === 'kanban'        && <KanbanEditor     key={`${item.id}:${editorVersion}`} content={localContent} onChange={handleContentChange} readOnly={readOnly} fill={isFullscreen} />}
        </div>
        {/* A soft fade at the bottom cues "more below" without a label; tapping
            the preview expands it in full. */}
        {clamped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-card to-transparent" />
        )}
      </div>
      )}
    </div>
  )

  return isFullscreen ? createPortal(itemCard, document.body) : itemCard
}

export default memo(SpaceItem)
