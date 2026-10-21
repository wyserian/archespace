/**
 * reminderNotifications.js - Reminders going off in the browser.
 *
 * The reminders are encrypted, so no server can send them: this tab keeps a
 * timer for each one's next time and shows it while ArcheSpace is open (a
 * repeating one then waits for its next time). When the page isn't in focus
 * it's a browser notification with the reminder's name; in focus, a toast.
 * Either way a short chime plays, unless that reminder has its sound off.
 */
import { nextOccurrence } from './reminder'

// Reminders already shown ("id@time"), shared by this browser's tabs so each
// shows once.
const SHOWN_KEY = 'arche:reminders-shown'
// A reminder missed by up to this much (a sleeping laptop) still shows.
const CATCH_UP_MS = 10 * 60 * 1000
const KEEP_SHOWN_MS = 2 * 24 * 60 * 60 * 1000
// setTimeout's longest delay (about 24 days); later ones wait for a reload.
const MAX_DELAY_MS = 2 ** 31 - 1

/** What a notification says: the reminder's name, or a generic line. */
const reminderText =(reminder) => reminder.name || 'You have a reminder in ArcheSpace'

function loadShown() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

/** Mark a reminder shown; false when another tab already showed it. */
function claim(key) {
  const shown = loadShown()
  if (shown.has(key)) return false
  shown.add(key)
  const cutoff = Date.now() - KEEP_SHOWN_MS
  const kept = [...shown].filter(k => Number(k.split('@')[1]) > cutoff)
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(kept)) } catch { /* storage unavailable */ }
  return true
}

let audio = null

/** A short two-note chime. Browsers block it until the page has had a click
 *  or key press, which unlocking the vault always gives. */
export function playChime() {
  try {
    audio ??= new AudioContext()
    audio.resume()
    const start = audio.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const at = start + i * 0.18
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      tone.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.2, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
      tone.connect(gain).connect(audio.destination)
      tone.start(at)
      tone.stop(at + 0.4)
    })
  } catch {
    // No Web Audio: the reminder still shows, without sound.
  }
}

/** Whether this browser can show notifications at all. */
const notificationsSupported =() => typeof window !== 'undefined' && 'Notification' in window

/** 'granted' | 'denied' | 'default', or 'unsupported'. */
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Ask once (from a click) to show notifications; resolves to the permission. */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/**
 * Set a timer for every reminder's next time. `reminders` is
 * [{ id, reminder }]; `onRemind(reminder, { notified })` runs when one goes
 * off (`notified` when a browser notification was shown) and `onOpen` when
 * that notification is clicked. Returns a function that clears the timers.
 */
export function scheduleReminders(reminders, { onRemind, onOpen }) {
  const timers = new Set()

  const show = (reminder, key) => {
    // Our own chime, for the toast and the notification alike; the
    // notification itself stays silent so it never sounds twice.
    if (reminder.sound !== false) playChime()
    const notify = !document.hasFocus() && notificationPermission() === 'granted'
    if (notify) {
      try {
        const n = new Notification('ArcheSpace', { body: reminderText(reminder), tag: key, icon: '/icon-192.png', silent: true })
        n.onclick = () => { window.focus(); n.close(); onOpen?.() }
      } catch {
        // Some browsers only allow notifications from a service worker.
        onRemind?.(reminder, { notified: false })
        return
      }
    }
    onRemind?.(reminder, { notified: notify })
  }

  // The next time at or after `from`; once it goes off, the one after it.
  const schedule = (id, reminder, from) => {
    const at = nextOccurrence(reminder, new Date(from))?.getTime()
    if (at == null) return
    const key = `${id}@${at}`
    const delay = at - Date.now()
    if (delay > MAX_DELAY_MS) return
    if (loadShown().has(key)) {
      schedule(id, reminder, at + 1)
      return
    }
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (claim(key)) show(reminder, key)
      schedule(id, reminder, at + 1)
    }, Math.max(0, delay))
    timers.add(timer)
  }

  const from = Date.now() - CATCH_UP_MS
  for (const { id, reminder } of reminders || []) schedule(id, reminder, from)
  return () => timers.forEach(clearTimeout)
}
