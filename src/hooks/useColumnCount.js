/**
 * useColumnCount.js - Columns for a masonry of cards: 1 on phones, 2 on
 * tablets, 3 on desktop.
 */
import { useMediaQuery } from './useMediaQuery'

export function useColumnCount() {
  const phone = useMediaQuery('(max-width: 639px)')
  const desktop = useMediaQuery('(min-width: 1024px)')
  return phone ? 1 : desktop ? 3 : 2
}
