/**
 * useConfirm.jsx - Ask before a delete inside an item's editor (a list row, a
 * card, a table row, a Kanban stage). `await confirm({ title, message })` is
 * true once Delete is pressed; render `dialog` once in the editor. It shows on
 * the page's top level, so above a full-screen item too.
 */
import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from '../components/ui/UI'

export function useConfirm() {
  const [pending, setPending] = useState(null) // { title, message, resolve }

  const confirm = useCallback(
    ({ title, message }) => new Promise(resolve => setPending({ title, message, resolve })),
    [],
  )

  const answer = (ok) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const dialog = pending && createPortal(
    <div className="relative z-[90]">
      <ConfirmDialog
        title={pending.title}
        message={pending.message}
        confirmLabel="Delete"
        destructive
        onConfirm={() => answer(true)}
        onClose={() => answer(false)}
      />
    </div>,
    document.body,
  )

  return [confirm, dialog]
}

/** A short quote of what's being deleted, for the dialog's message. */
export function quoted(text, fallback) {
  const t = (text || '').trim()
  if (!t) return fallback
  return `"${t.length > 60 ? `${t.slice(0, 60)}...` : t}"`
}
