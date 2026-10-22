/** Shared presentational components: Spinner, Modal, and ConfirmDialog. */

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { buttonClass } from './buttonStyles'

/**
 * Animated loading spinner.
 * @param {{ size?: number }} props - Diameter in px (default 16)
 */
export function Spinner({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin text-accent"
    >
      {/* Background ring */}
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"
      />
      {/* Spinning arc */}
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      />
    </svg>
  )
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog overlay.
 *
 * Features:
 *   - Closes when clicking the backdrop (outside the card)
 *   - Closes on Escape key
 *   - Traps Tab focus within the dialog and restores focus to the
 *     opener when closed
 *   - Responsive: bottom-sheet on mobile, centered card on desktop
 *   - Optional `footer` prop for sticky action buttons
 *   - Optional `onSubmit`: renders the panel as a <form> so a submit
 *     button in the footer works (and Enter submits)
 *   - `dismissible={false}`: no close button, and the backdrop and Escape
 *     don't close it; only its own actions do
 *
 * @param {{ title: string, onClose?: Function, children: React.ReactNode, footer?: React.ReactNode, onSubmit?: Function, size?: 'md'|'lg', dismissible?: boolean }} props
 */
export function Modal({ title, onClose, children, footer, onSubmit, size = 'md', dismissible = true }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const close = dismissible ? onClose : undefined

  // Keep the latest close without re-running the focus effect (callers pass
  // fresh inline handlers), so focus isn't stolen back on every render.
  const onCloseRef = useRef(close)
  useEffect(() => { onCloseRef.current = close }, [close])

  // Focus: move into the dialog on open, trap Tab, restore on close
  useEffect(() => {
    const opener = document.activeElement
    const panel = panelRef.current
    const getFocusable = () =>
      Array.from(panel?.querySelectorAll(FOCUSABLE) || [])
        .filter(el => el.getClientRects().length > 0)

    ;(getFocusable()[0] || panel)?.focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) { e.preventDefault(); panel?.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  // Prevent background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const Panel = onSubmit ? 'form' : 'div'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && close?.()}
      role="presentation"
    >
      <Panel
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className={`bg-bg-surface border border-bg-border rounded-t-2xl sm:rounded-2xl w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'} shadow-2xl flex flex-col max-h-[90svh] outline-none`}
      >
        {/* Header - always visible */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border shrink-0">
          <h3 id={titleId} className="font-semibold text-text-primary">{title}</h3>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Scrollable body */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>

        {/* Footer - pinned at bottom when provided */}
        {footer && (
          <div className="px-5 py-4 border-t border-bg-border shrink-0 bg-bg-surface rounded-b-2xl">
            {footer}
          </div>
        )}
      </Panel>
    </div>
  )
}

/**
 * Confirmation dialog for guarding a sensitive action. Renders a titled
 * Modal with a message and Cancel / Confirm buttons.
 *
 * @param {{
 *   title: string,
 *   message: React.ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   destructive?: boolean,
 *   busy?: boolean,
 *   onConfirm: Function,
 *   onClose: Function,
 * }} props
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={buttonClass({ variant: 'secondary' })}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={buttonClass({ variant: destructive ? 'dangerSolid' : 'primary' })}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-text-secondary">{message}</p>
    </Modal>
  )
}
