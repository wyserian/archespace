/**
 * ShortcutsHelp.jsx - Modal listing the app's keyboard shortcuts.
 *
 * Rendered globally from AppChrome. Open it with `?`, the command
 * palette, or the header button. Dispatch `arche:open-shortcuts` to open.
 */
import { Modal } from './ui/UI'

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
const MOD = IS_MAC ? '⌘' : 'Ctrl'
const ALT = IS_MAC ? '⌥' : 'Alt'

const SHORTCUTS = [
  { keys: [MOD, 'K'], label: 'Open the command palette' },
  { keys: ['/'],      label: 'Focus dashboard search' },
  { keys: ['N'],      label: 'Create a new space (on the dashboard)' },
  { keys: ['I'],      label: 'Create a new item (inside a space)' },
  { keys: [MOD, 'L'], label: 'Lock the vault' },
  { keys: [MOD, 'S'], label: 'Save all edited items on the page' },
  { keys: ['↑'],      label: 'Move the focused list row up' },
  { keys: ['↓'],      label: 'Move the focused list row down' },
  { keys: [ALT, '↑'], label: 'Move the focused space or item up' },
  { keys: [ALT, '↓'], label: 'Move the focused space or item down' },
  { keys: ['?'],      label: 'Show this shortcuts list' },
  { keys: ['Esc'],    label: 'Close menus, modals, or overlays' },
]

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] px-2 py-1 rounded-md border border-bg-border bg-bg-elevated text-xs font-mono text-text-secondary">
      {children}
    </kbd>
  )
}

export default function ShortcutsHelp({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <ul className="space-y-2.5">
        {SHORTCUTS.map(({ keys, label }) => (
          <li key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-secondary">{label}</span>
            <span className="flex items-center gap-1 shrink-0">
              {keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-muted text-xs">+</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-text-muted leading-relaxed">
        Most shortcuts are ignored while you're typing in a text field (except {MOD}+K, {MOD}+L, and {MOD}+S).
      </p>
    </Modal>
  )
}
