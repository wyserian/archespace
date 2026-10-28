import { describe, it, expect } from 'vitest'
import { defaultKanban, isKanbanContent, kanbanColumns, kanbanSearchText, kanbanToText } from './kanban'
import { itemToClipboardText } from './itemClipboard'

const board = {
  columns: [
    { id: 'a', title: 'To do', cards: [{ id: '1', title: 'Buy milk', description: '2 litres' }, { id: '2', title: 'Call Sam', description: '' }] },
    { id: 'b', title: 'Done', cards: [] },
  ],
}

describe('kanban', () => {
  it('starts with To do, In Progress and Done', () => {
    const { columns } = defaultKanban()
    expect(columns.map(c => c.title)).toEqual(['To do', 'In Progress', 'Done'])
    expect(new Set(columns.map(c => c.id)).size).toBe(3)
  })

  it('drops anything malformed', () => {
    const columns = kanbanColumns({ columns: [null, { title: 7, cards: [{ title: 'x' }, 'bad'] }] })
    expect(columns).toHaveLength(1)
    expect(columns[0]).toMatchObject({ title: '', color: null, cards: [{ title: 'x', description: '' }] })
    expect(kanbanColumns({ columns: [{ color: 'rose', cards: [] }, { color: 'neon', cards: [] }] }).map(c => c.color))
      .toEqual(['rose', null])
    expect(kanbanColumns(null)).toEqual([])
  })

  it('checks imported content', () => {
    expect(isKanbanContent(board)).toBe(true)
    expect(isKanbanContent({ columns: [{ title: 'x' }] })).toBe(false)
    expect(isKanbanContent({ items: [] })).toBe(false)
  })

  it('copies as text, column by column', () => {
    expect(kanbanToText(board)).toBe('To do\n- Buy milk: 2 litres\n- Call Sam\n\nDone')
    expect(itemToClipboardText({ type: 'kanban', content: board })).toBe(kanbanToText(board))
  })

  it('searches column titles, cards and descriptions', () => {
    expect(kanbanSearchText(board)).toEqual(['To do', 'Buy milk', '2 litres', 'Call Sam', '', 'Done'])
  })
})
