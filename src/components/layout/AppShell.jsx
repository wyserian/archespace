/**
 * AppShell.jsx - Layout wrapper for authenticated routes.
 *
 * Renders the persistent desktop sidebar alongside the routed page. The sidebar
 * only appears once signed in AND the vault is unlocked; while locked (or signed
 * out) it renders just the route (the unlock gate / redirect) full-width.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContextCore'
import { useEncryption } from '../../context/EncryptionCore'
import { useToast } from '../../context/ToastCore'
import { useSpaces } from '../../hooks/useSpaces'
import { useArchive } from '../../hooks/useArchive'
import { useRecycleBin } from '../../hooks/useRecycleBin'
import { useStarredItemCount } from '../../hooks/useStarredItemCount'
import { useReminders, useRemindersNowCount } from '../../hooks/useReminders'
import { scheduleReminders } from '../../lib/reminderNotifications'
import { convertSecretsToNotes } from '../../lib/secretMigration'
import { convertLegacyRichText } from '../../lib/richText/richTextMigration'
import { queryKeys } from '../../lib/queryKeys'
import { pathOf } from '../../lib/spaceTree'
import AppSidebar from './AppSidebar'

const NO_REMINDERS = []
// A reminder stays up longer than other toasts, so it isn't missed.
const REMINDER_TOAST_MS = 15000

function activeFromPath(pathname) {
  if (pathname.startsWith('/reminders')) return 'reminders'
  if (pathname.startsWith('/starred')) return 'starred'
  if (pathname.startsWith('/archive')) return 'archive'
  if (pathname.startsWith('/recycle-bin')) return 'bin'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/space/')) return 'space'
  if (pathname.startsWith('/app')) return 'spaces'
  return null
}

export default function AppShell() {
  const { user } = useAuth()
  const { isUnlocked, lock, cryptoKey } = useEncryption()
  const qc = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // One-time conversions after unlock (only an unlocked device can read the
  // content): secrets become Notes (secretMigration.js), and older Rich text
  // and Markdown items move to the Tiptap format (richTextMigration.js).
  useEffect(() => {
    if (!cryptoKey) return
    ;(async () => {
      const secrets = await convertSecretsToNotes(cryptoKey)
      if (secrets > 0) {
        toast.info(`${secrets} secret${secrets === 1 ? ' was' : 's were'} turned into Notes.`)
      }
      const rich = await convertLegacyRichText(cryptoKey)
      if (secrets > 0 || rich > 0) qc.invalidateQueries({ queryKey: queryKeys.items() })
    })()
  }, [cryptoKey, qc, toast])

  // Safe before unlock: all three queries are `enabled: !!cryptoKey`.
  const { data: spaces = [] } = useSpaces()
  const { total: archiveTotal = 0 } = useArchive()
  const { total: binTotal = 0 } = useRecycleBin()
  const { data: starredItemCount = 0 } = useStarredItemCount()
  const starredTotal = spaces.filter(s => s.starred).length + starredItemCount
  const topLevelSpaces = useMemo(() => spaces.filter(s => !s.parent_id), [spaces])
  const { data: reminders = NO_REMINDERS } = useReminders()
  const remindersNowTotal = useRemindersNowCount(reminders)

  // Reminders go off while this tab is open (see reminderNotifications.js).
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast })
  useEffect(() => scheduleReminders(reminders, {
    onRemind: (reminder, { notified }) => {
      if (notified) return
      toastRef.current.info(
        reminder.name ? `Reminder: ${reminder.name}` : 'You have a reminder. See Reminders.',
        { duration: REMINDER_TOAST_MS }
      )
    },
    onOpen: () => navigate('/reminders'),
  }), [reminders, navigate])

  // The open space's top-level space (a sub-space at any depth highlights it).
  const active = activeFromPath(location.pathname)
  const openId = active === 'space' ? location.pathname.split('/')[2] : null
  const activeSpaceId = useMemo(
    () => (openId ? pathOf(openId, new Map(spaces.map(s => [s.id, s])))[0]?.id ?? openId : null),
    [openId, spaces]
  )

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('arche:sidebar-collapsed') === '1' } catch { return false }
  })
  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('arche:sidebar-collapsed', next ? '1' : '0') } catch { /* storage unavailable */ }
      return next
    })
  }, [])

  // No sidebar during the unlock gate / redirect - render the route full-width.
  if (!user || !isUnlocked) return <Outlet />

  return (
    <div className="min-h-screen bg-bg-base sm:flex">
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        active={active}
        activeSpaceId={activeSpaceId}
        isUnlocked={isUnlocked}
        spaces={topLevelSpaces}
        remindersNowTotal={remindersNowTotal}
        starredTotal={starredTotal}
        archiveTotal={archiveTotal}
        binTotal={binTotal}
        onLock={() => { lock(); toast.info('Vault locked') }}
        navigate={navigate}
      />
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
