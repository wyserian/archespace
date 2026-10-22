/**
 * CommandPalette.jsx - Quick actions, opened with Cmd+K / Ctrl+K.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Home, Archive, Trash2, Search, Settings, SunMoon, Keyboard, Lock, Bell, Star,
} from 'lucide-react'
import { useCommandPalette } from '../context/CommandPaletteCore'
import { useTheme } from '../context/ThemeCore'
import { useEncryption } from '../context/EncryptionCore'
import { useToast } from '../context/ToastCore'
import { MENU_HINT, menuItemClass } from './ui/menuStyles'

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
const LOCK_HINT = IS_MAC ? '⌘L' : 'Ctrl L'

export default function CommandPalette({ onNewSpace, onOpenSearch }) {
  const { open, closePalette, extraCommands } = useCommandPalette()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const activeRef = useRef(null)
  const navigate = useNavigate()
  const { toggleThemeMode } = useTheme()
  const { lock, isUnlocked } = useEncryption()
  const { toast } = useToast()

  const baseCommands = useMemo(() => [
    { id: 'new', label: 'New space', hint: 'N', icon: Plus, run: () => { closePalette(); onNewSpace?.() } },
    { id: 'search', label: 'Search', hint: '/', icon: Search, run: () => { closePalette(); onOpenSearch?.() } },
    // Places, named as in the sidebar.
    { id: 'home', label: 'Go to all spaces', icon: Home, run: () => { closePalette(); navigate('/app') } },
    { id: 'reminders', label: 'Go to Reminders', icon: Bell, run: () => { closePalette(); navigate('/reminders') } },
    { id: 'starred', label: 'Go to Starred', icon: Star, run: () => { closePalette(); navigate('/starred') } },
    { id: 'archive', label: 'Go to Archive', icon: Archive, run: () => { closePalette(); navigate('/archive') } },
    { id: 'bin', label: 'Go to Bin', icon: Trash2, run: () => { closePalette(); navigate('/recycle-bin') } },
    { id: 'settings', label: 'Go to Settings', icon: Settings, run: () => { closePalette(); navigate('/settings') } },
    { id: 'shortcuts', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, run: () => { closePalette(); window.dispatchEvent(new CustomEvent('arche:open-shortcuts')) } },
    {
      id: 'theme',
      label: 'Change theme',
      icon: SunMoon,
      run: () => { toggleThemeMode(); closePalette() },
    },
    ...(isUnlocked
      ? [{ id: 'lock', label: 'Lock vault', hint: LOCK_HINT, icon: Lock, run: () => { closePalette(); lock(); toast.info('Vault locked') } }]
      : []),
  ], [closePalette, navigate, onNewSpace, onOpenSearch, toggleThemeMode, isUnlocked, lock, toast])

  // Slot page commands (e.g. "New item") right after "New space" so creation
  // actions stay grouped at the top rather than trailing the list.
  const commands = useMemo(() => {
    const [first, ...rest] = baseCommands
    return [first, ...extraCommands, ...rest]
  }, [baseCommands, extraCommands])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => c.label.toLowerCase().includes(q))
  }, [commands, query])

  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1))

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closePalette() }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
      if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault()
        filtered[activeIndex].run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, activeIndex, closePalette])

  // Keep the highlighted command visible while arrow-navigating.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && closePalette()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg bg-bg-surface border border-bg-border rounded-2xl shadow-2xl overflow-hidden"
      >
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a command..."
          className="w-full px-4 py-3.5 bg-transparent border-b border-bg-border text-text-primary placeholder-text-muted focus:outline-none text-sm"
        />
        <ul className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-text-muted">No commands found</li>
          ) : filtered.map((cmd, i) => {
            const Icon = cmd.icon
            return (
              <li key={cmd.id}>
                <button
                  type="button"
                  ref={i === activeIndex ? activeRef : null}
                  onClick={() => cmd.run()}
                  onMouseEnter={() => setActive(i)}
                  className={menuItemClass({ highlighted: i === activeIndex })}
                >
                  {Icon && <Icon size={14} className="shrink-0 text-text-muted" />}
                  <span className="truncate">{cmd.label}</span>
                  {cmd.hint && <kbd className={MENU_HINT}>{cmd.hint}</kbd>}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="px-4 py-2 text-[10px] text-text-muted border-t border-bg-border">
          ↑↓ navigate · Enter run · Esc close
        </p>
      </div>
    </div>
  )
}
