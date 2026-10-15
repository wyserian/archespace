/**
 * AppSidebar.jsx - Persistent desktop left navigation (app-wide).
 *
 * Collapsible (icon-only or icon+label), with the name and the collapse toggle
 * at the top. Shown on sm+ screens only; the mobile top bars remain the
 * navigation on phones. The space list folds under its
 * heading; Lock vault sits at the bottom, above a Settings menu (Commands,
 * Shortcuts, Settings, Sign out). `active` marks the current section
 * ('spaces' | 'space' | 'reminders' | 'starred' | 'archive' | 'bin' |
 * 'settings'); `activeSpaceId` the open top-level space.
 */
import { useEffect, useRef, useState } from 'react'
import {
  LayoutGrid, Star, Archive, Trash2, Keyboard, Command, Lock, Settings, LogOut,
  ChevronsLeft, ChevronsRight, ChevronRight, Bell,
} from 'lucide-react'
import { SIGN_OUT_TEXT } from '../../lib/localMode'
import { MENU_PANEL, MENU_DIVIDER, MENU_HINT, menuItemClass } from '../ui/menuStyles'

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
const MOD = IS_MAC ? '⌘' : 'Ctrl '
const SPACES_OPEN_KEY = 'arche:sidebar-spaces-open'

function SectionLabel({ children, collapsed }) {
  if (collapsed) return <div className="h-4" />
  return (
    <p className="px-3 pt-5 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
      {children}
    </p>
  )
}

/** A space under the Spaces heading: no icon, smaller, and indented a step
 *  past the heading. */
function SpaceRow({ label, active, trailing, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-2 rounded-lg pl-6 pr-3 py-1.5 text-xs transition-colors ${
        active
          ? 'bg-bg-elevated text-text-primary font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated/60'
      }`}
    >
      <span className="flex-1 text-left truncate">{label}</span>
      {trailing}
    </button>
  )
}

function NavItem({ icon: Icon, label, active, count, badge, collapsed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={badge ? `${label}, ${badge} for today or past` : label}
      aria-current={active ? 'page' : undefined}
      className={`relative w-full flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
        collapsed ? 'justify-center py-2' : ''
      } ${
        active
          ? 'bg-bg-elevated text-text-primary font-medium'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated/60'
      }`}
    >
      <Icon
        size={17}
        className={`shrink-0 ${active ? 'text-accent' : ''}`}
      />
      {/* What needs attention now: a pill, or a dot on the icon when collapsed. */}
      {badge > 0 && collapsed && (
        <span className="absolute top-1.5 right-4 h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
      )}
      {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
      {!collapsed && badge > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-accent-fg text-[10px] font-bold px-1 tabular-nums">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {!collapsed && count != null && (
        <span className="text-xs tabular-nums text-text-muted">{count}</span>
      )}
    </button>
  )
}

function MenuItem({ icon: Icon, label, hint, danger, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={menuItemClass({ danger })}
    >
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
      {hint && <kbd className={MENU_HINT}>{hint}</kbd>}
    </button>
  )
}

/** The Settings row at the bottom, opening a menu of the account and app
 *  actions. Opens upward, or to the right when collapsed. */
function SettingsMenu({ collapsed, settingsActive, onSettings, onShortcuts, onCommands, onSignOut }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const run = (fn) => () => { setOpen(false); fn?.() }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings and more"
        title={collapsed ? 'Settings and more' : undefined}
        className={`w-full flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-left transition-colors ${
          open || settingsActive
            ? 'bg-bg-elevated text-text-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated/60'
        } ${collapsed ? 'justify-center py-2' : ''}`}
      >
        <Settings size={17} className={`shrink-0 ${settingsActive ? 'text-accent' : ''}`} />
        {!collapsed && <span className="flex-1 truncate">Settings</span>}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-44 ${MENU_PANEL} animate-fade-in ${
            collapsed ? 'left-full bottom-0 ml-2' : 'left-0 bottom-full mb-2'
          }`}
        >
          <MenuItem icon={Command} label="Commands" hint={`${MOD}K`} onClick={run(onCommands)} />
          <MenuItem icon={Keyboard} label="Keyboard shortcuts" hint="?" onClick={run(onShortcuts)} />
          <div className={MENU_DIVIDER} />
          <MenuItem icon={Settings} label="Open settings" onClick={run(onSettings)} />
          {onSignOut && <MenuItem icon={LogOut} label={SIGN_OUT_TEXT.label} danger onClick={run(onSignOut)} />}
        </div>
      )}
    </div>
  )
}

export default function AppSidebar({
  collapsed, onToggleCollapsed, active, activeSpaceId,
  isUnlocked, spaces, remindersNowTotal, starredTotal, archiveTotal, binTotal,
  onLock, onSignOut, onCommands, onShortcuts, navigate,
}) {
  const [spacesOpen, setSpacesOpen] = useState(() => {
    try { return localStorage.getItem(SPACES_OPEN_KEY) !== '0' } catch { return true }
  })
  const toggleSpaces = () => {
    setSpacesOpen(prev => {
      const next = !prev
      try { localStorage.setItem(SPACES_OPEN_KEY, next ? '1' : '0') } catch { /* storage unavailable */ }
      return next
    })
  }

  return (
    <aside
      className={`hidden sm:flex flex-col shrink-0 h-screen sticky top-0 z-30 bg-bg-surface/40 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-44'
      }`}
    >
      {/* The name, as in the emails, and the collapse toggle. The name is too
          wide for the collapsed rail, which keeps only the toggle. */}
      <div className={`shrink-0 h-14 flex items-center px-2 ${collapsed ? '' : 'justify-between pl-5'}`}>
        {!collapsed && (
          <span className="text-base font-bold leading-none tracking-[0.03em] text-text-primary select-none" aria-hidden="true">
            <span className="text-accent">ARCHE</span>SPACE
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`shrink-0 flex justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated/60 transition-colors ${collapsed ? 'w-full py-2' : 'h-8 w-8 items-center'}`}
        >
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 flex flex-col gap-0.5 px-2 pt-1">
        <NavItem icon={LayoutGrid} label="All spaces" active={active === 'spaces'} count={spaces.length} collapsed={collapsed} onClick={() => navigate('/app')} />

        {/* The space list folds under its heading and is the only part that
            scrolls. Hidden when collapsed, where bare folder icons say nothing. */}
        {!collapsed && spaces.length > 0 && (
          <>
            <button
              type="button"
              onClick={toggleSpaces}
              aria-expanded={spacesOpen}
              className="group flex items-center gap-1 px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted/70 hover:text-text-secondary transition-colors"
            >
              Spaces
              <ChevronRight size={12} className={`transition-transform duration-150 ${spacesOpen ? 'rotate-90' : ''}`} />
            </button>
            {spacesOpen && (
              <div className="min-h-0 overflow-y-auto scrollbar-slim flex flex-col gap-0.5">
                {spaces.map(space => (
                  <SpaceRow
                    key={space.id}
                    label={space.name || 'Untitled'}
                    active={active === 'space' && activeSpaceId === space.id}
                    trailing={space.locked && <Lock size={12} className="shrink-0 text-text-muted" aria-label="Protected" />}
                    onClick={() => navigate(`/space/${space.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <SectionLabel collapsed={collapsed}>Library</SectionLabel>
        <NavItem icon={Bell} label="Reminders" active={active === 'reminders'} badge={remindersNowTotal} collapsed={collapsed} onClick={() => navigate('/reminders')} />
        <NavItem icon={Star} label="Starred" active={active === 'starred'} count={starredTotal} collapsed={collapsed} onClick={() => navigate('/starred')} />
        <NavItem icon={Archive} label="Archive" active={active === 'archive'} count={archiveTotal} collapsed={collapsed} onClick={() => navigate('/archive')} />
        <NavItem icon={Trash2} label="Bin" active={active === 'bin'} count={binTotal} collapsed={collapsed} onClick={() => navigate('/recycle-bin')} />
      </nav>

      {/* Footer: Lock vault, then the Settings menu */}
      <div className="shrink-0 px-2 pt-4 pb-3 space-y-0.5">
        {isUnlocked && (
          <NavItem icon={Lock} label="Lock vault" collapsed={collapsed} onClick={onLock} />
        )}
        <SettingsMenu
          collapsed={collapsed}
          settingsActive={active === 'settings'}
          onSettings={() => navigate('/settings')}
          onShortcuts={onShortcuts}
          onCommands={onCommands}
          onSignOut={onSignOut}
        />
      </div>
    </aside>
  )
}
