/**
 * useViewMode.js - A page's list or grid view, remembered separately for small
 * screens (phones) and larger ones: a small screen starts in list and a larger
 * one in grid, until you pick. It follows the screen as it changes size.
 */
import { useState } from 'react'
import { useMediaQuery } from './useMediaQuery'

/** Where the choice for this screen size is kept. */
export const viewModeKey = (key, small) => (small ? `${key}:small` : key)

/** The saved choice, else the default for the screen size. */
export const viewModeOrDefault = (saved, small) =>
  saved === 'list' || saved === 'grid' ? saved : small ? 'list' : 'grid'

function readSaved(storageKey) {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null // storage unavailable
  }
}

/** [mode, changeMode] for the view saved under `key` ('arche:spaces-view', ...). */
export function useViewMode(key) {
  const small = useMediaQuery('(max-width: 639px)')
  const storageKey = viewModeKey(key, small)
  // Picks made on this page, so a change shows even where storage fails.
  const [picked, setPicked] = useState({})
  const mode = picked[storageKey] ?? viewModeOrDefault(readSaved(storageKey), small)
  const changeMode = (next) => {
    setPicked(prev => ({ ...prev, [storageKey]: next }))
    try { localStorage.setItem(storageKey, next) } catch { /* storage unavailable */ }
  }
  return [mode, changeMode]
}
