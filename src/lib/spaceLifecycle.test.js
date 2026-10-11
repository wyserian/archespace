import { describe, it, expect, beforeEach, vi } from 'vitest'

// Run against the local-mode database, which mirrors the server's tables.
vi.mock('./supabase', async () => {
  const { createLocalClient } = await import('./local/localClient')
  const { openMemoryStore } = await import('./local/localStore')
  return { supabase: createLocalClient(async () => openMemoryStore()) }
})

const { supabase } = await import('./supabase')
const {
  archiveSpaces, binArchivedSpaces, deleteSpaces, restoreSpaces, reviveItemSpaces, unarchiveSpaces,
} = await import('./spaceLifecycle')

// a > b > c > d, with an item in each; e on its own.
async function seed() {
  await supabase.from('space_items').delete().neq('id', '')
  await supabase.from('spaces').delete().neq('id', '')
  const ids = {}
  let parent = null
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    const { data } = await supabase.from('spaces')
      .insert({ name, parent_id: name === 'e' ? null : parent }).select().single()
    ids[name] = data.id
    if (name !== 'e') parent = data.id
    const { data: item } = await supabase.from('space_items')
      .insert({ space_id: data.id, type: 'textbox' }).select().single()
    ids[`${name}Item`] = item.id
  }
  return ids
}

async function state() {
  const { data: spaces } = await supabase.from('spaces').select('id, name, deleted_at, archived_at')
  const { data: items } = await supabase.from('space_items').select('id, space_id, deleted_at, archived_at')
  const of = rows => Object.fromEntries(rows.map(r => [r.name ?? r.id, r.deleted_at ? 'bin' : r.archived_at ? 'archive' : 'active']))
  return { spaces: of(spaces), items: Object.fromEntries(items.map(i => [i.id, of([i])[i.id]])) }
}

describe('spaceLifecycle', () => {
  let ids
  beforeEach(async () => { ids = await seed() })

  it('deletes a space with every level below it, and restores them together', async () => {
    await deleteSpaces([ids.b])
    expect((await state()).spaces).toEqual({ a: 'active', b: 'bin', c: 'bin', d: 'bin', e: 'active' })
    await restoreSpaces([ids.b])
    expect((await state()).spaces).toEqual({ a: 'active', b: 'active', c: 'active', d: 'active', e: 'active' })
  })

  it('leaves a sub-space deleted on its own in the bin when its parent comes back', async () => {
    await deleteSpaces([ids.c])
    await new Promise(r => setTimeout(r, 5))
    await deleteSpaces([ids.a])
    await restoreSpaces([ids.a])
    expect((await state()).spaces).toEqual({ a: 'active', b: 'active', c: 'bin', d: 'bin', e: 'active' })
  })

  it('restoring a deep space brings back the removed spaces above it, not their other contents', async () => {
    await deleteSpaces([ids.a])
    await restoreSpaces([ids.c])
    expect((await state()).spaces).toEqual({ a: 'active', b: 'active', c: 'active', d: 'active', e: 'active' })

    await archiveSpaces([ids.a])
    await new Promise(r => setTimeout(r, 5))
    await unarchiveSpaces([ids.d])
    const { spaces, items } = await state()
    expect(spaces).toEqual({ a: 'active', b: 'active', c: 'active', d: 'active', e: 'active' })
    expect(items[ids.dItem]).toBe('active')
  })

  it('archives the items of every level and brings back only those archived with it', async () => {
    await supabase.from('space_items').update({ archived_at: new Date(0).toISOString() }).eq('id', ids.cItem)
    await archiveSpaces([ids.b])
    let { spaces, items } = await state()
    expect(spaces).toMatchObject({ b: 'archive', c: 'archive', d: 'archive' })
    expect(items[ids.dItem]).toBe('archive')
    await unarchiveSpaces([ids.b])
    ;({ spaces, items } = await state())
    expect(spaces).toMatchObject({ b: 'active', c: 'active', d: 'active' })
    expect(items[ids.dItem]).toBe('active')
    expect(items[ids.cItem]).toBe('archive') // archived on its own earlier
  })

  it('moves an archived subtree to the bin together', async () => {
    await archiveSpaces([ids.b])
    await binArchivedSpaces([ids.b])
    const { spaces, items } = await state()
    expect(spaces).toMatchObject({ a: 'active', b: 'bin', c: 'bin', d: 'bin' })
    expect(items[ids.dItem]).toBe('bin')
  })

  it('restoring an item brings back the removed spaces it lives in', async () => {
    await deleteSpaces([ids.b])
    await supabase.from('space_items').update({ deleted_at: new Date().toISOString() }).eq('id', ids.dItem)
    await supabase.from('space_items').update({ deleted_at: null }).eq('id', ids.dItem)
    await reviveItemSpaces([ids.dItem])
    expect((await state()).spaces).toEqual({ a: 'active', b: 'active', c: 'active', d: 'active', e: 'active' })
  })

  it('hard-deleting a space removes every level below it', async () => {
    await supabase.from('spaces').delete().eq('id', ids.a)
    const { data } = await supabase.from('spaces').select('name')
    expect(data.map(s => s.name)).toEqual(['e'])
  })
})
