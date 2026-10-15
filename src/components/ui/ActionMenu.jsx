/**
 * ActionMenu.jsx - Compact hover/click menu for row and card actions.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { buttonClass } from './buttonStyles'
import { MENU_PANEL, menuItemClass } from './menuStyles'

const MENU_WIDTH = 160
const VIEWPORT_PADDING = 8
const MENU_GAP = 8

/**
 * `triggerLabel` turns the trigger into a primary button with that text (the
 * "+ New" menu); otherwise it's a round icon button (`icon`, dots by default).
 * `openOnHover` (default true) opens it on pointer hover as well as click.
 * `triggerProps` go on the trigger button (a table grip makes it draggable).
 */
export function ActionMenu({
  actions,
  label = 'Actions',
  align = 'right',
  bordered = true,
  compact = false,
  icon: TriggerIcon = MoreHorizontal,
  triggerLabel,
  openOnHover = true,
  disabled = false,
  triggerProps,
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, origin: 'top' })
  const menuId = useId()
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const closeTimer = useRef(null)
  // Set when the menu is opened via click/keyboard (not hover) so we move
  // focus into it - hover-open must not steal focus from the pointer.
  const shouldFocusFirst = useRef(false)
  // Set while a hover has it open, so the click that follows (or a touch's
  // tap, which hovers first) keeps it open instead of toggling it shut.
  const openedByHover = useRef(false)
  const visibleActions = actions.filter(Boolean)

  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])

  const clearCloseTimer = useCallback(() => {
    clearTimeout(closeTimer.current)
  }, [])

  const openMenu = useCallback(() => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const closeMenu = useCallback(() => {
    clearCloseTimer()
    setOpen(false)
  }, [clearCloseTimer])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }, [clearCloseTimer])

  const updatePosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight || (visibleActions.length * 28 + 8)
    const menuWidth = menuRef.current?.offsetWidth || MENU_WIDTH
    const hasRoomBelow = rect.bottom + MENU_GAP + menuHeight <= window.innerHeight - VIEWPORT_PADDING
    const top = hasRoomBelow
      ? rect.bottom + MENU_GAP
      : Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - menuHeight)
    const preferredLeft = align === 'left' ? rect.left : rect.right - menuWidth
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, preferredLeft),
      window.innerWidth - menuWidth - VIEWPORT_PADDING
    )

    setPosition({ top, left, origin: hasRoomBelow ? 'top' : 'bottom' })
  }, [align, visibleActions.length])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) closeMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeMenu()
        buttonRef.current?.focus()
      }
    }
    const handleViewportChange = () => updatePosition()
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeMenu, open, updatePosition])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer])

  // Move focus into the menu when opened via click/keyboard.
  useEffect(() => {
    if (!open || !shouldFocusFirst.current) return
    shouldFocusFirst.current = false
    menuItems()[0]?.focus()
  }, [open])

  const openMenuFocused = () => {
    shouldFocusFirst.current = true
    openMenu()
  }

  const openOnPointer = () => {
    if (disabled) return
    if (!open) openedByHover.current = true
    openMenu()
  }

  const handleTriggerClick = () => {
    if (open && !openedByHover.current) closeMenu()
    else openMenuFocused()
    openedByHover.current = false
  }

  const handleTriggerKeyDown = (event) => {
    // Alt+Arrow is left to the card around it (moving the card).
    if (!open && !event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      openMenuFocused()
    }
  }

  const handleMenuKeyDown = (event) => {
    const items = menuItems()
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(currentIndex + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(currentIndex - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      closeMenu()
    }
  }

  const handleBlur = (event) => {
    const next = event.relatedTarget
    if (
      !event.currentTarget.contains(next) &&
      !menuRef.current?.contains(next)
    ) scheduleClose()
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onMouseEnter={openOnHover ? openOnPointer : undefined}
      onMouseLeave={openOnHover ? scheduleClose : undefined}
      onBlur={handleBlur}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        {...triggerProps}
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        className={triggerLabel
          ? buttonClass({ variant: 'primary', size: 'sm' })
          // A round, borderless icon trigger; `bordered` only adds a soft
          // fill so it reads as a control on a busy surface.
          : `${compact ? 'p-1.5' : 'p-2'} rounded-full transition-colors ${
              open
                ? 'bg-accent-muted text-accent'
                : `${bordered ? 'bg-bg-elevated' : ''} text-text-muted hover:text-text-primary hover:bg-bg-hover`
            }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        title={label}
      >
        <TriggerIcon size={triggerLabel ? 15 : 14} strokeWidth={triggerLabel ? 2.5 : 2} />
        {triggerLabel}
      </button>

      {open && createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        onKeyDown={handleMenuKeyDown}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        className={`fixed z-[1000] w-40 ${MENU_PANEL} transition-all duration-150 opacity-100 scale-100 pointer-events-auto animate-fade-in ${
          position.origin === 'top' ? 'origin-top' : 'origin-bottom'
        }`}
        style={{ top: position.top, left: position.left }}
      >
        {visibleActions.map(({ id, label: itemLabel, icon: Icon, onClick, variant, active, disabled }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation()
              onClick?.()
              closeMenu()
              buttonRef.current?.focus()
            }}
            className={menuItemClass({ active, danger: variant === 'danger' })}
          >
            {Icon && <Icon size={14} className="shrink-0" />}
            <span className="truncate">{itemLabel}</span>
          </button>
        ))}
      </div>
      , document.body)}
    </div>
  )
}
