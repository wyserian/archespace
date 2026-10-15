/**
 * preview.js - The PNG preview saved with each Whiteboard (see scene.js), and
 * the one-time upgrade of a board made before Excalidraw. Loads Excalidraw, so
 * it's only imported where a board is open or being upgraded.
 */
import { exportToBlob, restoreElements } from '@excalidraw/excalidraw'
import { boardScene, toBoardContent } from './scene'

// Longest side of the preview, in pixels: sharp on a card and in a PDF while
// keeping the saved item small.
const PREVIEW_MAX_SIZE = 800

/** A PNG data URL of the board, on its own background; null when empty. */
async function boardPreview(elements, files, background) {
  const live = elements.filter(e => !e.isDeleted)
  if (!live.length) return null
  const blob = await exportToBlob({
    elements: live,
    files,
    appState: { exportBackground: true, viewBackgroundColor: background, exportWithDarkMode: false },
    mimeType: 'image/png',
    maxWidthOrHeight: PREVIEW_MAX_SIZE,
    exportPadding: 16,
  })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** A scene as content to save, with a fresh preview (none if it fails). */
export async function boardToSave({ elements, files, background }) {
  const preview = await boardPreview(elements, files, background).catch(() => null)
  return toBoardContent(elements, files, background, preview)
}

/** Convert an old Drawing into a board, with its preview, ready to save. */
export function upgradeLegacyBoard(content) {
  const { elements, files, background } = boardScene(content)
  return boardToSave({ elements: restoreElements(elements, null), files, background })
}
