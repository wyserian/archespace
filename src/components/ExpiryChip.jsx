/**
 * ExpiryChip.jsx - A space's or item's self-destruct time as a chip beside
 * its tags ("Deletes in 5 h"), red with under a day left. Opens the expiry
 * dialog when clickable.
 */
import { Hourglass } from 'lucide-react'
import { useNow } from '../hooks/useReminders'
import { expiresSoon, formatExpiresIn, formatExpiryTime } from '../lib/expiry'

export function ExpiryChip({ expiresAt, onClick }) {
  const now = useNow().getTime()
  const soon = expiresSoon(expiresAt, now)
  const label = `Deletes ${formatExpiresIn(expiresAt, now)}`
  const description = `Self-destructs ${formatExpiryTime(expiresAt)}`
  const className = `inline-flex max-w-full items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
    soon ? 'border-danger/30 bg-danger-muted text-danger' : 'border-bg-border bg-bg-elevated text-text-muted'
  }`
  const content = (
    <>
      <Hourglass size={11} className="shrink-0" />
      <span className="shrink-0">{label}</span>
    </>
  )
  if (!onClick) return <span className={className} title={description} aria-label={description}>{content}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      title={description}
      aria-label={`${description}. Change`}
      className={`${className} hover:brightness-110 transition`}
    >
      {content}
    </button>
  )
}
