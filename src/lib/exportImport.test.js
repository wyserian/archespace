import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { nestingOrder } = await import('./exportImport')

describe('nestingOrder', () => {
  it('imports parents before their sub-spaces, at every level', () => {
    // Listed children first: c (in b), b (in a), a, d (top level).
    const spaces = [
      { key: 2, parentKey: 1 },
      { key: 1, parentKey: 0 },
      { key: 0 },
      { key: 3 },
    ]
    const order = nestingOrder(spaces)
    expect(order).toHaveLength(4)
    const position = new Map(order.map(([i], n) => [i, n]))
    expect(position.get(2)).toBeLessThan(position.get(1))
    expect(position.get(1)).toBeLessThan(position.get(0))
    expect(Object.fromEntries(order)).toEqual({ 0: 1, 1: 2, 2: null, 3: null })
  })

  it('imports an older backup (no keys) flat', () => {
    expect(nestingOrder([{ name: 'a' }, { name: 'b' }])).toEqual([[0, null], [1, null]])
  })

  it('breaks a parent loop or a missing parent at the top level', () => {
    const order = Object.fromEntries(nestingOrder([
      { key: 'a', parentKey: 'b' },
      { key: 'b', parentKey: 'a' },
      { key: 'c', parentKey: 'missing' },
    ]))
    expect(order[2]).toBeNull()
    expect([order[0], order[1]].filter(p => p == null)).toHaveLength(1)
  })
})
