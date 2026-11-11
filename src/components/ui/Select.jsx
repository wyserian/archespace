/**
 * Select.jsx - A dropdown field for one of a few `options` ({ id, label }),
 * drawn like the app's menus (the browser's own list can't be styled).
 * Focus stays on the field: the arrow keys, Home and End move through the
 * options, Enter or Space picks one, Escape or Tab closes the list.
 * `className` styles the field; other props (id, aria-label) go on it too.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { MENU_PANEL, menuItemClass } from './menuStyles'

const GAP = 4
const ROW_HEIGHT = 28

export function Select({ value, onChange, options, className = '', ...props }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [place, setPlace] = useState(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()
  const current = options.find(o => o.id === value) ?? options[0]

  // Below the field, or above it when there's no room.
  const measure = () => {
    const rect = buttonRef.current.getBoundingClientRect()
    const height = options.length * ROW_HEIGHT + 8
    const below = rect.bottom + GAP + height <= window.innerHeight - 8
    setPlace({ left: rect.left, width: rect.width, top: below ? rect.bottom + GAP : rect.top - GAP - height })
  }

  const show = () => {
    measure()
    setHighlight(Math.max(0, options.findIndex(o => o.id === value)))
    setOpen(true)
  }

  const pick = (option) => {
    setOpen(false)
    if (option.id !== value) onChange(option.id)
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!buttonRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false)
    }
    // On the window, before a dialog's own Escape: closes only the list.
    const onEscape = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onEscape, true)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onEscape, true)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  })

  const onKeyDown = (e) => {
    const last = options.length - 1
    const move = { ArrowDown: Math.min(highlight + 1, last), ArrowUp: Math.max(highlight - 1, 0), Home: 0, End: last }
    if (e.key in move) {
      e.preventDefault()
      if (open) setHighlight(move[e.key])
      else show()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open) pick(options[highlight])
      else show()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        {...props}
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${highlight}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        // Space is handled on key down; this stops its click from reopening the list.
        onKeyUp={(e) => { if (e.key === ' ') e.preventDefault() }}
        className={`${className} inline-flex items-center justify-between gap-2 text-left cursor-pointer`}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && place && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className={`fixed z-[1000] ${MENU_PANEL} animate-fade-in`}
          style={{ top: place.top, left: place.left, minWidth: place.width }}
        >
          {options.map((option, i) => (
            <div
              key={option.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option.id === value}
              onMouseDown={(e) => e.preventDefault()} // keep focus on the field
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(option)}
              className={`${menuItemClass({ active: option.id === value, highlighted: i === highlight })} justify-between cursor-pointer`}
            >
              <span className="truncate">{option.label}</span>
              {option.id === value && <Check size={14} className="shrink-0" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
