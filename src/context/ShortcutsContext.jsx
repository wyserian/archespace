/**
 * ShortcutsContext.jsx - Global keyboard shortcut registry.
 */
import { useEffect, useRef, useCallback } from 'react'
import { ShortcutsContext } from './ShortcutsCore'

export function ShortcutsProvider({ children }) {
  const handlersRef = useRef(new Map())

  const register = useCallback((id, handler) => {
    handlersRef.current.set(id, handler)
    return () => handlersRef.current.delete(id)
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target
      const tag = target?.tagName?.toLowerCase()
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable

      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'k') {
        e.preventDefault()
        handlersRef.current.get('palette')?.()
        return
      }

      if (e.key === 'Escape') {
        handlersRef.current.get('escape')?.()
        return
      }

      // Undo / redo, unless a text field or the whiteboard has its own.
      const key = e.key.toLowerCase()
      if (mod && (key === 'z' || key === 'y')) {
        if (isTyping || e.defaultPrevented || target?.closest?.('.excalidraw')) return
        const fn = handlersRef.current.get(key === 'y' || e.shiftKey ? 'redo' : 'undo')
        if (fn) {
          e.preventDefault()
          fn()
        }
        return
      }

      if (isTyping && !mod) return

      if (e.key === '?' && !mod) {
        e.preventDefault()
        handlersRef.current.get('shortcuts')?.()
        return
      }

      if (mod && e.key === 's') {
        e.preventDefault()
        handlersRef.current.get('save')?.()
        return
      }

      if (e.key === '/' && !mod) {
        e.preventDefault()
        handlersRef.current.get('search')?.()
        return
      }

      if (e.key === 'n' && !mod && !e.shiftKey) {
        const fn = handlersRef.current.get('new-space')
        if (fn) {
          e.preventDefault()
          fn()
        }
      }

      if (e.key === 'i' && !mod && !e.shiftKey) {
        const fn = handlersRef.current.get('new-item')
        if (fn) {
          e.preventDefault()
          fn()
        }
      }

      if (mod && e.key === 'l') {
        const fn = handlersRef.current.get('lock')
        if (fn) {
          e.preventDefault()
          fn()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <ShortcutsContext.Provider value={{ register }}>
      {children}
    </ShortcutsContext.Provider>
  )
}
