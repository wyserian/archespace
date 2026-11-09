import { describe, it, expect } from 'vitest'
import { expiresSoon, formatExpiresIn, isExpired, withoutExpired } from './expiry'
import { holdsExpired } from '../hooks/useExpirySweep'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const at = ms => new Date(NOW + ms).toISOString()
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('expiry', () => {
  it('counts a passed time as expired, and none or a bad one as not', () => {
    expect(isExpired({ expires_at: at(-1) }, NOW)).toBe(true)
    expect(isExpired({ expires_at: at(0) }, NOW)).toBe(true)
    expect(isExpired({ expires_at: at(1) }, NOW)).toBe(false)
    expect(isExpired({ expires_at: null }, NOW)).toBe(false)
    expect(isExpired({ expires_at: 'soon' }, NOW)).toBe(false)
    expect(isExpired({}, NOW)).toBe(false)
    expect(withoutExpired([{ id: 1, expires_at: at(-1) }, { id: 2 }], NOW)).toEqual([{ id: 2 }])
  })

  it('says how long is left in short words', () => {
    expect(formatExpiresIn(at(30 * 1000), NOW)).toBe('now')
    expect(formatExpiresIn(at(45 * MIN), NOW)).toBe('in 45 min')
    expect(formatExpiresIn(at(5 * HOUR), NOW)).toBe('in 5 h')
    expect(formatExpiresIn(at(DAY), NOW)).toBe('in 1 day')
    expect(formatExpiresIn(at(DAY - 5 * 1000), NOW)).toBe('in 1 day')
    expect(formatExpiresIn(at(3 * DAY), NOW)).toBe('in 3 days')
    expect(formatExpiresIn(at(60 * DAY), NOW)).toMatch(/^on /)
    expect(expiresSoon(at(23 * HOUR), NOW)).toBe(true)
    expect(expiresSoon(at(2 * DAY), NOW)).toBe(false)
  })

  it('finds expired rows in cached lists, plain or grouped', () => {
    expect(holdsExpired([{ expires_at: at(-1) }], NOW)).toBe(true)
    expect(holdsExpired({ spaces: [], items: [{ expires_at: at(-1) }] }, NOW)).toBe(true)
    expect(holdsExpired([{ expires_at: at(HOUR) }], NOW)).toBe(false)
    expect(holdsExpired(null, NOW)).toBe(false)
    expect(holdsExpired({ count: 3 }, NOW)).toBe(false)
  })
})
