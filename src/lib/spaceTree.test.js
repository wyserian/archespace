import { describe, it, expect } from 'vitest'
import {
  ancestorsOf, chainOf, descendantsOf, moveDestinations, pathOf, rollUpCounts, spacePathLabel, treeOrder,
} from './spaceTree'

// a > b > c > d, a > e, f (top level)
const spaces = [
  { id: 'a', parent_id: null },
  { id: 'b', parent_id: 'a' },
  { id: 'c', parent_id: 'b' },
  { id: 'd', parent_id: 'c' },
  { id: 'e', parent_id: 'a' },
  { id: 'f', parent_id: null },
]
const byId = new Map(spaces.map(s => [s.id, s]))
const parentOf = id => byId.get(id)?.parent_id

describe('spaceTree', () => {
  it('walks up to the top', () => {
    expect(chainOf('d', parentOf)).toEqual(['d', 'c', 'b', 'a'])
    expect(ancestorsOf('d', parentOf)).toEqual(['c', 'b', 'a'])
    expect(ancestorsOf('a', parentOf)).toEqual([])
  })

  it('walks down every level', () => {
    expect(descendantsOf(['a'], spaces).sort()).toEqual(['b', 'c', 'd', 'e'])
    expect(descendantsOf(['b', 'f'], spaces).sort()).toEqual(['c', 'd'])
    expect(descendantsOf(['d'], spaces)).toEqual([])
  })

  it('can stop the walk down at a space', () => {
    expect(descendantsOf(['a'], spaces, s => s.id !== 'c').sort()).toEqual(['b', 'e'])
  })

  it('gives the path from the top', () => {
    expect(pathOf('c', byId).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('labels a space with its path, folded when deep', () => {
    const named = [...spaces, { id: 'z', parent_id: 'd' }].map(s => ({ ...s, name: s.id.toUpperCase() }))
    const namedById = new Map(named.map(s => [s.id, s]))
    expect(spacePathLabel('a', namedById)).toBe('A')
    expect(spacePathLabel('c', namedById)).toBe('A › B › C')
    expect(spacePathLabel('z', namedById)).toBe('A › … › Z')
  })

  it('orders spaces as a tree, by position, with their depth', () => {
    const positioned = spaces.map((s, i) => ({ ...s, position: s.id === 'e' ? -1 : i }))
    expect(treeOrder(positioned).map(({ space, depth }) => `${space.id}${depth}`))
      .toEqual(['a0', 'e1', 'b1', 'c2', 'd3', 'f0'])
  })

  it('offers move destinations in tree order, without excluded or read-only spaces', () => {
    const marked = spaces.map(s => ({ ...s, read_only: s.id === 'e' }))
    expect(moveDestinations(marked, new Set(['b', 'c', 'd'])).map(({ space }) => space.id))
      .toEqual(['a', 'f'])
  })

  it('adds every level\'s count into the spaces above it', () => {
    // a > b > c > d, a > e, f; an archived space "x" isn't listed.
    expect(rollUpCounts({ a: 1, c: 2, d: 3, e: 4, f: 5, x: 9 }, spaces))
      .toEqual({ a: 10, b: 5, c: 5, d: 3, e: 4, f: 5 })
  })

  it('stops at a parent loop', () => {
    const loop = [{ id: 'x', parent_id: 'y' }, { id: 'y', parent_id: 'x' }]
    const loopById = new Map(loop.map(s => [s.id, s]))
    expect(chainOf('x', id => loopById.get(id)?.parent_id)).toEqual(['x', 'y'])
    expect(descendantsOf(['x'], loop)).toEqual(['y'])
  })
})
