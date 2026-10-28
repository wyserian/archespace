/**
 * SpaceCard.jsx - A single space on the dashboard.
 *
 * `layout="grid"` (default) renders the full card; `layout="list"` renders a
 * compact full-width row. Both share the same navigate / select / drag /
 * action-menu behaviour: borderless cards, a soft space-colour strip, tags
 * coloured by name inline with the item count, and a 3-dot menu.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pin, PinOff, Star, StarOff, Pencil, PencilOff, PencilLine, Trash2, Copy, MoveRight, FileDown, Archive, MoreVertical, Shield, ShieldCheck, ShieldOff, Tag, X } from 'lucide-react'
import { useFetchSpaceItems } from '../../hooks/useSpaceItems'
import { exportSpaceToPdf } from '../../lib/pdfExport'
import { queryKeys } from '../../lib/queryKeys'
import { getColorPreset, parseTags, softColorValue, tagColorValue } from '../../lib/spaceColors'
import { ActionMenu } from '../ui/ActionMenu'
import { SelectCheck } from '../ui/SelectCheck'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useToast } from '../../context/ToastCore'
import { useVaultPinPrompt } from '../../context/VaultPinPromptCore'
import { useItemRevealed, useSpaceHidden } from '../../lib/itemLock'
import { REORDER_KEYSHORTCUTS, reorderKeyStep } from '../../lib/reorderKeys'

/** A tag chip tinted by the tag's own stable colour; brighter when it's an
 * active filter. Its clicks stay on the chip, so it filters instead of opening
 * the space. With `onRemove`, an × shows on hover or focus (always on touch
 * screens) to remove the tag. */
function TagPill({ tag, active, onClick, onRemove }) {
  const color = tagColorValue(tag)
  return (
    <span
      className="group/tag inline-flex items-center rounded-md border transition-colors"
      style={{
        backgroundColor: `${color}${active ? '42' : '29'}`,
        borderColor: active ? `${color}8c` : 'transparent',
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick?.(tag) }}
        aria-pressed={active}
        className="text-[11px] font-semibold pl-2 pr-2 py-0.5"
        style={{ color }}
      >
        {tag}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(tag) }}
          aria-label={`Remove tag ${tag}`}
          className="hidden -ml-1 pr-1.5 py-0.5 opacity-70 hover:opacity-100 group-hover/tag:inline-flex group-focus-within/tag:inline-flex [@media(hover:none)]:inline-flex"
          style={{ color }}
        >
          <X size={11} />
        </button>
      )}
    </span>
  )
}

/** The box for adding tags on a space card (comma-separated, Enter to add). */
function TagInput({ onCommit, onCancel }) {
  const [value, setValue] = useState('')
  const commit = () => onCommit(value.split(',').map(t => t.trim()).filter(Boolean))
  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onClick={e => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={e => {
        // Typing here must not reach the card's own keys (open, reorder).
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape') onCancel()
      }}
      placeholder="tag"
      aria-label="New tag"
      maxLength={32}
      className="w-20 text-[11px] px-2 py-0.5 rounded-md bg-bg-elevated border border-accent/40 text-text-primary placeholder-text-muted focus:outline-none"
    />
  )
}

/** Muted marker after the name of a read-only space. */
function ReadOnlyMark() {
  return (
    <span className="shrink-0 text-text-muted" title="Read-only">
      <PencilOff size={13} aria-label="Read-only" />
    </span>
  )
}

/** After the name of a protected space: muted until opened with the PIN. */
function ProtectedMark({ hidden }) {
  return (
    <span className={`shrink-0 ${hidden ? 'text-text-muted' : 'text-accent'}`} title={hidden ? 'Protected' : 'Protected, open'}>
      <ShieldCheck size={13} aria-label={hidden ? 'Protected' : 'Protected, open'} />
    </span>
  )
}

export function SpaceCard({
  col, index, search, dragIndex, dragOverIndex,
  handleDragStart, handleDragOver, handleDrop, handleDragEnd,
  navigate, togglePin, toggleStar, toggleReadOnly, toggleLock, setTags, setModal, setDeleteConfirm, onDuplicate, onMove, onArchive,
  stats,
  onTagClick,
  activeTags = [],
  layout = 'grid',
  selectMode = false,
  selected = false,
  onToggleSelect,
  reorderDisabled = false,
  // (index, -1 | 1): move this card one place, from the keyboard.
  onKeyMove,
  // Archive and Bin (grid card): the card's only actions, as buttons in the
  // header in place of its menu, and a line under the name (when it was
  // archived or deleted). It then doesn't open or drag (there's no page to
  // open), except to toggle in select mode.
  actions,
  note,
}) {
  const online = useOnlineStatus()
  const { toast } = useToast()
  const askVaultPin = useVaultPinPrompt()
  // Protected (itself or its parent) and not opened: the name, tags and count
  // show; the description and editing wait for the PIN (asked on opening).
  const hidden = useSpaceHidden(col.id)
  const revealed = useItemRevealed(col.id)

  // Protecting is instant and hides the space. Removing protection needs the PIN,
  // unless the space was already opened with it.
  const handleToggleLock = async () => {
    if (col.locked && !revealed) {
      const ok = await askVaultPin({
        title: 'Remove protection',
        message: 'Enter your vault PIN to remove protection. The space will open without the PIN.',
        confirmLabel: 'Remove protection',
      })
      if (!ok) return
    }
    toggleLock.mutate({ id: col.id, locked: !!col.locked }, {
      onSuccess: () => toast.success(col.locked ? 'Protection removed' : 'Space protected'),
      onError: () => toast.error(col.locked ? "Couldn't remove protection." : "Couldn't protect the space."),
    })
  }
  // The card has no items of its own, so they load (or come from the cache)
  // on demand; sub-spaces are listed by name, as from inside the space.
  const qc = useQueryClient()
  const fetchSpaceItems = useFetchSpaceItems()
  const handleExportPdf = async () => {
    try {
      const subSpaces = (qc.getQueryData(queryKeys.spaces()) || []).filter(s => s.parent_id === col.id)
      await exportSpaceToPdf(col, await fetchSpaceItems(col.id), subSpaces)
    } catch {
      toast.error("Couldn't export the space.")
    }
  }

  const colorPreset = getColorPreset(col.color)
  // Softer, thinner space-colour strip (~50% alpha) than the picker's vivid value.
  const softColor = softColorValue(col.color, '80')
  const itemStats = stats?.[col.id]
  const itemLabel = itemStats
    ? `${itemStats.total} ${itemStats.total === 1 ? 'item' : 'items'}`
    : '0 items'
  const tags = Array.isArray(col.tags) ? col.tags : []

  // Tags are the space's details, so they follow Edit: not in a read-only
  // space, nor a protected one before it's opened.
  const [addingTag, setAddingTag] = useState(false)
  const canEditTags = !!setTags && !col.read_only && !hidden && online && !selectMode
  const saveTags = (next) => setTags.mutate({ id: col.id, tags: next }, {
    onError: () => toast.error("Couldn't update the tags."),
  })
  const addTags = (added) => {
    setAddingTag(false)
    const next = parseTags([...new Set([...tags, ...added])])
    if (next.length !== tags.length) saveTags(next)
  }
  const removeTag = canEditTags ? (tag) => saveTags(tags.filter(t => t !== tag)) : undefined
  const tagInput = addingTag && canEditTags && (
    <TagInput onCommit={addTags} onCancel={() => setAddingTag(false)} />
  )

  const activate = () => {
    if (selectMode) onToggleSelect?.()
    else if (!actions) navigate(`/space/${col.id}`)
  }

  // Alt+Up / Alt+Down move the card (on it or its menu button), where dragging
  // would be allowed.
  const canKeyMove = !!onKeyMove && !search && !selectMode && !reorderDisabled
  // Only act when the row/card itself is focused, so Enter/Space on a nested
  // control (the ActionMenu button) doesn't also navigate.
  const handleKeyDown = (e) => {
    const step = canKeyMove ? reorderKeyStep(e) : 0
    if (step) {
      e.preventDefault()
      onKeyMove(index, step)
      return
    }
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  // Every space action writes to the server, so all are disabled offline.
  // Grouped: mark it; edit, duplicate or move it; how it's kept (read-only,
  // protected, archived); then delete on its own.
  const menuActions = [
    {
      id: 'pin',
      group: 'mark',
      label: col.pinned ? 'Unpin' : 'Pin',
      icon: col.pinned ? PinOff : Pin,
      active: col.pinned,
      disabled: !online,
      onClick: () => togglePin.mutate({ id: col.id, pinned: col.pinned }),
    },
    // Starring never moves the space; it adds it to the Starred view.
    toggleStar && {
      id: 'star',
      group: 'mark',
      label: col.starred ? 'Unstar' : 'Star',
      icon: col.starred ? StarOff : Star,
      active: col.starred,
      disabled: !online,
      onClick: () => toggleStar.mutate({ id: col.id, starred: col.starred }),
    },
    setTags && !col.read_only && !hidden && { id: 'tag', group: 'mark', label: 'Add tag', icon: Tag, disabled: !online, onClick: () => setAddingTag(true) },
    // Editing shows the description, so a hidden protected space opens first.
    !col.read_only && !hidden && { id: 'edit', group: 'content', label: 'Edit', icon: Pencil, disabled: !online, onClick: () => setModal({ type: 'edit', col }) },
    { id: 'duplicate', group: 'content', label: 'Duplicate', icon: Copy, disabled: !online, onClick: () => onDuplicate?.(col.id) },
    // A read-only space stays where it is; a hidden one opens first (moving it
    // out of a protected space would show it without the PIN).
    onMove && !col.read_only && !hidden && { id: 'move', group: 'content', label: 'Move', icon: MoveRight, disabled: !online, onClick: () => onMove(col.id) },
    !hidden && { id: 'export-pdf', group: 'content', label: 'Export PDF', icon: FileDown, onClick: handleExportPdf },
    // Read-only locks the space's content (its details and items); managing
    // the space itself (pin, duplicate, archive, delete) stays available.
    toggleReadOnly && {
      id: 'read-only',
      group: 'keep',
      label: col.read_only ? 'Allow editing' : 'Read-only',
      icon: col.read_only ? PencilLine : PencilOff,
      disabled: !online,
      onClick: () => toggleReadOnly.mutate({ id: col.id, read_only: col.read_only }, {
        onSuccess: () => toast.success(col.read_only ? 'Editing allowed' : 'Space is now read-only'),
        onError: () => toast.error("Couldn't change read-only."),
      }),
    },
    toggleLock && {
      id: 'lock',
      group: 'keep',
      label: col.locked ? 'Remove protection' : 'Protect',
      icon: col.locked ? ShieldOff : Shield,
      disabled: !online,
      onClick: handleToggleLock,
    },
    { id: 'archive', group: 'keep', label: 'Archive', icon: Archive, disabled: !online, onClick: () => onArchive?.(col.id) },
    { id: 'delete', group: 'delete', label: 'Delete', icon: Trash2, variant: 'danger', disabled: !online, onClick: () => setDeleteConfirm(col.id) },
  ]

  const dragProps = {
    draggable: !search && !selectMode && !reorderDisabled,
    onDragStart: () => !selectMode && handleDragStart(index),
    onDragOver: (e) => !selectMode && handleDragOver(e, index),
    onDrop: () => !selectMode && handleDrop(index),
    onDragEnd: handleDragEnd,
  }

  const ariaLabel = selectMode
    ? `${selected ? 'Deselect' : 'Select'} space: ${col.name}`
    : `Open space: ${col.name}`
  const keyProps = {
    'data-space-id': col.id,
    'aria-keyshortcuts': canKeyMove ? REORDER_KEYSHORTCUTS : undefined,
  }
  // Where a dragged card would land: the same soft ring as a selected card.
  const dropRing = !selectMode && dragOverIndex === index && dragIndex !== index
    ? 'ring-[1.5px] ring-accent-border'
    : ''

  // Borderless: the card is set off by its surface plus a soft shadow; only a
  // selected card in select mode gets a soft accent ring.
  const selectedRing = selected ? 'ring-[1.5px] ring-accent-border' : ''

  // List row
  if (layout === 'list') {
    return (
      <div
        {...dragProps}
        {...keyProps}
        onClick={activate}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-pressed={selectMode ? selected : undefined}
        aria-label={ariaLabel}
        className={`group relative flex items-center gap-3 sm:gap-4 rounded-xl pl-4 pr-3 py-3 cursor-pointer transition-all animate-fade-in-up bg-bg-card shadow-sm hover:shadow-md hover:bg-bg-elevated active:scale-[0.99] ${selectedRing} ${dropRing} ${
          !selectMode && dragIndex === index ? 'opacity-40' : ''
        }`}
        style={{
          animationDelay: `${index * 30}ms`,
          borderLeftWidth: colorPreset ? '2px' : undefined,
          borderLeftColor: softColor,
        }}
      >
        {col.pinned && <Pin size={14} className="shrink-0 text-accent fill-accent" />}
        {/* The name column, with the star right after the name inside the
            same fixed width. */}
        <div className="shrink-0 w-32 sm:w-44 min-w-0 flex items-center gap-1">
          <h3 className="min-w-0 font-semibold text-text-primary truncate">{col.name}</h3>
          {col.starred && <Star size={14} className="shrink-0 text-accent fill-accent" aria-label="Starred" />}
          {col.read_only && <ReadOnlyMark />}
          {(col.locked || hidden) && <ProtectedMark hidden={hidden} />}
        </div>

        {col.description && !hidden
          ? <p className="text-text-secondary text-sm truncate flex-1 min-w-0">{col.description}</p>
          : <span className="flex-1 min-w-0" />}

        {(tags.length > 0 || tagInput) && (
          <div className={`${tagInput ? 'flex' : 'hidden md:flex'} items-center gap-1.5 shrink-0`}>
            {tags.slice(0, 3).map(tag => (
              <TagPill key={tag} tag={tag} active={activeTags.includes(tag)} onClick={onTagClick} onRemove={removeTag} />
            ))}
            {tagInput}
            <span className="text-text-muted text-xs">·</span>
          </div>
        )}

        <p className="text-text-muted text-xs shrink-0 whitespace-nowrap tabular-nums">{itemLabel}</p>

        {/* The check box sits where the menu is, as on the grid card. */}
        {selectMode
          ? <SelectCheck selected={selected} />
          : <ActionMenu label="Space actions" actions={menuActions} bordered={false} icon={MoreVertical} />}
      </div>
    )
  }

  // Grid card. With actions it's a plain card, a button only in select mode.
  const pressable = !actions || selectMode
  return (
    <div
      {...(actions ? {} : dragProps)}
      {...keyProps}
      onClick={pressable ? activate : undefined}
      onKeyDown={pressable ? handleKeyDown : undefined}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      aria-pressed={selectMode ? selected : undefined}
      aria-label={pressable ? ariaLabel : undefined}
      className={`group relative rounded-2xl p-3.5 bg-bg-card shadow-sm transition-all duration-200 animate-fade-in-up ${
        pressable ? 'cursor-pointer hover:shadow-md hover:bg-bg-elevated active:scale-[0.99]' : ''
      } ${selectedRing} ${dropRing} ${
        !selectMode && dragIndex === index ? 'opacity-40' : ''
      }`}
      style={{
        animationDelay: `${index * 50}ms`,
        borderTopWidth: colorPreset ? '2px' : undefined,
        borderTopColor: softColor,
      }}
    >
      {/* With actions, they wrap under the name on a narrow card. */}
      <div className={`flex items-start justify-between gap-2 ${actions ? 'flex-wrap' : ''}`}>
        <div className={`flex-1 ${actions ? 'min-w-[8rem]' : 'min-w-0'}`}>
          <div className="flex items-center gap-1.5">
            {col.pinned && <Pin size={14} className="shrink-0 text-accent fill-accent" />}
            <h3 className="min-w-0 font-semibold text-text-primary truncate">{col.name}</h3>
            {col.starred && <Star size={14} className="shrink-0 text-accent fill-accent" aria-label="Starred" />}
            {col.read_only && <ReadOnlyMark />}
            {(col.locked || hidden) && <ProtectedMark hidden={hidden} />}
          </div>
          {note && <p className="text-[11px] leading-4 text-text-muted">{note}</p>}
          {col.description && !hidden && !actions && (
            <p className="text-text-secondary text-sm mt-1 line-clamp-2 leading-relaxed">{col.description}</p>
          )}
        </div>
        {selectMode ? (
          <SelectCheck selected={selected} className="mt-0.5" />
        ) : actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
        ) : (
          <ActionMenu label="Space actions" actions={menuActions} bordered={false} icon={MoreVertical} />
        )}
      </div>
      {/* With actions (which may wrap under the name), the description goes below them. */}
      {col.description && !hidden && actions && (
        <p className="text-text-secondary text-sm mt-2 line-clamp-2 leading-relaxed">{col.description}</p>
      )}

      {/* Tags (all of them, as the card is where they're removed) and the
          item count, separated by a dot. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {tags.map(tag => (
          <TagPill key={tag} tag={tag} active={activeTags.includes(tag)} onClick={onTagClick} onRemove={removeTag} />
        ))}
        {tagInput}
        {(tags.length > 0 || tagInput) && <span className="text-text-muted text-xs">·</span>}
        <span className="text-text-muted text-xs tabular-nums">{itemLabel}</span>
      </div>
    </div>
  )
}
