/**
 * ReminderDialog.jsx - Set, change or remove an item's reminder (see
 * lib/reminder.js): its name, when it first goes off, whether it goes off
 * once, repeats until a day, or repeats until turned off, and whether it plays
 * a sound. Asks to show browser notifications the first time one is saved.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './ui/UI'
import { buttonClass } from './ui/buttonStyles'
import {
  MAX_REMINDER_NAME, REMINDER_EVERY, REMINDER_MODES, addDays, dayString, defaultReminder, formatDate,
  formatDay, formatTime, nextOccurrence, normalizeReminder,
} from '../lib/reminder'
import { notificationPermission, playChime, requestNotificationPermission } from '../lib/reminderNotifications'

const FIELD =
  'w-full bg-bg-elevated border border-bg-border rounded-xl px-3 py-2.5 text-sm text-text-primary ' +
  'placeholder-text-muted focus:outline-none focus:border-accent transition-colors'
const LABEL = 'block text-xs font-medium text-text-secondary mb-1.5'

/** In words: "Goes off daily at 9:00 AM, from 6 Oct until 12 Nov." */
function summary(reminder) {
  const at = formatTime(reminder.time)
  if (reminder.mode === 'once') {
    const day = formatDay(reminder.date)
    const when = ['Today', 'Tomorrow', 'Yesterday'].includes(day) ? day.toLowerCase() : `on ${day}`
    return `Goes off ${when} at ${at}.`
  }
  const every = REMINDER_EVERY.find(e => e.id === reminder.every).label.toLowerCase()
  const from = formatDate(reminder.date)
  return reminder.mode === 'repeat'
    ? `Goes off ${every} at ${at}, from ${from} until ${formatDate(reminder.until)}.`
    : `Goes off ${every} at ${at} from ${from}, until you turn it off.`
}

export function ReminderDialog({ initial, onSave, onRemove, onClose }) {
  const today = dayString(new Date())
  const [start] = useState(() => initial || defaultReminder())
  const [name, setName] = useState(start.name)
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [mode, setMode] = useState(start.mode)
  const [every, setEvery] = useState(start.every || 'day')
  const [until, setUntil] = useState(start.until || addDays(start.date, 30))
  const [sound, setSound] = useState(start.sound !== false)
  const [saving, setSaving] = useState(false)

  const quickPicks = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: addDays(today, 7) },
  ]
  const reminder = time ? normalizeReminder({ name, date, time, mode, every, until, sound }) : null
  const over = reminder && !nextOccurrence(reminder)
  const permission = notificationPermission()

  const save = async (e) => {
    e?.preventDefault()
    if (!reminder || saving) return
    setSaving(true)
    // From the click, so the browser lets it ask.
    await requestNotificationPermission()
    onSave(reminder)
    onClose()
  }

  const delivery = permission === 'denied'
    ? 'Notifications are blocked for this site, so it shows only inside ArcheSpace.'
    : 'Reminders show while ArcheSpace is open in a browser tab.'

  const dialog = (
    <Modal
      title={initial ? 'Reminder' : 'Add reminder'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <div className="flex items-center gap-2">
          {initial && (
            <button
              type="button"
              onClick={() => { onRemove(); onClose() }}
              className={buttonClass({ variant: 'danger' })}
            >
              {initial.mode === 'permanent' ? 'Turn off' : 'Remove'}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary' })}>
              Cancel
            </button>
            <button type="submit" disabled={!reminder || saving} className={buttonClass({ variant: 'primary' })}>
              Save
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="reminder-name" className={LABEL}>
            Name <span className="font-normal text-text-muted">(optional, shown in the notification)</span>
          </label>
          <input
            id="reminder-name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={MAX_REMINDER_NAME}
            placeholder="e.g. Pay rent"
            className={FIELD}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {quickPicks.map(pick => (
            <button
              key={pick.label}
              type="button"
              onClick={() => setDate(pick.date)}
              aria-pressed={date === pick.date}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                date === pick.date
                  ? 'border-accent-border bg-accent-muted text-accent'
                  : 'border-bg-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {pick.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="reminder-date" className={LABEL}>{mode === 'once' ? 'Date' : 'Starts'}</label>
            <input
              id="reminder-date"
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="reminder-time" className={LABEL}>Time</label>
            <input
              id="reminder-time"
              type="time"
              required
              value={time}
              onChange={e => setTime(e.target.value)}
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <p id="reminder-mode" className={LABEL}>Goes off</p>
          <div
            role="radiogroup"
            aria-labelledby="reminder-mode"
            className="grid grid-cols-3 gap-1 rounded-xl border border-bg-border bg-bg-elevated p-1"
          >
            {REMINDER_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                  mode === m.id
                    ? 'bg-accent text-accent-fg'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {mode !== 'once' && (
          <div className={`grid gap-3 ${mode === 'repeat' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label htmlFor="reminder-every" className={LABEL}>Repeats</label>
              <select
                id="reminder-every"
                value={every}
                onChange={e => setEvery(e.target.value)}
                className={FIELD}
              >
                {REMINDER_EVERY.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            {mode === 'repeat' && (
              <div>
                <label htmlFor="reminder-until" className={LABEL}>Until</label>
                <input
                  id="reminder-until"
                  type="date"
                  required
                  min={date}
                  value={until}
                  onChange={e => setUntil(e.target.value)}
                  className={FIELD}
                />
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2.5 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={sound}
            onChange={e => {
              setSound(e.target.checked)
              if (e.target.checked) playChime()
            }}
            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
          />
          Play a sound when it goes off
        </label>

        {reminder && (
          <p className="text-xs leading-5 text-text-muted">
            {over ? 'This has already gone off for the last time.' : summary(reminder)} {delivery}
          </p>
        )}
      </div>
    </Modal>
  )

  // Above a full-screen item card.
  return createPortal(<div className="relative z-[90]">{dialog}</div>, document.body)
}
