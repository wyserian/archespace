/**
 * SpaceCard.jsx - A single space on the dashboard.
 *
 * `layout="grid"` (default) renders the full card; `layout="list"` renders a
 * compact full-width row. Both share the same navigate / select / drag /
 * action-menu behaviour: borderless cards, a soft space-colour strip, tags
 * coloured by name inline with the item count, and a 3-dot menu.
 */
import { Pin, PinOff, Star, StarOff, Pencil, PencilOff, PencilLine, Trash2, Copy, MoveRight, Archive, MoreVertical, Shield, ShieldCheck, ShieldOff } from 'lucide-react'
import { getColorPreset, softColorValue, tagColorValue } from '../../lib/spaceColors'
import { ActionMenu } from '../ui/ActionMenu'
import { SelectCheck } from '../ui/SelectCheck'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useToast } from '../../context/ToastCore'
import { useVaultPinPrompt } from '../../context/VaultPinPromptCore'
import { useItemRevealed, useSpaceHidden } from '../../lib/itemLock'

/** A tag chip tinted by the tag's own stable colour; brighter when it's an
 * active filter. Consumes its own click so it filters instead of opening. */
function TagPill({ tag, active, onClick }) {
  const color = tagColorValue(tag)
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(tag) }}
      aria-pressed={active}
      className="text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors"
      style={{
        backgroundColor: `${color}${active ? '42' : '29'}`,
        color,
        borderColor: active ? `${color}8c` : 'transparent',
      }}
    >
      {tag}
    </button>
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
  navigate, togglePin, toggleStar, toggleReadOnly, toggleLock, setModal, setDeleteConfirm, onDuplicate, onMove, onArchive,
  stats,
  onTagClick,
  activeTags = [],
  layout = 'grid',
  selectMode = false,
  selected = false,
  onToggleSelect,
  reorderDisabled = false,
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
  const colorPreset = getColorPreset(col.color)
  // Softer, thinner space-colour strip (~50% alpha) than the picker's vivid value.
  const softColor = softColorValue(col.color, '80')
  const itemStats = stats?.[col.id]
  const itemLabel = itemStats
    ? `${itemStats.total} ${itemStats.total === 1 ? 'item' : 'items'}`
    : '0 items'
  const tags = Array.isArray(col.tags) ? col.tags : []

  const activate = () => (selectMode ? onToggleSelect?.() : navigate(`/space/${col.id}`))

  // Only act when the row/card itself is focused, so Enter/Space on a nested
  // control (the ActionMenu button) doesn't also navigate.
  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  // Every space action writes to the server, so all are disabled offline.
  const menuActions = [
    {
      id: 'pin',
      label: col.pinned ? 'Unpin' : 'Pin',
      icon: col.pinned ? PinOff : Pin,
      active: col.pinned,
      disabled: !online,
      onClick: () => togglePin.mutate({ id: col.id, pinned: col.pinned }),
    },
    // Starring never moves the space; it adds it to the Starred view.
    toggleStar && {
      id: 'star',
      label: col.starred ? 'Unstar' : 'Star',
      icon: col.starred ? StarOff : Star,
      active: col.starred,
      disabled: !online,
      onClick: () => toggleStar.mutate({ id: col.id, starred: col.starred }),
    },
    // Read-only locks the space's content (its details and items); managing
    // the space itself (pin, duplicate, archive, delete) stays available.
    toggleReadOnly && {
      id: 'read-only',
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
      label: col.locked ? 'Remove protection' : 'Protect',
      icon: col.locked ? ShieldOff : Shield,
      disabled: !online,
      onClick: handleToggleLock,
    },
    // Editing shows the description, so a hidden protected space opens first.
    !col.read_only && !hidden && { id: 'edit', label: 'Edit', icon: Pencil, disabled: !online, onClick: () => setModal({ type: 'edit', col }) },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, disabled: !online, onClick: () => onDuplicate?.(col.id) },
    // A read-only space stays where it is; a hidden one opens first (moving it
    // out of a protected space would show it without the PIN).
    onMove && !col.read_only && !hidden && { id: 'move', label: 'Move', icon: MoveRight, disabled: !online, onClick: () => onMove(col.id) },
    { id: 'archive', label: 'Archive', icon: Archive, disabled: !online, onClick: () => onArchive?.(col.id) },
    { id: 'delete', label: 'Delete', icon: Trash2, variant: 'danger', disabled: !online, onClick: () => setDeleteConfirm(col.id) },
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

  // Borderless: the card is set off by its surface plus a soft shadow; only a
  // selected card in select mode gets a soft accent ring.
  const selectedRing = selected ? 'ring-[1.5px] ring-accent-border' : ''

  // List row
  if (layout === 'list') {
    return (
      <div
        {...dragProps}
        onClick={activate}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-pressed={selectMode ? selected : undefined}
        aria-label={ariaLabel}
        className={`group relative flex items-center gap-3 sm:gap-4 rounded-xl pl-4 pr-3 py-3 cursor-pointer transition-all animate-fade-in-up bg-bg-card shadow-sm hover:shadow-md hover:bg-bg-elevated active:scale-[0.99] ${selectedRing} ${!selectMode && dragIndex === index ? 'opacity-40' : ''}`}
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

        {tags.length > 0 && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {tags.slice(0, 3).map(tag => (
              <TagPill key={tag} tag={tag} active={activeTags.includes(tag)} onClick={onTagClick} />
            ))}
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

  // Grid card
  return (
    <div
      {...dragProps}
      onClick={activate}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      aria-label={ariaLabel}
      className={`group relative rounded-2xl p-3.5 cursor-pointer bg-bg-card shadow-sm hover:shadow-md hover:bg-bg-elevated active:scale-[0.99] transition-all duration-200 animate-fade-in-up ${selectedRing} ${
        !selectMode && dragOverIndex === index && dragIndex !== index ? 'ring-2 ring-accent' : ''
      } ${!selectMode && dragIndex === index ? 'opacity-40' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
        borderTopWidth: colorPreset ? '2px' : undefined,
        borderTopColor: softColor,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {col.pinned && <Pin size={14} className="shrink-0 text-accent fill-accent" />}
            <h3 className="min-w-0 font-semibold text-text-primary truncate">{col.name}</h3>
            {col.starred && <Star size={14} className="shrink-0 text-accent fill-accent" aria-label="Starred" />}
            {col.read_only && <ReadOnlyMark />}
            {(col.locked || hidden) && <ProtectedMark hidden={hidden} />}
          </div>
          {col.description && !hidden && (
            <p className="text-text-secondary text-sm mt-1 line-clamp-2 leading-relaxed">{col.description}</p>
          )}
        </div>
        {selectMode ? (
          <SelectCheck selected={selected} className="mt-0.5" />
        ) : (
          <ActionMenu label="Space actions" actions={menuActions} bordered={false} icon={MoreVertical} />
        )}
      </div>

      {/* Tags and item count on one line, separated by a dot. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {tags.slice(0, 4).map(tag => (
          <TagPill key={tag} tag={tag} active={activeTags.includes(tag)} onClick={onTagClick} />
        ))}
        {tags.length > 0 && <span className="text-text-muted text-xs">·</span>}
        <span className="text-text-muted text-xs tabular-nums">{itemLabel}</span>
      </div>
    </div>
  )
}
