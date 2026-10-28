/**
 * kanban.js - The Kanban item type: cards in columns.
 *
 * Content: { columns: [{ id, title, color, cards: [{ id, title, description }] }] }
 * `color` is a space colour preset id (spaceColors.js), or null for none.
 * Encrypted like any item's content.
 */
import { getColorPreset } from './spaceColors'

/** A new Kanban's columns. */
export function defaultKanban() {
  return {
    columns: ['To do', 'In Progress', 'Done'].map(title => ({ id: crypto.randomUUID(), title, color: null, cards: [] })),
  }
}

/** The columns, made safe to render (anything malformed is dropped). */
export function kanbanColumns(content) {
  const columns = Array.isArray(content?.columns) ? content.columns : []
  return columns
    .filter(col => col && typeof col === 'object')
    .map(col => ({
      id: typeof col.id === 'string' ? col.id : crypto.randomUUID(),
      title: typeof col.title === 'string' ? col.title : '',
      color: getColorPreset(col.color) ? col.color : null,
      cards: (Array.isArray(col.cards) ? col.cards : [])
        .filter(card => card && typeof card === 'object')
        .map(card => ({
          id: typeof card.id === 'string' ? card.id : crypto.randomUUID(),
          title: typeof card.title === 'string' ? card.title : '',
          description: typeof card.description === 'string' ? card.description : '',
        })),
    }))
}

/** Whether a Kanban's content has the expected shape (for imports). */
export function isKanbanContent(content) {
  return Array.isArray(content?.columns) &&
    content.columns.length <= 50 &&
    content.columns.every(col => col && typeof col === 'object' && Array.isArray(col.cards) && col.cards.length <= 1000)
}

/** Plain text: each column's title, then its cards ("- title: description"). */
export function kanbanToText(content) {
  return kanbanColumns(content)
    .map(col => [
      col.title || 'Untitled',
      ...col.cards.map(card => `- ${[card.title, card.description].filter(s => s.trim()).join(': ')}`),
    ].join('\n'))
    .join('\n\n')
}

/** Every title and description, for search. */
export function kanbanSearchText(content) {
  return kanbanColumns(content).flatMap(col => [col.title, ...col.cards.flatMap(card => [card.title, card.description])])
}
