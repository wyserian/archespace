/**
 * scene.js - The Whiteboard item's content, shared by the web editor, the
 * mobile app's WebView editor (built from this repo) and PDF export.
 *
 * A board is an Excalidraw scene, saved as `{ elements, files, background,
 * preview }`: the elements (deleted ones dropped), the images they use, the
 * canvas colour, and a PNG data URL of the board made on each save, so cards
 * and PDFs show it without loading Excalidraw.
 *
 * Boards made before Excalidraw (`{ strokes, orientation }`, the old Drawing
 * type) convert when they open: each stroke becomes a freehand element.
 */

const DEFAULT_BACKGROUND = '#ffffff'

// An old stroke was a perfect-freehand outline `size` wide; Excalidraw draws a
// freehand element 4.25 times its strokeWidth wide.
const FREEDRAW_SIZE_PER_WIDTH = 4.25

/** A board saved before Excalidraw: freehand strokes only. */
export function isLegacyBoard(content) {
  return !Array.isArray(content?.elements) && Array.isArray(content?.strokes)
}

/** Whether the board has anything on it. */
export function hasBoardContent(content) {
  if (isLegacyBoard(content)) return content.strokes.length > 0
  return (content?.elements || []).some(e => !e?.isDeleted)
}

/** The scene to open: `{ elements, files, background }`. */
export function boardScene(content) {
  if (isLegacyBoard(content)) {
    return {
      elements: content.strokes.map(strokeToElement).filter(Boolean),
      files: {},
      background: DEFAULT_BACKGROUND,
    }
  }
  const files = content?.files
  return {
    elements: Array.isArray(content?.elements) ? content.elements : [],
    files: files && typeof files === 'object' && !Array.isArray(files) ? files : {},
    background: typeof content?.background === 'string' ? content.background : DEFAULT_BACKGROUND,
  }
}

/**
 * The content to save: the live elements, only the images they still use,
 * the background, and the preview (none for an empty board).
 */
export function toBoardContent(elements, files, background, preview) {
  const live = elements.filter(e => !e.isDeleted)
  const used = new Set(live.map(e => e.fileId).filter(Boolean))
  return {
    elements: live,
    files: Object.fromEntries(Object.entries(files || {}).filter(([id]) => used.has(id))),
    background,
    preview: live.length ? preview || null : null,
  }
}

/**
 * Changes whenever the drawing does (every edit bumps an element's version),
 * but not when only the view or selection moves.
 */
export function sceneKey(elements, files, background) {
  let versions = 0
  for (const e of elements) versions += e.version || 0
  return `${elements.length}:${versions}:${background}:${Object.keys(files || {}).length}`
}

/** An old stroke as an Excalidraw freehand element (null if unusable). */
function strokeToElement(stroke, index) {
  const points = (stroke?.points || []).filter(
    p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
  )
  if (points.length < 2) return null
  const [x0, y0] = points[0]
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  return {
    type: 'freedraw',
    id: `legacy-stroke-${index}`,
    x: x0,
    y: y0,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: points.map(([x, y]) => [x - x0, y - y0]),
    pressures: points.map(p => (Number.isFinite(p[2]) ? p[2] : 0.5)),
    simulatePressure: false,
    strokeColor: typeof stroke.color === 'string' ? stroke.color : '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: (Number(stroke.size) || 8) / FREEDRAW_SIZE_PER_WIDTH,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    angle: 0,
  }
}
