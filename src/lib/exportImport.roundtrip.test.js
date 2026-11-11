// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

// Run against the local-mode database, which mirrors the server's tables.
vi.mock('./supabase', async () => {
  const { createLocalClient } = await import('./local/localClient')
  const { openMemoryStore } = await import('./local/localStore')
  return { supabase: createLocalClient(async () => openMemoryStore()) }
})
vi.mock('./auditLog', () => ({ logAudit: async () => {} }))
vi.mock('./crypto/vault', () => ({
  getVaultBackupMeta: async () => ({ salt: 's', wrapped_key: 'w', key_check: 'k' }),
}))

const { supabase } = await import('./supabase')
const { exportSpaces, importSpaces } = await import('./exportImport')
const { encryptItem, encryptSpace, decryptItems } = await import('./dataProtection')

describe('backup round trip', () => {
  it("keeps an item's tags, star and colour, and counts unreadable items", async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const { data: space } = await supabase.from('spaces')
      .insert(await encryptSpace({ name: 'S', description: '', tags: [] }, key)).select().single()
    await supabase.from('space_items').insert([
      { space_id: space.id, type: 'textbox', starred: true, color: 'rose',
        ...(await encryptItem({ title: 'T', content: { text: 'x' }, tags: ['work'] }, key)) },
      { space_id: space.id, type: 'textbox', title: 'arc1:broken', content: {} },
    ])

    let blob
    URL.createObjectURL = (b) => { blob = b; return 'blob:x' }
    URL.revokeObjectURL = () => {}
    HTMLAnchorElement.prototype.click = () => {} // no download in jsdom
    const { unreadable } = await exportSpaces([{ ...space, name: 'S' }], key)
    expect(unreadable).toBe(1)

    await supabase.from('space_items').delete().neq('id', '')
    await supabase.from('spaces').delete().neq('id', '')
    await importSpaces(new File([await blob.text()], 'b.json'), 'user', key)

    const { data } = await supabase.from('space_items').select('*')
    const [item] = await decryptItems(data, key)
    expect(item).toMatchObject({ title: 'T', tags: ['work'], starred: true, color: 'rose' })
  })

  it('keeps the order of spaces and items, and a space\'s star and read-only', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    await supabase.from('space_items').delete().neq('id', '')
    await supabase.from('spaces').delete().neq('id', '')
    const space = async (name, position, extra = {}) => (await supabase.from('spaces')
      .insert({ ...(await encryptSpace({ name, description: '', tags: [] }, key)), position, ...extra })
      .select().single()).data
    const a = await space('A', 0, { starred: true })
    const b = await space('B', 1)
    for (const [title, position] of [['second', 1], ['first', 0]]) {
      await supabase.from('space_items').insert({ space_id: b.id, type: 'textbox', position,
        ...(await encryptItem({ title, content: { text: '' } }, key)) })
    }
    await supabase.from('spaces').update({ read_only: true }).eq('id', b.id)
    const { data: listed } = await supabase.from('spaces').select('*').order('position', { ascending: true })

    let blob
    URL.createObjectURL = (x) => { blob = x; return 'blob:x' }
    await exportSpaces(listed.map(s => ({ ...s, name: s.id === a.id ? 'A' : 'B' })), key)
    await supabase.from('spaces').update({ read_only: false }).eq('id', b.id)
    await supabase.from('space_items').delete().neq('id', '')
    await supabase.from('spaces').delete().neq('id', '')
    await importSpaces(new File([await blob.text()], 'b.json'), 'user', key)

    const { data: spaces } = await supabase.from('spaces').select('*').order('position', { ascending: true })
    expect(spaces.map(s => [s.starred, s.read_only])).toEqual([[true, false], [false, true]])
    const { data: items } = await supabase.from('space_items').select('*').order('position', { ascending: true })
    expect((await decryptItems(items, key)).map(i => i.title)).toEqual(['first', 'second'])
  })
})
