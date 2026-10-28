/**
 * KanbanEditor.jsx - The Kanban type: cards in stages (see lib/kanban.js;
 * stored as `columns`).
 *
 * Stages sit side by side and scroll sideways, under a compact Add stage
 * button. A card moves by dragging its handle, within a stage or to another;
 * with the handle focused, the arrow keys move it too (up / down within the
 * stage, left / right across). A stage's menu moves it, sets its colour, or
 * deletes it. Deleting a stage that holds cards, or a card with text, asks
 * first in a dialog.
 *
 * With `fill` (full screen) the stages share the width equally and take the
 * full height, each scrolling its own cards above a pinned Add card button.
 * `readOnly` keeps everything readable and hides the controls.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Ban, GripVertical, Plus, Trash2 } from 'lucide-react'
import { kanbanColumns } from '../../lib/kanban'
import { SPACE_COLORS, getColorPreset, softColorValue } from '../../lib/spaceColors'
import { ActionMenu } from '../ui/ActionMenu'
import { ConfirmDialog } from '../ui/UI'

/**
 * Grow a textarea to fit its text. A hidden one (an empty description) has no
 * height to measure, so it keeps its natural one-line height for when it
 * shows.
 */
function fit(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight ? `${el.scrollHeight}px` : ''
}

// A colour swatch as a menu icon, one per preset.
const SWATCHES = Object.fromEntries(SPACE_COLORS.map(c => [
  c.id,
  function Swatch({ className = '' }) {
    return <span className={`h-3 w-3 rounded-full ${className}`} style={{ backgroundColor: c.value }} />
  },
]))

export function KanbanEditor({ content, onChange, readOnly = false, fill = false }) {
  const [columns, setColumns] = useState(() => kanbanColumns(content))
  // The card being dragged, and where it would land.
  const [dragging, setDragging] = useState(null)
  const [dropAt, setDropAt] = useState(null) // { colId, index }
  // A stage or card whose delete is waiting for confirmation: { colId, cardId? }.
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Focus to restore after a card or column moves (keyboard moves).
  const refocus = useRef(null)
  const [focusCard, setFocusCard] = useState(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!refocus.current) return
    rootRef.current?.querySelector(refocus.current)?.focus()
    refocus.current = null
  })

  const push = (next) => {
    setColumns(next)
    onChange({ columns: next })
  }

  const updateColumn = (colId, patch) =>
    push(columns.map(col => (col.id === colId ? { ...col, ...patch } : col)))

  const updateCard = (colId, cardId, patch) =>
    push(columns.map(col => (col.id !== colId ? col : {
      ...col,
      cards: col.cards.map(card => (card.id === cardId ? { ...card, ...patch } : card)),
    })))

  /** Add a card to a column, at `index` (the end by default), and focus it. */
  const addCard = (colId, index) => {
    const card = { id: crypto.randomUUID(), title: '', description: '' }
    push(columns.map(col => {
      if (col.id !== colId) return col
      const cards = [...col.cards]
      cards.splice(index ?? cards.length, 0, card)
      return { ...col, cards }
    }))
    setFocusCard(card.id)
  }

  /** Delete a card; one with any text asks first. */
  const removeCard = (colId, cardId, confirmed = false) => {
    const card = columns.find(c => c.id === colId)?.cards.find(c => c.id === cardId)
    if (!card) return
    if ((card.title.trim() || card.description.trim()) && !confirmed) {
      setConfirmDelete({ colId, cardId })
      return
    }
    setConfirmDelete(null)
    push(columns.map(col => (col.id === colId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col)))
  }

  const addColumn = () => {
    const col = { id: crypto.randomUUID(), title: '', color: null, cards: [] }
    push([...columns, col])
    refocus.current = `[data-column-title="${col.id}"]`
  }

  /** Delete a stage; one that still holds cards asks first. */
  const removeColumn = (colId, confirmed = false) => {
    const col = columns.find(c => c.id === colId)
    if (!col) return
    if (col.cards.length > 0 && !confirmed) {
      setConfirmDelete({ colId })
      return
    }
    setConfirmDelete(null)
    push(columns.filter(c => c.id !== colId))
  }

  const moveColumn = (index, delta) => {
    const to = index + delta
    if (to < 0 || to >= columns.length) return
    const next = [...columns]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved)
    push(next)
  }

  /** Move a card to `toColId` at `toIndex` (its index before the move). */
  const moveCard = (cardId, toColId, toIndex) => {
    const from = columns.find(col => col.cards.some(c => c.id === cardId))
    if (!from) return
    const fromIndex = from.cards.findIndex(c => c.id === cardId)
    const card = from.cards[fromIndex]
    let index = toIndex
    if (from.id === toColId && fromIndex < toIndex) index -= 1
    if (from.id === toColId && fromIndex === index) return
    const without = columns.map(col => (col.id === from.id ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col))
    push(without.map(col => {
      if (col.id !== toColId) return col
      const cards = [...col.cards]
      cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card)
      return { ...col, cards }
    }))
  }

  const handleCardKey = (e, colIndex, cardIndex, cardId) => {
    const col = columns[colIndex]
    let target = null
    if (e.key === 'ArrowUp' && cardIndex > 0) target = [col.id, cardIndex - 1]
    if (e.key === 'ArrowDown' && cardIndex < col.cards.length - 1) target = [col.id, cardIndex + 2]
    if (e.key === 'ArrowLeft' && colIndex > 0) target = [columns[colIndex - 1].id, cardIndex]
    if (e.key === 'ArrowRight' && colIndex < columns.length - 1) target = [columns[colIndex + 1].id, cardIndex]
    if (!target) return
    e.preventDefault()
    moveCard(cardId, ...target)
    refocus.current = `[data-card-grip="${cardId}"]`
  }

  const onDragOver = (e, colId, index) => {
    if (!dragging) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dropAt?.colId !== colId || dropAt?.index !== index) setDropAt({ colId, index })
  }

  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragging && dropAt) moveCard(dragging, dropAt.colId, dropAt.index)
    setDragging(null)
    setDropAt(null)
  }

  const dropLine = <div className="h-0.5 shrink-0 rounded-full bg-accent" />

  const columnActions = (col, colIndex) => [
    colIndex > 0 && { id: 'left', label: 'Move left', icon: ArrowLeft, onClick: () => moveColumn(colIndex, -1) },
    colIndex < columns.length - 1 && { id: 'right', label: 'Move right', icon: ArrowRight, onClick: () => moveColumn(colIndex, 1) },
    { id: 'color-none', label: 'No color', icon: Ban, active: !col.color, onClick: () => updateColumn(col.id, { color: null }) },
    ...SPACE_COLORS.map(c => ({
      id: `color-${c.id}`,
      label: c.label,
      icon: SWATCHES[c.id],
      active: col.color === c.id,
      onClick: () => updateColumn(col.id, { color: c.id }),
    })),
    { id: 'delete', label: 'Delete stage', icon: Trash2, variant: 'danger', onClick: () => removeColumn(col.id) },
  ]

  const renderCard = (col, colIndex, card, cardIndex) => (
    <div key={card.id} className="flex flex-col gap-2">
      {dropAt?.colId === col.id && dropAt.index === cardIndex && dropLine}
      <div
        className={`group/card relative rounded-lg border border-bg-border bg-bg-card p-2 ${dragging === card.id ? 'opacity-50' : ''}`}
        onDragOver={readOnly ? undefined : e => {
          // The top half drops before this card, the bottom half after.
          const box = e.currentTarget.getBoundingClientRect()
          onDragOver(e, col.id, e.clientY < box.top + box.height / 2 ? cardIndex : cardIndex + 1)
        }}
        onDrop={readOnly ? undefined : onDrop}
        // A click anywhere on the card edits it (showing an empty description).
        onClick={readOnly ? undefined : e => {
          if (e.target.closest('textarea, button')) return
          e.currentTarget.querySelector('[data-card-title]')?.focus()
        }}
      >
        <div className="flex items-start gap-1">
          {!readOnly && (
            <button
              type="button"
              draggable
              data-card-grip={card.id}
              onDragStart={e => {
                setDragging(card.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', card.title)
              }}
              onDragEnd={() => { setDragging(null); setDropAt(null) }}
              onKeyDown={e => handleCardKey(e, colIndex, cardIndex, card.id)}
              aria-label="Move card. Arrow keys move it up, down, or to the next stage."
              title="Drag to move. Arrow keys move it while focused."
              className="-ml-1 mt-0.5 p-0.5 rounded text-text-muted cursor-grab active:cursor-grabbing hover:text-accent opacity-40 group-hover/card:opacity-100 focus:opacity-100"
            >
              <GripVertical size={14} />
            </button>
          )}
          <textarea
            ref={el => {
              fit(el)
              if (el && focusCard === card.id) { el.focus(); setFocusCard(null) }
            }}
            data-card-title={card.id}
            value={card.title}
            rows={1}
            onChange={e => { updateCard(col.id, card.id, { title: e.target.value }); fit(e.target) }}
            // Enter adds the next card below; Shift+Enter starts a new line.
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey || readOnly) return
              e.preventDefault()
              addCard(col.id, cardIndex + 1)
            }}
            readOnly={readOnly}
            placeholder={readOnly ? 'Untitled' : 'Card'}
            aria-label="Card"
            className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-sm font-medium leading-snug text-text-primary placeholder-text-muted focus:outline-none ${readOnly ? '' : 'pr-5'}`}
          />
        </div>
        {/* The description shows when it's set, or while the card is being edited. */}
        <textarea
          ref={fit}
          value={card.description}
          rows={1}
          onChange={e => { updateCard(col.id, card.id, { description: e.target.value }); fit(e.target) }}
          readOnly={readOnly}
          placeholder="Add description"
          aria-label="Card description"
          className={`${card.description ? '' : readOnly ? 'hidden' : 'hidden group-focus-within/card:block'} mt-1 w-full resize-none overflow-hidden bg-transparent text-xs leading-relaxed text-text-secondary placeholder-text-muted focus:outline-none ${readOnly ? '' : 'pl-5'}`}
        />
        {/* After the description, so Tab goes title, description, then delete. */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => removeCard(col.id, card.id)}
            aria-label="Delete card"
            title="Delete card"
            className="absolute right-1.5 top-2 p-0.5 rounded text-text-muted hover:text-danger opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )

  const renderColumn = (col, colIndex) => {
    const color = getColorPreset(col.color)?.value
    return (
      <section
        key={col.id}
        aria-label={col.title || 'Untitled stage'}
        // A faint tint sets the stage apart; a colour tints it and adds a thin,
        // soft strip along the top, like a space card's.
        style={color ? { backgroundColor: `${color}14`, boxShadow: `inset 0 2px 0 ${softColorValue(col.color, '80')}` } : undefined}
        className={`flex flex-col rounded-xl px-2 pb-2 ${color ? 'pt-3' : 'bg-text-primary/[0.04] pt-2'} ${
          fill ? 'h-full min-h-0 min-w-[220px] flex-1 basis-0' : 'w-60 shrink-0'
        }`}
        onDragOver={readOnly ? undefined : e => onDragOver(e, col.id, col.cards.length)}
        onDrop={readOnly ? undefined : onDrop}
      >
        <div className="flex shrink-0 items-center gap-1.5 pb-2 pl-1">
          <input
            data-column-title={col.id}
            value={col.title}
            onChange={e => updateColumn(col.id, { title: e.target.value })}
            readOnly={readOnly}
            placeholder={readOnly ? 'Untitled' : 'Stage name'}
            aria-label="Stage name"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-primary placeholder-text-muted focus:outline-none"
          />
          <span
            className="shrink-0 rounded-full bg-bg-elevated px-1.5 text-[11px] font-medium tabular-nums leading-5 text-text-muted"
            aria-label={`${col.cards.length} ${col.cards.length === 1 ? 'card' : 'cards'}`}
          >
            {col.cards.length}
          </span>
          {!readOnly && (
            <ActionMenu
              label="Stage actions"
              bordered={false}
              compact
              actions={columnActions(col, colIndex)}
            />
          )}
        </div>

        <div className={`flex flex-col gap-2 ${fill ? 'min-h-0 flex-1 overflow-y-auto scrollbar-slim pr-0.5' : ''}`}>
          {col.cards.map((card, cardIndex) => renderCard(col, colIndex, card, cardIndex))}
          {dropAt?.colId === col.id && dropAt.index === col.cards.length && dropLine}
          {fill && <div className="min-h-4 flex-1" />}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => addCard(col.id)}
            className="mt-2 flex shrink-0 self-start items-center gap-2 px-1 py-1 text-sm text-text-muted hover:text-accent transition-colors"
          >
            <Plus size={14} /> Add card
          </button>
        )}
      </section>
    )
  }

  // Rendered at the page's top level (above a full-screen item), like the
  // reminder dialog.
  const deleteDialog = ({ colId, cardId }) => {
    const col = columns.find(c => c.id === colId)
    if (!col) return null
    const count = col.cards.length
    return createPortal(
      <div className="relative z-[90]">
        <ConfirmDialog
          title={cardId ? 'Delete this card?' : 'Delete this stage?'}
          message={cardId
            ? 'Its title and description will be removed.'
            : `"${col.title || 'Untitled'}" and its ${count} ${count === 1 ? 'card' : 'cards'} will be removed.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => (cardId ? removeCard(colId, cardId, true) : removeColumn(colId, true))}
          onClose={() => setConfirmDelete(null)}
        />
      </div>,
      document.body,
    )
  }

  return (
    <div ref={rootRef} className={`flex flex-col gap-1.5 ${fill ? 'h-full min-h-0' : ''}`}>
      {!readOnly && (
        <div className="mt-1 flex shrink-0 justify-end">
          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-2 px-1 py-1 text-sm text-text-muted hover:text-accent transition-colors"
          >
            <Plus size={14} /> Add stage
          </button>
        </div>
      )}
      <div className={`flex items-start gap-3 overflow-x-auto pb-1 scrollbar-slim ${fill ? 'min-h-0 flex-1 items-stretch' : ''}`}>
        {columns.map(renderColumn)}
        {readOnly && columns.length === 0 && <p className="text-text-muted text-sm italic">Empty</p>}
      </div>
      {confirmDelete && deleteDialog(confirmDelete)}
    </div>
  )
}
