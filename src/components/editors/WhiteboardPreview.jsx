/**
 * WhiteboardPreview.jsx - A Whiteboard on its card: the preview image saved
 * with the board, opening the board full screen when clicked.
 *
 * A board from before Excalidraw (the old Drawing) has no preview yet; it is
 * converted, with its preview, the first time its card shows, and saved
 * through `onUpgrade`.
 */
import { useEffect, useState } from 'react'
import { Loader2, Shapes } from 'lucide-react'
import { hasBoardContent, isLegacyBoard } from '../../lib/whiteboard/scene'

export function WhiteboardPreview({ content, onOpen, onUpgrade, readOnly = false }) {
  const legacy = isLegacyBoard(content)
  const [failed, setFailed] = useState(false)
  const upgrading = legacy && !readOnly && !!onUpgrade && !failed

  useEffect(() => {
    if (!upgrading) return undefined
    let cancelled = false
    import('../../lib/whiteboard/preview')
      .then(({ upgradeLegacyBoard }) => upgradeLegacyBoard(content))
      .then(next => { if (!cancelled) onUpgrade(next) })
      // Opening the board converts it too.
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [upgrading, content, onUpgrade])

  const preview = !legacy && typeof content?.preview === 'string' ? content.preview : null
  const empty = !hasBoardContent(content)

  return (
    <button
      type="button"
      onClick={onOpen}
      // Without onOpen (Archive, Bin) it's only a picture.
      disabled={!onOpen}
      aria-label={readOnly ? 'View whiteboard' : 'Open whiteboard'}
      className="group block w-full overflow-hidden rounded-xl border border-bg-border-soft bg-white transition-colors enabled:hover:border-accent-border"
    >
      {preview ? (
        <img src={preview} alt="" draggable={false} className="mx-auto max-h-[360px] w-full object-contain" />
      ) : (
        <span className="flex flex-col items-center justify-center gap-1.5 py-10 text-sm text-slate-500">
          {upgrading
            ? <Loader2 size={18} className="animate-spin" />
            : <Shapes size={18} />}
          {upgrading ? 'Updating whiteboard' : empty ? (readOnly ? 'Empty whiteboard' : 'Open to draw') : onOpen ? 'Open to view' : 'Whiteboard'}
        </span>
      )}
    </button>
  )
}
