import { describe, it, expect } from 'vitest'
import {
  addDays, compareReminders, currentOccurrence, defaultReminder, describeRepeat, formatDate, formatReminder, isPast,
  isReminderNow, nextOccurrence, normalizeReminder, reminderGroup,
} from './reminder'

// Tuesday 6 October 2026, 10:30 local time.
const NOW = new Date(2026, 9, 6, 10, 30)
const once = (date, time = '09:00') => normalizeReminder({ date, time })
const repeat = (date, every, until, time = '09:00') => normalizeReminder({ date, time, mode: 'repeat', every, until })
const permanent = (date, every, time = '09:00') => normalizeReminder({ date, time, mode: 'permanent', every })

describe('normalizeReminder', () => {
  it('keeps a valid reminder, its name trimmed', () => {
    expect(normalizeReminder({ name: ' Pay rent ', date: '2026-10-07', time: '14:00' })).toEqual({
      name: 'Pay rent', date: '2026-10-07', time: '14:00', mode: 'once', every: null, until: null, sound: true,
    })
  })

  it('keeps the sound on unless turned off', () => {
    expect(normalizeReminder({ date: '2026-10-07' }).sound).toBe(true)
    expect(normalizeReminder({ date: '2026-10-07', sound: false }).sound).toBe(false)
  })

  it('drops anything malformed', () => {
    expect(normalizeReminder(null)).toBe(null)
    expect(normalizeReminder({ date: '7 Oct' })).toBe(null)
    expect(normalizeReminder({ date: '2026-02-31' })).toBe(null)
  })

  it('fills in sensible defaults', () => {
    expect(normalizeReminder({ date: '2026-10-07', time: '25:00', mode: 'x' }))
      .toMatchObject({ time: '09:00', mode: 'once', every: null })
    expect(normalizeReminder({ date: '2026-10-07', mode: 'permanent' }))
      .toMatchObject({ every: 'day', until: null })
  })

  it('never ends a repeat before it starts', () => {
    expect(repeat('2026-10-07', 'day', '2026-10-01').until).toBe('2026-10-07')
    expect(repeat('2026-10-07', 'day', 'soon').until).toBe('2026-10-07')
  })
})

describe('defaultReminder', () => {
  it('is 9:00 today, or the next full hour once that has passed', () => {
    expect(defaultReminder(new Date(2026, 9, 6, 7, 0))).toMatchObject({ date: '2026-10-06', time: '09:00', mode: 'once' })
    expect(defaultReminder(NOW)).toMatchObject({ date: '2026-10-06', time: '11:00' })
    expect(defaultReminder(new Date(2026, 9, 6, 23, 10))).toMatchObject({ date: '2026-10-07', time: '09:00' })
  })
})

describe('occurrences', () => {
  it('goes off once', () => {
    expect(nextOccurrence(once('2026-10-07', '14:00'), NOW)).toEqual(new Date(2026, 9, 7, 14, 0))
    expect(nextOccurrence(once('2026-10-06', '09:00'), NOW)).toBe(null)
    expect(isPast(once('2026-10-06', '09:00'), NOW)).toBe(true)
  })

  it('repeats daily until its end day', () => {
    const r = repeat('2026-10-01', 'day', '2026-10-08')
    expect(nextOccurrence(r, NOW)).toEqual(new Date(2026, 9, 7, 9, 0))
    expect(nextOccurrence(r, new Date(2026, 9, 8, 8, 0))).toEqual(new Date(2026, 9, 8, 9, 0))
    expect(nextOccurrence(r, new Date(2026, 9, 8, 10, 0))).toBe(null)
    expect(currentOccurrence(r, new Date(2026, 9, 9))).toEqual(new Date(2026, 9, 8, 9, 0))
  })

  it('repeats weekly, monthly and yearly', () => {
    expect(nextOccurrence(permanent('2026-09-01', 'week'), NOW)).toEqual(new Date(2026, 9, 13, 9, 0))
    expect(nextOccurrence(permanent('2026-01-15', 'month'), NOW)).toEqual(new Date(2026, 9, 15, 9, 0))
    expect(nextOccurrence(permanent('2020-03-01', 'year'), NOW)).toEqual(new Date(2027, 2, 1, 9, 0))
  })

  it('goes off on the last day of a shorter month', () => {
    const r = permanent('2026-01-31', 'month')
    expect(nextOccurrence(r, new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28, 9, 0))
    expect(nextOccurrence(r, new Date(2026, 2, 1))).toEqual(new Date(2026, 2, 31, 9, 0))
  })

  it('never ends when permanent', () => {
    const r = permanent('2020-01-01', 'day')
    expect(isPast(r, NOW)).toBe(false)
    expect(nextOccurrence(r, NOW)).toEqual(new Date(2026, 9, 7, 9, 0))
  })
})

describe('grouping', () => {
  it('groups by the next time it goes off', () => {
    expect(reminderGroup(once('2026-10-05'), NOW)).toBe('past')
    expect(reminderGroup(once('2026-10-06', '18:00'), NOW)).toBe('today')
    expect(reminderGroup(permanent('2026-01-01', 'day'), NOW)).toBe('tomorrow')
    expect(reminderGroup(once('2026-10-13'), NOW)).toBe('week')
    expect(reminderGroup(once('2026-10-14'), NOW)).toBe('later')
  })

  it('counts past and today as now', () => {
    expect(isReminderNow(once('2026-10-05'), NOW)).toBe(true)
    expect(isReminderNow(permanent('2026-01-01', 'day', '23:00'), NOW)).toBe(true)
    expect(isReminderNow(once('2026-10-07'), NOW)).toBe(false)
  })

  it('sorts by the next time', () => {
    const list = [once('2026-10-09'), permanent('2026-01-01', 'day', '20:00'), once('2026-10-08')]
    expect(list.sort((a, b) => compareReminders(a, b, NOW)).map(r => r.date))
      .toEqual(['2026-01-01', '2026-10-08', '2026-10-09'])
  })
})

describe('labels', () => {
  it('says today, tomorrow and yesterday', () => {
    expect(formatReminder(once('2026-10-06', '18:00'), NOW)).toMatch(/^Today /)
    expect(formatReminder(once('2026-10-07'), NOW)).toMatch(/^Tomorrow /)
    expect(formatReminder(once('2026-10-05'), NOW)).toMatch(/^Yesterday /)
  })

  it('describes how it repeats', () => {
    expect(describeRepeat(once('2026-10-07'), NOW)).toBe('Once')
    // The date follows the locale ("12 Nov" or "Nov 12").
    expect(describeRepeat(repeat('2026-10-07', 'day', '2026-11-12'), NOW))
      .toBe(`Daily until ${formatDate('2026-11-12', NOW)}`)
    expect(describeRepeat(permanent('2026-10-07', 'week'), NOW)).toBe('Weekly, until turned off')
  })

  it('adds days across months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})
