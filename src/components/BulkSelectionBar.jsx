/**
 * BulkSelectionBar.jsx - Floating toolbar for bulk actions on selected rows.
 * The selected count is shown by the page, beside its Done button.
 */
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './ui/Button'

/**
 * @param {{
 *   count: number,
 *   onClear: Function,
 *   actions: Array<{ id: string, label: string, icon: React.ComponentType, onClick: Function, variant?: 'danger' } | false>,
 * }} props
 */
export default function BulkSelectionBar({ count, onClear, actions }) {
  const barRef = useRef(null)

  // While the bar is visible, publish a marker + its measured height so the
  // toast stack can lift above it instead of overlapping it (see index.css).
  useEffect(() => {
    if (count === 0) return
    const el = barRef.current
    document.body.classList.add('bulk-bar-active')
    const publishHeight = () => {
      if (el) document.body.style.setProperty('--bulk-bar-height', `${el.offsetHeight}px`)
    }
    publishHeight()
    const observer = new ResizeObserver(publishHeight)
    if (el) observer.observe(el)
    return () => {
      observer.disconnect()
      document.body.classList.remove('bulk-bar-active')
      document.body.style.removeProperty('--bulk-bar-height')
    }
  }, [count])

  if (count === 0) return null

  return (
    // Centred with inset-x + auto margins (not left-1/2 + translate, which
    // leaves a fit-content bar only half the screen to size itself in).
    <div ref={barRef} className="fixed inset-x-0 bottom-4 z-30 mx-auto w-fit max-w-[calc(100%-1rem)]">
      {/* A floating surface, set off the page by a raised background and its
          shadow (no outline); the actions inside are quiet round icon
          buttons, destructive ones in red. */}
      <div className="flex items-center gap-2 px-2 py-2 rounded-2xl bg-bg-elevated shadow-2xl shadow-black/30">
        {/* Only the actions wrap (many of them on a narrow phone); the clear
            button stays on the bar's row. */}
        <div className="flex flex-wrap items-center gap-0.5">
          {actions.filter(Boolean).map(({ id, label, icon, onClick, variant }) => (
            <IconButton
              key={id}
              icon={icon}
              label={label}
              size="md"
              onClick={onClick}
              className={variant === 'danger' ? '!text-danger hover:!bg-danger-muted' : ''}
            />
          ))}
        </div>
        <span className="h-5 w-px shrink-0 bg-bg-border" aria-hidden="true" />
        <IconButton icon={X} label="Clear selection" size="md" onClick={onClear} />
      </div>
    </div>
  )
}

