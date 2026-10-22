import { describe, it, expect, beforeEach } from 'vitest'
import {
  hideAllItems, hideItem, isContentHidden, isSpaceHidden, revealContent, revealSpace,
  setSpaceLocked, setSpaceLocks,
} from './itemLock'
import { filterGlobalSearch } from './search'

const note = (id, text, locked = false) => ({
  id, type: 'textbox', title: `Note ${id}`, tags: ['home'], content: { text }, locked,
})

describe('locked items', () => {
  beforeEach(() => hideAllItems())

  it('hides a locked item until it is opened, and again after', () => {
    const item = note('a', 'bank details', true)
    expect(isContentHidden(item)).toBe(true)
    revealContent(item)
    expect(isContentHidden(item)).toBe(false)
    hideItem('a')
    expect(isContentHidden(item)).toBe(true)
    revealContent(item)
    hideAllItems()
    expect(isContentHidden(item)).toBe(true)
    expect(isContentHidden(note('b', 'x'))).toBe(false)
  })

  it('hides items in a locked space and its sub-spaces, and opens them together', () => {
    setSpaceLocks([
      { id: 'top', locked: true, parent_id: null },
      { id: 'sub', locked: false, parent_id: 'top' },
      { id: 'open', locked: false, parent_id: null },
    ])
    const inSub = { ...note('x', 'hidden'), space_id: 'sub' }
    expect(isSpaceHidden('sub')).toBe(true)
    expect(isContentHidden(inSub)).toBe(true)
    expect(isContentHidden({ ...note('y', 'shown'), space_id: 'open' })).toBe(false)
    revealContent(inSub)
    expect(isSpaceHidden('top')).toBe(false)
    expect(isContentHidden(inSub)).toBe(false)
    // Locking a space here hides it at once.
    setSpaceLocked('open', true)
    expect(isSpaceHidden('open')).toBe(true)
    revealSpace('open')
    expect(isSpaceHidden('open')).toBe(false)
  })

  it('hides spaces nested deep under a locked space, and opens the whole chain', () => {
    const chain = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`, locked: i === 0 || i === 5, parent_id: i ? `d${i - 1}` : null,
    }))
    setSpaceLocks(chain)
    const deep = { ...note('z', 'deep'), space_id: 'd7' }
    expect(isSpaceHidden('d7')).toBe(true)
    expect(isContentHidden(deep)).toBe(true)
    revealSpace('d7')
    expect(isSpaceHidden('d0')).toBe(false)
    expect(isSpaceHidden('d5')).toBe(false)
    expect(isContentHidden(deep)).toBe(false)
  })

  it('stops at a parent loop', () => {
    setSpaceLocks([
      { id: 'loop-a', locked: false, parent_id: 'loop-b' },
      { id: 'loop-b', locked: false, parent_id: 'loop-a' },
    ])
    expect(isSpaceHidden('loop-a')).toBe(false)
  })

  it('searches a locked item by title and tags only, until opened', () => {
    const items = [note('a', 'bank details', true), note('b', 'bank holiday')]
    const find = (q) => filterGlobalSearch({ spaces: [], items }, q).items.map(i => i.id)
    expect(find('bank')).toEqual(['b'])
    expect(find('Note a')).toEqual(['a'])
    expect(find('home')).toEqual(['a', 'b'])
    revealContent(items[0])
    expect(find('bank')).toEqual(['a', 'b'])
  })
})
