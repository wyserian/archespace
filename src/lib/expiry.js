/**
 * expiry.js - Self-destruct: a space or item with an `expires_at` time is
 * deleted for good when it passes (schema.sql section 3b). The time is plain,
 * not encrypted, so the server can enforce it on every device.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** Quick choices in the dialog, from now. */
export const EXPIRY_PRESETS = [
  { id: '1h', label: '1 hour', ms: HOUR },
  { id: '1d', label: '1 day', ms: DAY },
  { id: '7d', label: '1 week', ms: 7 * DAY },
  { id: '30d', label: '30 days', ms: 30 * DAY },
]

/** Whether `row` has expired (an unparsable time counts as no expiry). */
export function isExpired(row, now = Date.now()) {
  const at = row?.expires_at ? Date.parse(row.expires_at) : NaN
  return !Number.isNaN(at) && at <= now
}

/** `rows` without the expired ones. */
export const withoutExpired = (rows, now = Date.now()) => rows.filter(row => !isExpired(row, now))

/**
 * How long until `iso`, in short words: "in 45 min", "in 5 h", "in 3 days",
 * or the day ("on 12 Dec") beyond a month. "now" once it's due.
 */
export function formatExpiresIn(iso, now = Date.now()) {
  const left = Date.parse(iso) - now
  if (left <= 60 * 1000) return 'now'
  if (left < HOUR) return `in ${Math.ceil(left / 60000)} min`
  // Rounded first, so a fresh "1 day" (a moment under 24 h) reads as a day.
  const hours = Math.round(left / HOUR)
  if (hours < 24) return `in ${hours} h`
  if (left < 31 * DAY) {
    const days = Math.round(left / DAY)
    return `in ${days} ${days === 1 ? 'day' : 'days'}`
  }
  return `on ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** The exact time, for the dialog and tooltips: "Tue 12 Nov 2026, 14:30". */
export function formatExpiryTime(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** Less than a day left: shown in red. */
export const expiresSoon = (iso, now = Date.now()) => Date.parse(iso) - now < DAY
