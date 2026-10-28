/**
 * Toast notifications via a `useToast()` hook (toast.success/error/info).
 * They stack in the bottom-right and auto-dismiss (errors stay longer); the
 * oldest goes first past MAX_TOASTS.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { TOAST_DISMISS_MS, TOAST_ERROR_DISMISS_MS, MAX_TOASTS } from '../lib/constants'
import { ToastContext } from './ToastCore'

/** Icon + accent colour per toast type */
const TYPE_CONFIG = {
  success: { Icon: CheckCircle2, color: 'text-accent', bg: 'bg-accent-muted', border: 'border-accent-border' },
  error:   { Icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-400/20'     },
  info:    { Icon: Info,          color: 'text-blue-400',    bg: 'bg-blue-400/10',    border: 'border-blue-400/20'    },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  // Auto-dismiss timers by toast id, cleared on unmount.
  const timerMap = useRef(new Map())

  useEffect(() => {
    const map = timerMap.current
    return () => {
      for (const timerId of map.values()) {
        clearTimeout(timerId)
      }
      map.clear()
    }
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))

    // Remove after the exit animation.
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timerMap.current.delete(id)
      timerMap.current.delete(`${id}-remove`)
    }, 200)

    timerMap.current.set(`${id}-remove`, removeTimer)

    const existingTimer = timerMap.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timerMap.current.delete(id)
    }
  }, [])

  /**
   * Show a toast notification.
   * @param {'success'|'error'|'info'} type
   * @param {string} message
   * @param {{ duration?: number, action?: { label: string, onClick: Function } }} [options]
   *   How long it stays (ms), and a button that runs `onClick` and closes it.
   */
  const show = useCallback((type, message, options) => {
    const id = crypto.randomUUID()
    const duration = options?.duration ?? (type === 'error' ? TOAST_ERROR_DISMISS_MS : TOAST_DISMISS_MS)

    setToasts(prev => {
      const trimmed = prev.length >= MAX_TOASTS ? prev.slice(1) : prev
      return [...trimmed, { id, type, message, exiting: false, duration, action: options?.action }]
    })

    const timerId = setTimeout(() => dismiss(id), duration)
    timerMap.current.set(id, timerId)
  }, [dismiss])

  /** Pause a toast's auto-dismiss while the pointer is over it */
  const pauseTimer = useCallback((id) => {
    const timerId = timerMap.current.get(id)
    if (timerId) {
      clearTimeout(timerId)
      timerMap.current.delete(id)
    }
  }, [])

  /** Restart auto-dismiss when the pointer leaves */
  const resumeTimer = useCallback((id, duration) => {
    if (timerMap.current.has(id)) return
    const timerId = setTimeout(() => dismiss(id), duration)
    timerMap.current.set(id, timerId)
  }, [dismiss])

  const toast = {
    success: (msg, options) => show('success', msg, options),
    error:   (msg, options) => show('error', msg, options),
    info:    (msg, options) => show('info', msg, options),
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack (bottom-right, fixed) */}
      <div className="toast-stack fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        {toasts.map(({ id, type, message, exiting, duration, action }) => {
          const { Icon, color, bg, border } = TYPE_CONFIG[type] || TYPE_CONFIG.info
          return (
            <div
              key={id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border ${border} ${bg} shadow-xl backdrop-blur-md ${
                exiting ? 'animate-slide-out' : 'animate-slide-in'
              }`}
              style={{ background: 'var(--glass-bg)' }}
              role={type === 'error' ? 'alert' : 'status'}
              aria-live={type === 'error' ? 'assertive' : 'polite'}
              onMouseEnter={() => pauseTimer(id)}
              onMouseLeave={() => resumeTimer(id, duration)}
            >
              <Icon size={20} className={`${color} shrink-0`} />
              <span className="flex-1 text-sm text-text-primary">{message}</span>
              {action && (
                <button
                  type="button"
                  onClick={() => { action.onClick(); dismiss(id) }}
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent hover:bg-accent-muted transition-colors"
                >
                  {action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(id)}
                className="shrink-0 p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
