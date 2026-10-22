import { describe, it, expect } from 'vitest'
import { columnsThatFit } from './columnFit'

describe('columnsThatFit', () => {
  it('drops columns rather than squeeze cards below the minimum', () => {
    expect(columnsThatFit(514, 2)).toBe(1) // tablet beside the sidebar
    expect(columnsThatFit(612, 2)).toBe(2) // two cards of exactly 300px
    expect(columnsThatFit(1056, 3)).toBe(3)
    expect(columnsThatFit(800, 3)).toBe(2)
  })

  it('never goes above the asked count or below one', () => {
    expect(columnsThatFit(2000, 3)).toBe(3)
    expect(columnsThatFit(120, 2)).toBe(1)
  })

  it('uses the asked count until measured, and a smaller minimum for spaces', () => {
    expect(columnsThatFit(0, 3)).toBe(3)
    expect(columnsThatFit(514, 2, 200)).toBe(2)
  })
})
