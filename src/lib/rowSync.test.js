import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { supabase } from './supabase'
import { loadRows } from './offlineCache'
import { fetchRows } from './rowSync'

vi.mock('./supabase', async () => {
  const { createLocalClient } = await import('./local/localClient')
  const { openMemoryStore } = await import('./local/localStore')
  return { supabase: createLocalClient(async () => openMemoryStore()) }
})
vi.mock('./offlineCache', () => ({ loadRows: vi.fn() }))

const query = q => q.is('deleted_at', null).order('position', { ascending: true })
const list = () => fetchRows({ table: 'spaces', query, userId: 'u', cacheKey: 'spaces' })

// The columns of each select, and the ids of each follow-up lookup.
let requests
let spy
afterEach(() => spy.mockRestore())
beforeEach(() => {
  requests = []
  const from = supabase.from.bind(supabase)
  spy = vi.spyOn(supabase, 'from').mockImplementation((table) => {
    const q = from(table)
    const select = q.select.bind(q)
    const ids = q.in.bind(q)
    q.select = (columns) => { requests.push(columns); return select(columns) }
    q.in = (col, values) => { requests.push(values); return ids(col, values) }
    return q
  })
})

describe('fetchRows', () => {
  it('downloads in full only new and changed rows, and drops removed ones', async () => {
    const { data: rows } = await supabase.from('spaces')
      .insert(Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, position: i }))).select()
    const kept = rows.map(r => (r.name === 'S1' ? { ...r, name: 'old', updated_at: 'before' } : r))
    await supabase.from('spaces').delete().eq('name', 'S2')
    const { data: added } = await supabase.from('spaces').insert({ name: 'S9', position: 9 }).select().single()
    loadRows.mockResolvedValue(kept)
    requests = []

    const { data: expected } = await query(supabase.from('spaces').select('*'))
    requests = []
    expect(await list()).toEqual(expected)
    expect(requests).toEqual(['id, updated_at', '*', [rows[1].id, added.id]])
  })

  it('downloads everything without a kept copy, or when most rows changed', async () => {
    await supabase.from('spaces').insert([{ name: 'A', position: 0 }, { name: 'B', position: 1 }])
    loadRows.mockResolvedValue(null)
    await list()
    expect(requests).toEqual(['*'])

    requests = []
    loadRows.mockResolvedValue([{ id: 'gone', updated_at: 'x' }])
    expect((await list()).map(s => s.name)).toEqual(expect.arrayContaining(['A', 'B']))
    expect(requests).toEqual(['id, updated_at', '*'])
  })
})
