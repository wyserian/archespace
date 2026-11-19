/**
 * UndoRedoButtons.jsx - Undo and redo of item content edits (a useItemBoard
 * board), for a page's tools row.
 */
import { Undo2, Redo2 } from 'lucide-react'
import { IconButton } from './ui/Button'

export function UndoRedoButtons({ board }) {
  return (
    <span className="flex items-center">
      <IconButton icon={Undo2} label="Undo item edit" disabled={!board.canUndo} onClick={board.undo} />
      <IconButton icon={Redo2} label="Redo item edit" disabled={!board.canRedo} onClick={board.redo} />
    </span>
  )
}
