/**
 * Content editors, one per space-item type. Each takes the current `content`
 * and calls `onChange(newContent)` on every keystroke so the parent can track
 * dirty state and auto-save. `readOnly` (a read-only space) keeps the content
 * readable and selectable but hides every editing control.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, CheckSquare, Square, GripVertical, Pencil, Eye } from 'lucide-react'
import MarkdownPreview from './MarkdownPreview'

/** Small icon-only delete button, visible only when the row is hovered. */
function DelBtn({ onClick, label = 'Delete item' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-text-muted hover:text-danger hover:bg-danger/10 transition-all shrink-0"
    >
      <Trash2 size={14} />
    </button>
  )
}

function ReorderBtn({ onDragStart, onDragEnd, onKeyDown }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      title="Drag to reorder. Use Arrow Up or Arrow Down while focused."
      aria-label="Reorder item"
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing p-1.5 rounded-full text-text-muted hover:text-accent hover:bg-accent-muted transition-all shrink-0"
    >
      <GripVertical size={14} />
    </button>
  )
}

/**
 * The Note type: an auto-expanding plain text area.
 *
 * @param {{ content: { text: string }, onChange: Function }} props
 */
export function TextboxEditor({ content, onChange, readOnly = false }) {
  const [text, setText] = useState(content?.text || '')
  const ref = useRef(null)

  const adjust = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Auto-resize whenever text changes
  useEffect(() => { adjust() }, [text])

  const handleChange = (e) => {
    const nextText = e.target.value
    setText(nextText)
    onChange({ text: nextText })
  }

  return (
    <div>
      <textarea
        ref={ref}
        value={text}
        onChange={handleChange}
        readOnly={readOnly}
        placeholder={readOnly ? 'Empty' : 'Start writing anything...'}
        rows={3}
        className="w-full bg-bg-sunken border border-bg-border/60 rounded-xl px-4 py-3 text-text-content placeholder-text-muted focus:outline-none transition-colors text-sm resize-none overflow-hidden leading-relaxed min-h-[80px]"
      />
    </div>
  )
}

/**
 * An old Markdown item, until it's converted to Rich text. Shows the rendered
 * preview; a click edits the raw text, and clicking outside previews again.
 *
 * @param {{ content: { text: string }, onChange: Function }} props
 */
export function MarkdownEditor({ content, onChange, readOnly = false }) {
  const [text, setText] = useState(content?.text || '')
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  const adjust = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Auto-resize whenever text changes or we enter edit mode
  useEffect(() => {
    if (editing) adjust()
  }, [text, editing])

  const handleChange = (e) => {
    const nextText = e.target.value
    setText(nextText)
    onChange({ text: nextText })
  }

  const enterEditMode = useCallback(() => {
    setEditing(true)
    // Focus the textarea after it renders
    setTimeout(() => ref.current?.focus(), 0)
  }, [])

  const exitEditMode = useCallback(() => {
    setEditing(false)
  }, [])

  if (editing) {
    return (
      <div className="relative">
        <textarea
          ref={ref}
          value={text}
          onChange={handleChange}
          onBlur={exitEditMode}
          placeholder="Write markdown here..."
          rows={3}
          className="w-full bg-bg-sunken border border-bg-border/60 rounded-xl px-4 pt-3 pb-8 text-text-content placeholder-text-muted focus:outline-none transition-colors text-sm resize-none overflow-hidden leading-relaxed min-h-[80px] font-mono"
        />
        {/* Same corner + style as the preview "Click to edit" hint - inside the
            card at bottom-right, only the text and icon change between modes. */}
        <div className="pointer-events-none absolute bottom-3 right-4 flex justify-end">
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Eye size={14} />
            Click outside to preview
          </span>
        </div>
      </div>
    )
  }

  // Read-only: the rendered preview only, with no way into edit mode.
  if (readOnly) {
    return (
      <div className="w-full bg-bg-sunken border border-bg-border/60 rounded-xl px-4 py-3 text-sm text-text-content leading-relaxed min-h-[80px] prose-custom">
        {text ? <MarkdownPreview text={text} /> : <span className="text-text-muted italic">Empty</span>}
      </div>
    )
  }

  // Preview mode
  return (
    <div
      onClick={enterEditMode}
      className="w-full bg-bg-sunken border border-bg-border/60 rounded-xl px-4 py-3 text-sm text-text-content leading-relaxed min-h-[80px] prose-custom cursor-text hover:border-accent/30 transition-colors group/md"
      title="Click to edit"
    >
      {text ? (
        <>
          <MarkdownPreview text={text} />
          <div className="flex justify-end mt-2 opacity-0 group-hover/md:opacity-100 transition-opacity">
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Pencil size={14} />
              Click to edit
            </span>
          </div>
        </>
      ) : (
        <span className="text-text-muted italic">Click to start writing markdown...</span>
      )}
    </div>
  )
}

// Shared by ChecklistEditor and ListItemsEditor.
function ListEditor({ content, onChange, variant, readOnly = false, onNumberedChange }) {
  const isChecklist = variant === 'checkbox'
  const isNumbered = variant === 'numbered'
  const inputAttr = isChecklist ? 'data-checklist-input' : 'data-menu-input'
  const [items, setItems] = useState(content?.items || [])
  const containerRef = useRef(null)
  const dragFromIndex = useRef(null)

  const adjustItemText = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Resize every textarea only when rows are added/removed. Edits resize their
  // own textarea inline (below), so there's no need to sweep the whole list -
  // via querySelectorAll - on every keystroke.
  useEffect(() => {
    const inputs = containerRef.current?.querySelectorAll(`[${inputAttr}]`)
    inputs?.forEach(adjustItemText)
  }, [items.length, inputAttr])

  const push = (newItems) => {
    setItems(newItems)
    onChange({ items: newItems })
  }

  const addItem = () => {
    const newItem = isChecklist
      ? { id: crypto.randomUUID(), text: '', checked: false }
      : { id: crypto.randomUUID(), text: '' }
    const nextItems = [...items, newItem]
    push(nextItems)

    setTimeout(() => {
      const inputs = containerRef.current?.querySelectorAll(`[${inputAttr}]`)
      inputs?.[inputs.length - 1]?.focus()
    }, 50)
  }

  const updateItem = (id, field, value) =>
    push(items.map(item => item.id === id ? { ...item, [field]: value } : item))

  const removeItem = (id) =>
    push(items.filter(item => item.id !== id))

  const moveItem = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length) return
    const nextItems = [...items]
    const [moved] = nextItems.splice(fromIndex, 1)
    nextItems.splice(toIndex, 0, moved)
    push(nextItems)
  }

  const handleDragStart = (e, idx) => {
    dragFromIndex.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', items[idx].id)
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    const fromIndex = dragFromIndex.current ?? items.findIndex(item => item.id === draggedId)
    dragFromIndex.current = null
    if (fromIndex === null || fromIndex === -1 || fromIndex === toIndex) return
    moveItem(fromIndex, toIndex)
  }

  const handleReorderKeyDown = (e, idx) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveItem(idx, idx - 1)
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveItem(idx, idx + 1)
    }
  }

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addItem() }
    if (e.key === 'Backspace' && items[idx].text === '' && items.length > 1) {
      e.preventDefault()
      push(items.filter((_, i) => i !== idx))
    }
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-start gap-2 group py-0.5"
          onDragOver={readOnly ? undefined : e => e.preventDefault()}
          onDrop={readOnly ? undefined : e => handleDrop(e, idx)}
        >
          {isChecklist ? (
            <button
              type="button"
              onClick={() => updateItem(item.id, 'checked', !item.checked)}
              disabled={readOnly}
              aria-label={item.checked ? 'Mark item as not done' : 'Mark item as done'}
              aria-pressed={item.checked}
              className={`shrink-0 mt-0.5 text-text-muted transition-colors ${readOnly ? 'cursor-default' : 'hover:text-accent'}`}
            >
              {item.checked
                ? <CheckSquare size={16} className="text-accent" />
                : <Square size={16} />}
            </button>
          ) : isNumbered ? (
            <span className="shrink-0 mt-1 min-w-[1.4rem] text-right text-sm font-medium text-text-muted tabular-nums select-none">
              {idx + 1}.
            </span>
          ) : (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-text-muted mt-2" />
          )}

          <textarea
            {...(isChecklist ? { 'data-checklist-input': true } : { 'data-menu-input': true })}
            value={item.text}
            onChange={e => {
              updateItem(item.id, 'text', e.target.value)
              adjustItemText(e.target)
            }}
            onKeyDown={readOnly ? undefined : e => handleKeyDown(e, idx)}
            readOnly={readOnly}
            placeholder={readOnly ? '' : isChecklist ? 'List item...' : 'Item...'}
            rows={1}
            className={`flex-1 min-w-0 bg-transparent text-sm leading-relaxed focus:outline-none placeholder-text-muted resize-none overflow-hidden whitespace-pre-wrap break-words ${
              isChecklist && item.checked ? 'line-through text-text-muted' : 'text-text-primary'
            }`}
          />

          {!readOnly && (
            <div className="flex shrink-0 items-center gap-0.5">
              <ReorderBtn
                onDragStart={e => handleDragStart(e, idx)}
                onDragEnd={() => { dragFromIndex.current = null }}
                onKeyDown={e => handleReorderKeyDown(e, idx)}
              />
              <DelBtn onClick={() => removeItem(item.id)} />
            </div>
          )}
        </div>
      ))}

      {readOnly ? (
        items.length === 0 && <p className="text-text-muted text-sm italic">Empty</p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <button
            onClick={addItem}
            className="flex items-center gap-2 text-text-muted hover:text-accent text-sm transition-colors py-1"
          >
            <Plus size={14} /> Add item
          </button>
          {onNumberedChange && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-secondary">
              <input
                type="checkbox"
                checked={isNumbered}
                onChange={e => onNumberedChange(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              />
              Numbered
            </label>
          )}
        </div>
      )}
    </div>
  )
}

export function ChecklistEditor(props) {
  return <ListEditor {...props} variant="checkbox" />
}

/**
 * The List type: bullets, or numbers when `numbered`. `onNumberedChange`
 * (omitted offline) shows the Numbered checkbox that switches between them.
 */
export function ListItemsEditor({ numbered = false, ...props }) {
  return <ListEditor {...props} variant={numbered ? 'numbered' : 'bullet'} />
}

/**
 * The Cards type: each card has a title and a description.
 *
 * @param {{ content: { items: Array }, onChange: Function }} props
 */
export function CardListEditor({ content, onChange, readOnly = false }) {
  const [items, setItems] = useState(content?.items || [])
  const dragFromIndex = useRef(null)

  const adjust = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const push = (newItems) => {
    setItems(newItems)
    onChange({ items: newItems })
  }

  const addItem = () =>
    push([...items, { id: crypto.randomUUID(), title: '', description: '' }])

  const updateItem = (id, field, value) =>
    push(items.map(item => item.id === id ? { ...item, [field]: value } : item))

  const removeItem = (id) =>
    push(items.filter(item => item.id !== id))

  const moveItem = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= items.length) return
    const nextItems = [...items]
    const [moved] = nextItems.splice(fromIndex, 1)
    nextItems.splice(toIndex, 0, moved)
    push(nextItems)
  }

  const handleDragStart = (e, idx) => {
    dragFromIndex.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', items[idx].id)
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')
    const fromIndex = dragFromIndex.current ?? items.findIndex(item => item.id === draggedId)
    dragFromIndex.current = null
    if (fromIndex === null || fromIndex === -1 || fromIndex === toIndex) return
    moveItem(fromIndex, toIndex)
  }

  const handleReorderKeyDown = (e, idx) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); moveItem(idx, idx - 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveItem(idx, idx + 1) }
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="group bg-bg-sunken border border-bg-border/60 rounded-xl p-3 space-y-2"
          onDragOver={readOnly ? undefined : e => e.preventDefault()}
          onDrop={readOnly ? undefined : e => handleDrop(e, idx)}
        >
          <div className="flex items-center gap-2">
            <input
              value={item.title}
              onChange={e => updateItem(item.id, 'title', e.target.value)}
              readOnly={readOnly}
              placeholder={readOnly ? '' : 'Title...'}
              className="flex-1 bg-transparent text-sm font-semibold focus:outline-none text-text-primary placeholder-text-muted"
            />
            {!readOnly && (
              <>
                <ReorderBtn
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragEnd={() => { dragFromIndex.current = null }}
                  onKeyDown={e => handleReorderKeyDown(e, idx)}
                />
                <DelBtn onClick={() => removeItem(item.id)} label="Delete card" />
              </>
            )}
          </div>

          <textarea
            ref={adjust}
            value={item.description}
            onChange={e => {
              updateItem(item.id, 'description', e.target.value)
              adjust(e.target)
            }}
            readOnly={readOnly}
            placeholder={readOnly ? '' : 'Description...'}
            rows={2}
            className="w-full bg-transparent text-sm text-text-secondary focus:outline-none placeholder-text-muted resize-none overflow-hidden leading-relaxed"
          />
        </div>
      ))}

      {readOnly ? (
        items.length === 0 && <p className="text-text-muted text-sm italic">Empty</p>
      ) : (
        <button
          onClick={addItem}
          className="flex items-center gap-2 text-text-muted hover:text-accent text-sm transition-colors py-1"
        >
          <Plus size={14} /> Add card
        </button>
      )}
    </div>
  )
}
