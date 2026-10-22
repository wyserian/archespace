import { describe, it, expect, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from } }))
const { nestingOrder, importSpaces } = await import('./exportImport')
const { sealBackup } = await import('./backupCrypto')
const { MAX_IMPORT_ITEMS_PER_SPACE } = await import('./constants')

describe('importSpaces', () => {
  it('saves nothing when any space is over the item limit', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const note = { type: 'textbox', content: { text: 'x' } }
    const contents = {
      spaces: [
        { name: 'Fine', items: [note] },
        { name: 'Too full', items: Array(MAX_IMPORT_ITEMS_PER_SPACE + 1).fill(note) },
      ],
      items: [],
    }
    const sealed = await sealBackup(contents, key, { salt: 's', wrapped_key: 'w', key_check: 'k' })
    const text = JSON.stringify(sealed)
    const file = { size: text.length, text: async () => text }
    await expect(importSpaces(file, 'user', key)).rejects.toThrow('Too many items in space "Too full"')
    expect(from).not.toHaveBeenCalled()
  })
})

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
