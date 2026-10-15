/**
 * Grid editor for the "table" item type. Content is a header row plus data rows
 * of plain-text cells: { columns: ["Name","Qty"], rows: [["Apples","3"], ...] };
 * every row stays the width of the header. Columns share the width equally and
 * the grid scrolls sideways when they don't fit.
 *
 * Each row (at its end) and column (in its header) has a grip: drag it to move
 * the row or column, or click it to insert, move or delete. A "+" on the line
 * between two rows or columns inserts one there.
 */
import { useState } from 'react'
import {
  Plus, GripVertical, GripHorizontal, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2,
  BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart, BetweenVerticalEnd,
} from 'lucide-react'
import { ActionMenu } from '../ui/ActionMenu'

const MIN_COLUMN_WIDTH = 96
// The column after the grid: add-column in the header, row grips below it.
const END_COLUMN_WIDTH = 28

// Keep at least a 1x1 grid so the editor always has something to show.
function normalise(content) {
  const columns = Array.isArray(content?.columns) && content.columns.length ? content.columns : ['']
  const rawRows = Array.isArray(content?.rows) && content.rows.length ? content.rows : [['']]
  // Pad/trim every row to the column count so the grid stays rectangular.
  const rows = rawRows.map(row => {
    const cells = Array.isArray(row) ? row.slice(0, columns.length) : []
    while (cells.length < columns.length) cells.push('')
    return cells
  })
  return { columns, rows }
}

const insertAt = (list, at, value) => [...list.slice(0, at), value, ...list.slice(at)]

function moveTo(list, from, to) {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * A "+" on the line before a row (`side="top"`) or column (`side="left"`),
 * faint while its row or column is hovered.
 */
function InsertButton({ side, label, onClick }) {
  const place = side === 'top'
    ? '-top-2 left-1/2 -translate-x-1/2'
    : '-left-2 top-1/2 -translate-y-1/2'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute z-10 ${place} flex h-4 w-4 items-center justify-center rounded-full bg-accent text-bg-base opacity-0 group-hover:opacity-50 hover:!opacity-100 focus:opacity-100 transition-opacity`}
    >
      <Plus size={11} strokeWidth={3} />
    </button>
  )
}

export function TableEditor({ content, onChange, readOnly = false }) {
  const [state, setState] = useState(() => normalise(content))
  const { columns, rows } = state
  // The row or column being dragged by its grip, and where it would land.
  const [drag, setDrag] = useState(null) // { kind: 'row' | 'column', from, over }

  const push = (next) => {
    setState(next)
    onChange(next)
  }

  const setHeader = (c, value) =>
    push({ columns: columns.map((col, i) => (i === c ? value : col)), rows })

  const setCell = (r, c, value) =>
    push({
      columns,
      rows: rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)),
    })

  const insertColumn = (at) =>
    push({ columns: insertAt(columns, at, ''), rows: rows.map(row => insertAt(row, at, '')) })

  const removeColumn = (c) => {
    if (columns.length <= 1) return
    push({
      columns: columns.filter((_, i) => i !== c),
      rows: rows.map(row => row.filter((_, j) => j !== c)),
    })
  }

  const moveColumn = (from, to) => {
    if (from === to || to < 0 || to >= columns.length) return
    push({ columns: moveTo(columns, from, to), rows: rows.map(row => moveTo(row, from, to)) })
  }

  const insertRow = (at) => push({ columns, rows: insertAt(rows, at, columns.map(() => '')) })

  const removeRow = (r) => {
    if (rows.length <= 1) return
    push({ columns, rows: rows.filter((_, i) => i !== r) })
  }

  const moveRow = (from, to) => {
    if (from === to || to < 0 || to >= rows.length) return
    push({ columns, rows: moveTo(rows, from, to) })
  }

  // Dragging a grip. The events stop here so the item card around the table
  // doesn't take them for a card being reordered.
  const gripDragProps = (kind, index) => ({
    draggable: true,
    onDragStart: (e) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', `${kind}:${index}`)
      setDrag({ kind, from: index, over: index })
    },
    onDragEnd: () => setDrag(null),
  })
  const dropProps = (kind, index) => ({
    onDragOver: (e) => {
      if (drag?.kind !== kind) return
      e.preventDefault()
      e.stopPropagation()
      if (drag.over !== index) setDrag({ ...drag, over: index })
    },
    onDrop: (e) => {
      if (drag?.kind !== kind) return
      e.preventDefault()
      e.stopPropagation()
      ;(kind === 'row' ? moveRow : moveColumn)(drag.from, drag.over)
      setDrag(null)
    },
  })
  // The dragged row or column fades; the one it would take the place of is tinted.
  const dragTint = (kind, index) => {
    if (drag?.kind !== kind) return ''
    if (index === drag.from) return 'opacity-40'
    return index === drag.over ? 'bg-accent-muted' : ''
  }

  const rowActions = (r) => [
    { id: 'above', label: 'Insert above', icon: BetweenHorizontalStart, onClick: () => insertRow(r) },
    { id: 'below', label: 'Insert below', icon: BetweenHorizontalEnd, onClick: () => insertRow(r + 1) },
    { id: 'up', label: 'Move up', icon: ArrowUp, disabled: r === 0, onClick: () => moveRow(r, r - 1) },
    { id: 'down', label: 'Move down', icon: ArrowDown, disabled: r === rows.length - 1, onClick: () => moveRow(r, r + 1) },
    { id: 'delete', label: 'Delete row', icon: Trash2, variant: 'danger', disabled: rows.length <= 1, onClick: () => removeRow(r) },
  ]

  const columnActions = (c) => [
    { id: 'left', label: 'Insert left', icon: BetweenVerticalStart, onClick: () => insertColumn(c) },
    { id: 'right', label: 'Insert right', icon: BetweenVerticalEnd, onClick: () => insertColumn(c + 1) },
    { id: 'move-left', label: 'Move left', icon: ArrowLeft, disabled: c === 0, onClick: () => moveColumn(c, c - 1) },
    { id: 'move-right', label: 'Move right', icon: ArrowRight, disabled: c === columns.length - 1, onClick: () => moveColumn(c, c + 1) },
    { id: 'delete', label: 'Delete column', icon: Trash2, variant: 'danger', disabled: columns.length <= 1, onClick: () => removeColumn(c) },
  ]

  const cellClass =
    'w-full min-w-0 bg-transparent px-2 py-1 text-[13px] leading-5 text-text-primary placeholder-text-muted focus:outline-none focus:bg-accent-muted transition-colors'
  // Grips show while their row or column is hovered (or focused).
  const gripClass = 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'
  const minWidth = columns.length * MIN_COLUMN_WIDTH + (readOnly ? 0 : END_COLUMN_WIDTH)

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-lg border border-bg-border/60">
        <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
          <colgroup>
            {columns.map((_, c) => <col key={c} />)}
            {!readOnly && <col style={{ width: END_COLUMN_WIDTH }} />}
          </colgroup>
          <thead>
            <tr>
              {columns.map((col, c) => (
                <th
                  key={c}
                  {...(readOnly ? {} : dropProps('column', c))}
                  className={`group relative border-b border-r last:border-r-0 border-bg-border/60 bg-bg-elevated p-0 align-middle ${dragTint('column', c)}`}
                >
                  {!readOnly && c > 0 && (
                    <InsertButton side="left" label="Insert column here" onClick={() => insertColumn(c)} />
                  )}
                  <div className="flex items-center">
                    <input
                      value={col}
                      onChange={e => setHeader(c, e.target.value)}
                      readOnly={readOnly}
                      placeholder={readOnly ? '' : `Column ${c + 1}`}
                      aria-label={`Column ${c + 1} header`}
                      className={`${cellClass} font-semibold`}
                    />
                    {!readOnly && (
                      <span className={`shrink-0 ${gripClass}`}>
                        <ActionMenu
                          label={`Column ${c + 1}: drag to move, or click for options`}
                          icon={GripHorizontal}
                          actions={columnActions(c)}
                          bordered={false}
                          compact
                          openOnHover={false}
                          triggerProps={gripDragProps('column', c)}
                        />
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {!readOnly && (
                <th className="border-b border-l border-bg-border/60 bg-bg-elevated p-0">
                  <button
                    type="button"
                    onClick={() => insertColumn(columns.length)}
                    aria-label="Add column"
                    title="Add column"
                    className="flex h-full w-full items-center justify-center py-1.5 text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr
                key={r}
                {...(readOnly ? {} : dropProps('row', r))}
                className={`group ${dragTint('row', r)}`}
              >
                {row.map((cell, c) => (
                  <td
                    key={c}
                    {...(readOnly ? {} : dropProps('column', c))}
                    className={`border-b border-r last:border-r-0 border-bg-border/60 p-0 align-top ${dragTint('column', c)}`}
                  >
                    <input
                      value={cell}
                      onChange={e => setCell(r, c, e.target.value)}
                      readOnly={readOnly}
                      aria-label={`Row ${r + 1} column ${c + 1}`}
                      className={cellClass}
                    />
                  </td>
                ))}
                {!readOnly && (
                  <td className="relative border-b border-l border-bg-border/60 p-0 align-middle">
                    <InsertButton side="top" label="Insert row here" onClick={() => insertRow(r)} />
                    <span className={`flex justify-center ${gripClass}`}>
                      <ActionMenu
                        label={`Row ${r + 1}: drag to move, or click for options`}
                        icon={GripVertical}
                        actions={rowActions(r)}
                        bordered={false}
                        compact
                        openOnHover={false}
                        triggerProps={gripDragProps('row', r)}
                      />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={() => insertRow(rows.length)}
          className="flex items-center gap-1.5 text-text-muted hover:text-accent text-[13px] transition-colors py-0.5"
        >
          <Plus size={13} /> Add row
        </button>
      )}
    </div>
  )
}
