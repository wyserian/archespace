import { useState, useCallback } from 'react'

/**
 * Dual selection state for pages that select both spaces and items (the
 * dashboard, a space's page, the archive and the recycle bin).
 */
export function useDualEntitySelection(spaces, items) {
  const [selectMode, setSelectMode] = useState(false)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState(() => new Set())
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set())

  const selectableTotal = spaces.length + items.length
  const selectedCount = selectedSpaceIds.size + selectedItemIds.size

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedSpaceIds(new Set())
    setSelectedItemIds(new Set())
  }, [])

  const selectAll = useCallback(() => {
    setSelectedSpaceIds(new Set(spaces.map(c => c.id)))
    setSelectedItemIds(new Set(items.map(i => i.id)))
  }, [spaces, items])

  const toggleSpace = useCallback((id) => {
    setSelectedSpaceIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleItem = useCallback((id) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return {
    selectMode,
    setSelectMode,
    selectedSpaceIds,
    selectedItemIds,
    selectableTotal,
    selectedCount,
    exitSelectMode,
    selectAll,
    toggleSpace,
    toggleItem,
  }
}
