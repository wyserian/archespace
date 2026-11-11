import { useState, useCallback } from 'react'
import { useToast } from '../context/ToastCore'

/** "2 spaces", "3 items", or "2 spaces and 3 items". */
export function describeSelection(spaceCount, itemCount) {
  return [
    spaceCount > 0 && `${spaceCount} ${spaceCount === 1 ? 'space' : 'spaces'}`,
    itemCount > 0 && `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
  ].filter(Boolean).join(' and ')
}

/**
 * Dual selection state for pages that select both spaces and items (the
 * dashboard, a space's page, the archive and the recycle bin). `hasDirty`
 * (item ids => bool) stops bulk actions on items with unsaved edits.
 */
export function useDualEntitySelection(spaces, items, { hasDirty } = {}) {
  const { toast } = useToast()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedSpaceIds, setSelectedSpaceIds] = useState(() => new Set())
  const [selectedItemIds, setSelectedItemIds] = useState(() => new Set())

  const selectableTotal = spaces.length + items.length
  const selectedCount = selectedSpaceIds.size + selectedItemIds.size
  const selectionLabel = describeSelection(selectedSpaceIds.size, selectedItemIds.size)

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

  /** Run `fn(spaceIds, itemIds)` on the selection, say how it went, and leave select mode. */
  const runBulkAction = async (fn, successMessage, errorMessage) => {
    if (selectedCount === 0) return
    if (hasDirty?.([...selectedItemIds])) {
      toast.error('Save or discard unsaved changes before bulk actions')
      return
    }
    try {
      await fn([...selectedSpaceIds], [...selectedItemIds])
      if (successMessage) toast.success(successMessage)
      exitSelectMode()
    } catch {
      toast.error(errorMessage || "Couldn't complete that action.")
    }
  }

  return {
    selectMode,
    setSelectMode,
    selectedSpaceIds,
    selectedItemIds,
    selectableTotal,
    selectedCount,
    selectionLabel,
    runBulkAction,
    exitSelectMode,
    selectAll,
    toggleSpace,
    toggleItem,
  }
}
