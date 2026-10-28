import { AlignLeft, CheckSquare, List, ListOrdered, LayoutList, Type, Code, Shapes, Table, SquareKanban } from 'lucide-react'

/** Human-readable labels for each item type */
export const TYPE_LABELS = {
  textbox: 'Note',
  richtext: 'Rich text',
  // Old Markdown notes, shown as Rich text until they're converted.
  markdown: 'Rich text',
  menu_list: 'List',
  // One List type shown to people: numbered_list is a List with numbers on.
  numbered_list: 'List',
  checkbox_list: 'Checklist',
  card_list: 'Cards',
  table: 'Table',
  kanban: 'Kanban',
  whiteboard: 'Whiteboard',
  code: 'Code',
}

/** Icon per item type (used on item cards). */
export const TYPE_ICONS = {
  textbox: AlignLeft,
  richtext: Type,
  markdown: Type,
  menu_list: List,
  numbered_list: ListOrdered,
  checkbox_list: CheckSquare,
  card_list: LayoutList,
  table: Table,
  kanban: SquareKanban,
  whiteboard: Shapes,
  code: Code,
}

/** Colour scheme per item type (text, background, border) */
export const TYPE_STYLES = {
  textbox: { text: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  richtext: { text: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' },
  markdown: { text: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' },
  menu_list: { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  numbered_list: { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  checkbox_list: { text: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  card_list: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  table: { text: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/20' },
  kanban: { text: 'text-teal-400', bg: 'bg-teal-400/10', border: 'border-teal-400/20' },
  whiteboard: { text: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10', border: 'border-fuchsia-400/20' },
  code: { text: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
}

/** Item type definitions for the "Add item" modal */
export const ITEM_TYPE_OPTIONS = [
  { type: 'textbox', label: 'Note', desc: 'Free-form plain text', icon: AlignLeft, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { type: 'richtext', label: 'Rich text', desc: 'Headings, lists, tasks, tables, links and more', icon: Type, color: 'text-rose-400', bg: 'bg-rose-400/10' },
  { type: 'menu_list', label: 'List', desc: 'Bullet or numbered list', icon: List, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { type: 'checkbox_list', label: 'Checklist', desc: 'Items with checkboxes', icon: CheckSquare, color: 'text-green-400', bg: 'bg-green-400/10' },
  { type: 'card_list', label: 'Cards', desc: 'Title + description pairs', icon: LayoutList, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  { type: 'table', label: 'Table', desc: 'Rows and columns of text', icon: Table, color: 'text-sky-400', bg: 'bg-sky-400/10' },
  { type: 'kanban', label: 'Kanban', desc: 'Cards in stages, from to do to done', icon: SquareKanban, color: 'text-teal-400', bg: 'bg-teal-400/10' },
  { type: 'whiteboard', label: 'Whiteboard', desc: 'Shapes, arrows, text and sketches', icon: Shapes, color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10' },
  { type: 'code', label: 'Code', desc: 'Code snippet with syntax highlighting', icon: Code, color: 'text-orange-400', bg: 'bg-orange-400/10' },
]
