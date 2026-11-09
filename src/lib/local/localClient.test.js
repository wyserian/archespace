import { describe, it, expect } from 'vitest'
import { createLocalClient } from './localClient'
import { openMemoryStore } from './localStore'
import { LOCAL_USER } from '../localMode'

const client = () => createLocalClient(async () => openMemoryStore())

describe('local client', () => {
  it('inserts with defaults and reads back with filters, order and limits', async () => {
    const db = client()
    const { data: space } = await db.from('spaces').insert({ name: 'A', position: 1 }).select().single()
    expect(space).toMatchObject({ name: 'A', user_id: LOCAL_USER.id, pinned: false, deleted_at: null, tags: [] })
    expect(space.id).toBeTruthy()
    await db.from('spaces').insert([{ name: 'B', position: 0, pinned: true }, { name: 'C', position: 2 }])

    const { data } = await db.from('spaces').select('name').is('deleted_at', null)
      .order('pinned', { ascending: false }).order('position', { ascending: true })
    expect(data.map(s => s.name)).toEqual(['B', 'A', 'C'])
    expect(data[0]).toEqual({ name: 'B' })

    const { count } = await db.from('spaces').select('id', { count: 'exact', head: true }).eq('pinned', false)
    expect(count).toBe(2)
    const { data: none, error } = await db.from('spaces').select().eq('name', 'Z').maybeSingle()
    expect(none).toBeNull()
    expect(error).toBeNull()
    expect((await db.from('spaces').select().single()).error.code).toBe('PGRST116')
  })

  it('updates, soft-deletes and cascades a hard delete to sub-spaces and items', async () => {
    const db = client()
    const { data: parent } = await db.from('spaces').insert({ name: 'P' }).select().single()
    const { data: child } = await db.from('spaces').insert({ name: 'C', parent_id: parent.id }).select().single()
    await db.from('space_items').insert([{ space_id: child.id, type: 'textbox' }, { space_id: null, type: 'textbox' }])

    await db.from('spaces').update({ deleted_at: new Date().toISOString() }).in('id', [parent.id])
    expect((await db.from('spaces').select().not('deleted_at', 'is', null)).data).toHaveLength(1)

    await db.from('spaces').delete().eq('id', parent.id)
    expect((await db.from('spaces').select()).data).toHaveLength(0)
    const { data: items } = await db.from('space_items').select()
    expect(items).toHaveLength(1)
    expect(items[0].space_id).toBeNull()
  })

  it('hides expired rows, and purge_expired removes them with what they hold', async () => {
    const db = client()
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { data: gone } = await db.from('spaces').insert({ name: 'Gone', expires_at: past }).select().single()
    await db.from('spaces').insert([{ name: 'Child', parent_id: gone.id }, { name: 'Later', expires_at: future }])
    await db.from('space_items').insert([
      { space_id: gone.id, type: 'textbox' },
      { space_id: null, type: 'textbox', expires_at: past },
      { space_id: null, type: 'textbox' },
    ])
    const names = async () => (await db.from('spaces').select('name')).data.map(s => s.name).sort()

    // As the "Hide expired" policies: the expired rows themselves are out of reach.
    expect(await names()).toEqual(['Child', 'Later'])
    expect((await db.from('space_items').select()).data).toHaveLength(2)
    await db.from('space_items').update({ title: 'x' }).not('expires_at', 'is', null)
    expect((await db.from('space_items').select().eq('title', 'x')).data).toHaveLength(0)

    expect((await db.rpc('purge_expired')).error).toBeNull()
    expect(await names()).toEqual(['Later'])
    const { data: items } = await db.from('space_items').select()
    expect(items).toHaveLength(1)
    expect(items[0].expires_at).toBeNull()
  })

  it('guards read-only spaces like the database', async () => {
    const db = client()
    const { data: space } = await db.from('spaces').insert({ name: 'R' }).select().single()
    const { data: item } = await db.from('space_items').insert({ space_id: space.id, type: 'textbox', title: 't' }).select().single()
    await db.from('spaces').update({ read_only: true }).eq('id', space.id)

    expect((await db.from('spaces').update({ name: 'X' }).eq('id', space.id)).error.code).toBe('P0R01')
    expect((await db.from('space_items').update({ title: 'x' }).eq('id', item.id)).error.code).toBe('P0R01')
    expect((await db.from('space_items').insert({ space_id: space.id, type: 'textbox' })).error.code).toBe('P0R01')
    // Pinning and starring stay allowed.
    expect((await db.from('space_items').update({ pinned: true }).eq('id', item.id)).error).toBeNull()
    expect((await db.from('spaces').update({ starred: true }).eq('id', space.id)).error).toBeNull()
  })

  it('reorders, locks the PIN after five failures and keeps the vault row', async () => {
    const db = client()
    const { data: a } = await db.from('spaces').insert({ name: 'A', position: 0 }).select().single()
    await db.rpc('update_space_positions', { updates: [{ id: a.id, position: 5 }] })
    expect((await db.from('spaces').select('position').eq('id', a.id).single()).data.position).toBe(5)

    await db.from('user_encryption').upsert({ user_id: LOCAL_USER.id, salt: 's', key_check: 'k' })
    for (let i = 0; i < 5; i++) await db.rpc('record_vault_pin_unlock_failure')
    expect((await db.rpc('get_vault_pin_lock_status')).data.locked).toBe(true)
    await db.rpc('record_vault_pin_unlock_success')
    expect((await db.rpc('get_vault_pin_lock_status')).data.locked).toBe(false)
    expect((await db.rpc('delete_current_user')).error).toBeTruthy()
  })

  it('keeps recycle bin entries however old they are', async () => {
    const store = openMemoryStore()
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
    store.tables.space_items.set('old', { id: 'old', deleted_at: old })
    store.tables.spaces.set('gone', { id: 'gone', deleted_at: old })
    const db = createLocalClient(async () => store)
    expect((await db.from('space_items').select('id')).data).toEqual([{ id: 'old' }])
    expect((await db.from('spaces').select('id')).data).toEqual([{ id: 'gone' }])
  })

  it('is always signed in as the local user', async () => {
    const db = client()
    expect((await db.auth.getSession()).data.session.user.id).toBe(LOCAL_USER.id)
    expect((await db.auth.signInWithPassword({})).error).toBeTruthy()
  })
})
