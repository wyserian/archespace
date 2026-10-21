/**
 * reminder.js - An item's reminder.
 *
 * Stored encrypted with the item (like its tags), so the server never learns
 * what or when it is:
 *   { name, date: 'YYYY-MM-DD', time: 'HH:MM', mode, every, until, sound }
 * The date and time are the first time it goes off, in the user's local
 * (wall-clock) time. `sound` is false when it should go off silently. `mode` is
 *   'once'       goes off once
 *   'repeat'     goes off `every` day / week / month / year until `until`
 *   'permanent'  goes off `every` day / week / month / year until removed
 * A monthly or yearly reminder on a day a month lacks (the 31st, 29 February)
 * goes off on that month's last day.
 */

/** The time a reminder saved without a valid one gets. */
const DEFAULT_REMINDER_TIME = '09:00'
export const MAX_REMINDER_NAME = 100

export const REMINDER_MODES = [
  { id: 'once', label: 'Once' },
  { id: 'repeat', label: 'Repeat' },
  { id: 'permanent', label: 'Permanent' },
]
export const REMINDER_EVERY = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
]
const MODE_IDS = REMINDER_MODES.map(m => m.id)
const EVERY_IDS = REMINDER_EVERY.map(e => e.id)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

/** A Date's local calendar day as 'YYYY-MM-DD'. */
export function dayString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A local Date for a 'YYYY-MM-DD' day, at 'HH:MM' (midnight by default). */
function localDate(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min)
}

const isDay = (value) =>
  typeof value === 'string' && DATE_RE.test(value) && dayString(localDate(value)) === value

/** The day `days` after a 'YYYY-MM-DD' day (or a Date). */
export function addDays(day, days) {
  const date = typeof day === 'string' ? localDate(day) : new Date(day)
  date.setDate(date.getDate() + days)
  return dayString(date)
}

/** A valid reminder, or null (anything malformed counts as none). */
export function normalizeReminder(value) {
  if (!value || typeof value !== 'object' || !isDay(value.date)) return null
  const mode = MODE_IDS.includes(value.mode) ? value.mode : 'once'
  const reminder = {
    name: typeof value.name === 'string' ? value.name.trim().slice(0, MAX_REMINDER_NAME) : '',
    date: value.date,
    time: typeof value.time === 'string' && TIME_RE.test(value.time) ? value.time : DEFAULT_REMINDER_TIME,
    mode,
    every: mode === 'once' ? null : EVERY_IDS.includes(value.every) ? value.every : 'day',
    until: null,
    // Plays a sound when it goes off, unless turned off.
    sound: value.sound !== false,
  }
  // A repeat ends on its until day (never before it starts).
  if (mode === 'repeat') {
    reminder.until = isDay(value.until) && value.until >= value.date ? value.until : value.date
  }
  return reminder
}

/**
 * A new reminder: once, now, rounded up to the next minute so it isn't
 * already past.
 */
export function defaultReminder(now = new Date()) {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return { name: '', date: dayString(at), time, mode: 'once', every: null, until: null, sound: true }
}

/** The `index`th time it goes off (0 = the first), ignoring its end. */
function occurrence(reminder, index) {
  const [y, m, d] = reminder.date.split('-').map(Number)
  const [h, min] = reminder.time.split(':').map(Number)
  const clamped = (year, month) => {
    const last = new Date(year, month + 1, 0).getDate()
    return new Date(year, month, Math.min(d, last), h, min)
  }
  switch (reminder.mode === 'once' ? null : reminder.every) {
    case 'day': return new Date(y, m - 1, d + index, h, min)
    case 'week': return new Date(y, m - 1, d + 7 * index, h, min)
    case 'month': return clamped(y, m - 1 + index)
    case 'year': return clamped(y + index, m - 1)
    default: return new Date(y, m - 1, d, h, min)
  }
}

/** The index of the first time at or after `from`, ignoring its end. */
function indexAtOrAfter(reminder, from) {
  if (reminder.mode === 'once') return occurrence(reminder, 0) >= from ? 0 : 1
  const start = occurrence(reminder, 0)
  if (start >= from) return 0
  // Start just before `from`, then step to it.
  const months = (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth()
  let index = Math.max(0, {
    day: Math.floor((from - start) / DAY_MS) - 1,
    week: Math.floor((from - start) / (7 * DAY_MS)) - 1,
    month: months - 1,
    year: Math.floor(months / 12) - 1,
  }[reminder.every] ?? 0)
  while (occurrence(reminder, index) < from) index++
  return index
}

/** Whether the `index`th time is within its end. */
function withinEnd(reminder, index) {
  if (reminder.mode === 'once') return index === 0
  if (reminder.mode === 'repeat') return dayString(occurrence(reminder, index)) <= reminder.until
  return true
}

/** The next time it goes off at or after `from`, or null when it's over. */
export function nextOccurrence(reminder, from = new Date()) {
  const index = indexAtOrAfter(reminder, from)
  return withinEnd(reminder, index) ? occurrence(reminder, index) : null
}

/** The last time it went off (for a finished reminder). */
function lastOccurrence(reminder) {
  if (reminder.mode !== 'repeat') return occurrence(reminder, 0)
  const index = indexAtOrAfter(reminder, localDate(addDays(reminder.until, 1)))
  return occurrence(reminder, Math.max(0, index - 1))
}

/** The time to show: the next one, or the last once it's over. */
export function currentOccurrence(reminder, now = new Date()) {
  return nextOccurrence(reminder, now) ?? lastOccurrence(reminder)
}

/** Over: a reminder that has gone off for the last time. */
export function isPast(reminder, now = new Date()) {
  return !!reminder && nextOccurrence(reminder, now) == null
}

/** Earliest (next) first. */
export function compareReminders(a, b, now = new Date()) {
  return currentOccurrence(a, now) - currentOccurrence(b, now)
}

/** The Reminders view's groups, in order. */
export const REMINDER_GROUPS = [
  { id: 'past', label: 'Past' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'later', label: 'Later' },
]

/** Which group a reminder falls in (by its next time). */
export function reminderGroup(reminder, now = new Date()) {
  const next = nextOccurrence(reminder, now)
  if (!next) return 'past'
  const today = dayString(now)
  const day = dayString(next)
  if (day === today) return 'today'
  if (day === addDays(today, 1)) return 'tomorrow'
  if (day <= addDays(today, 7)) return 'week'
  return 'later'
}

/** Needs attention now: over, or going off today (the Reminders badge). */
export function isReminderNow(reminder, now = new Date()) {
  return !!reminder && dayString(currentOccurrence(reminder, now)) <= dayString(now)
}

/** A time as the user's locale shows it ("14:30" or "2:30 PM"). */
export function formatTime(time) {
  return localDate('2000-01-01', time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** A day as "12 Oct", or "12 Oct 2027" when it isn't this year. */
export function formatDate(day, now = new Date()) {
  const date = localDate(day)
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** A day as "Today", "Tomorrow", "Yesterday", "Fri", or as formatDate. */
export function formatDay(day, now = new Date()) {
  const today = dayString(now)
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  if (day === addDays(today, -1)) return 'Yesterday'
  if (day > today && day <= addDays(today, 6)) {
    return localDate(day).toLocaleDateString([], { weekday: 'short' })
  }
  return formatDate(day, now)
}

/** When it goes off next (or last went off): "Today 9:00 AM". */
export function formatReminder(reminder, now = new Date()) {
  const at = currentOccurrence(reminder, now)
  return `${formatDay(dayString(at), now)} ${formatTime(reminder.time)}`
}

/** How it repeats: "Once", "Daily until 12 Nov", "Weekly, until turned off". */
export function describeRepeat(reminder, now = new Date()) {
  if (reminder.mode === 'once') return 'Once'
  const every = REMINDER_EVERY.find(e => e.id === reminder.every)?.label ?? 'Daily'
  return reminder.mode === 'repeat'
    ? `${every} until ${formatDate(reminder.until, now)}`
    : `${every}, until turned off`
}
