import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from './local/localClient'
import { openMemoryStore } from './local/localStore'
import { createOfflineClient } from './offlineCopy'
import { memoryOutbox } from './outbox'
import { isReachable, setReachable } from './connectivity'

// The "server" is the local engine too; `down` makes every request fail as
// supabase-js reports a network failure.
let server
let down
const offlineResult = { data: null, error: { message: 'TypeError: Failed to fetch' } }
function remote() {
  const failing = new Proxy({}, {
    get: (_, prop) => (prop === 'then' ? (ok) => Promise.resolve(offlineResult).then(ok) : () => failing),
  })
  return new Proxy(server, {
    get: (target, prop) => {
      if (down && (prop === 'from' || prop === 'rpc')) return () => failing
      return target[prop]
    },
  })
}

let client
let copy
const serverRows = async (table = 'space_items') => (await server.from(table).select('*').order('created_at')).data
const tick = () => new Promise(r => setTimeout(r, 5))

beforeEach(() => {
  down = false
  setReachable(true)
  server = createLocalClient(async () => openMemoryStore(), { userId: 'u' })
  const outbox = memoryOutbox()
  client = createOfflineClient(remote(), { openStore: async () => openMemoryStore(), openOutbox: () => outbox })
  copy = client.offline
  copy.bind('u')
})

describe('offline copy', () => {
  it('saves changes on the device and sends them when it syncs', async () => {
    down = true
    const { data: item } = await client.from('space_items').insert({ type: 'textbox', title: 'a' }).select().single()
    expect((await client.from('space_items').select('*')).data.map(i => i.title)).toEqual(['a'])
    await copy.sync()
    expect(await copy.pending()).toBe(1)
    expect(isReachable()).toBe(false)

    down = false
    await copy.sync()
    expect(await copy.pending()).toBe(0)
    expect((await serverRows()).map(i => [i.id, i.title])).toEqual([[item.id, 'a']])
    expect(isReachable()).toBe(true)
  })

  it('brings in what changed on the server and drops what went', async () => {
    const { data: row } = await server.from('spaces').insert({ name: 'S' }).select().single()
    await copy.sync()
    expect((await client.from('spaces').select('name')).data).toEqual([{ name: 'S' }])
    expect(Object.keys((await client.from('spaces').select('*')).data[0])).not.toContain('_synced')

    await tick()
    await server.from('spaces').update({ name: 'S2' }).eq('id', row.id)
    await copy.sync()
    expect((await client.from('spaces').select('name')).data).toEqual([{ name: 'S2' }])

    await server.from('spaces').delete().eq('id', row.id)
    await copy.sync()
    expect((await client.from('spaces').select('*')).data).toEqual([])
  })

  it('keeps an edit made on an older version as a copy', async () => {
    copy.setCopyTitle(async title => `${title} (offline copy)`)
    const { data: item } = await client.from('space_items').insert({ type: 'textbox', title: 'v1' }).select().single()
    await copy.sync()

    await tick()
    await server.from('space_items').update({ title: 'theirs' }).eq('id', item.id)
    await client.from('space_items').update({ title: 'mine' }).eq('id', item.id)
    await copy.sync()

    expect((await serverRows()).map(i => i.title).sort()).toEqual(['mine (offline copy)', 'theirs'])
    expect((await client.from('space_items').select('title')).data.map(i => i.title).sort())
      .toEqual(['mine (offline copy)', 'theirs'])
  })

  it('sends a run of edits to one item as one line of versions, with no copies', async () => {
    const { data: item } = await client.from('space_items').insert({ type: 'textbox', title: 'v1' }).select().single()
    await copy.sync()
    await tick()
    await client.from('space_items').update({ title: 'v2' }).eq('id', item.id)
    await tick()
    await client.from('space_items').update({ title: 'v3' }).eq('id', item.id)
    await copy.sync()
    expect((await serverRows()).map(i => i.title)).toEqual(['v3'])
  })

  it('sends what waits before deleting for good, and needs the server for it', async () => {
    const { data: item } = await client.from('space_items').insert({ type: 'textbox', title: 'x' }).select().single()
    down = true
    expect((await client.from('space_items').delete().eq('id', item.id)).error.code).toBe('OFFLINE')
    expect((await client.from('space_items').select('*')).data).toHaveLength(1)

    down = false
    expect((await client.from('space_items').delete().eq('id', item.id)).error).toBeNull()
    expect(await serverRows()).toEqual([])
    expect((await client.from('space_items').select('*')).data).toEqual([])
  })

  it('logs reordering for the server too', async () => {
    const { data: a } = await client.from('spaces').insert({ name: 'a', position: 0 }).select().single()
    const { data: b } = await client.from('spaces').insert({ name: 'b', position: 1 }).select().single()
    await client.rpc('update_space_positions', { updates: [{ id: a.id, position: 1 }, { id: b.id, position: 0 }] })
    await copy.sync()
    expect((await server.from('spaces').select('name').order('position')).data.map(s => s.name)).toEqual(['b', 'a'])
  })
})
