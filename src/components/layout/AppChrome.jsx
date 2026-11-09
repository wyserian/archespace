/**
 * AppChrome.jsx - Global UI shell (palette, session toasts, offline sync).
 */
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContextCore'
import { useEncryption } from '../../context/EncryptionCore'
import { useToast } from '../../context/ToastCore'
import { useCommandPalette } from '../../context/CommandPaletteCore'
import { useShortcut } from '../../context/ShortcutsCore'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { useExpirySweep } from '../../hooks/useExpirySweep'
import CommandPalette from '../CommandPalette'
import ShortcutsHelp from '../ShortcutsHelp'
import { usePageActions } from '../../context/PageActionsCore'

export default function AppChrome() {
  const { user } = useAuth()
  const { lock, isUnlocked } = useEncryption()
  const { toast } = useToast()
  const { openPalette } = useCommandPalette()
  const pageActions = usePageActions()
  const pageActionsRef = useRef(pageActions)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    pageActionsRef.current = pageActions
  }, [pageActions])

  useOfflineSync()
  useExpirySweep(!!user && isUnlocked)

  useShortcut('palette', () => openPalette(), !!user)
  useShortcut('search', () => pageActionsRef.current.onOpenSearch?.(), !!user)
  useShortcut('new-space', () => pageActionsRef.current.onNewSpace?.(), !!user)
  useShortcut('save', () => window.dispatchEvent(new CustomEvent('arche:flush-saves')), !!user)
  useShortcut('escape', () => pageActionsRef.current.onEscape?.(), !!user)
  useShortcut('shortcuts', () => setShowShortcuts(true), !!user)
  useShortcut('lock', () => { lock(); toast.info('Vault locked') }, !!user && isUnlocked)

  // Let the command palette / header buttons open the shortcuts help too.
  useEffect(() => {
    const open = () => setShowShortcuts(true)
    window.addEventListener('arche:open-shortcuts', open)
    return () => window.removeEventListener('arche:open-shortcuts', open)
  }, [])

  useEffect(() => {
    const onExpired = () => {
      toast.info('Session expired after one week. Please sign in again.')
    }
    const onVaultLocked = (e) => {
      const why = e.detail?.reason === 'screen' ? 'when the screen locked' : 'after inactivity'
      toast.info(`Vault locked ${why}. Enter your PIN to unlock.`)
    }
    window.addEventListener('arche:session-expired', onExpired)
    window.addEventListener('arche:vault-auto-locked', onVaultLocked)
    return () => {
      window.removeEventListener('arche:session-expired', onExpired)
      window.removeEventListener('arche:vault-auto-locked', onVaultLocked)
    }
  }, [toast])

  if (!user) return null

  return (
    <>
      <CommandPalette
        onNewSpace={() => pageActionsRef.current.onNewSpace?.()}
        onOpenSearch={() => pageActionsRef.current.onOpenSearch?.()}
      />
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
    </>
  )
}
