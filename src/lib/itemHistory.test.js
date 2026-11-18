import { describe, it, expect } from 'vitest'
import { EMPTY_HISTORY, recordEdit, afterUndo, afterRedo, withoutTop } from './itemHistory'

describe('item history', () => {
  it('records content edits in order, skipping saves that changed nothing', () => {
    let h = recordEdit(EMPTY_HISTORY, 'a', { text: '1' }, { text: '2' })
    h = recordEdit(h, 'a', { text: '2' }, { text: '2' })
    h = recordEdit(h, 'b', { text: 'x' }, { text: 'y' })
    expect(h.past.map(s => [s.id, s.after.text])).toEqual([['a', '2'], ['b', 'y']])
  })

  it('undoes and redoes one step at a time, and a new edit ends redo', () => {
    let h = recordEdit(EMPTY_HISTORY, 'a', { text: '1' }, { text: '2' })
    h = recordEdit(h, 'b', { text: 'x' }, { text: 'y' })
    h = afterUndo(h)
    expect(h.past.map(s => s.id)).toEqual(['a'])
    expect(h.future.map(s => s.id)).toEqual(['b'])
    h = afterRedo(h)
    expect(h.past.map(s => s.id)).toEqual(['a', 'b'])
    h = recordEdit(afterUndo(h), 'a', { text: '2' }, { text: '3' })
    expect(h.future).toEqual([])
  })

  it('keeps the latest 100 steps, and drops one that can no longer apply', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < 105; i++) h = recordEdit(h, 'a', { n: i }, { n: i + 1 })
    expect(h.past).toHaveLength(100)
    expect(h.past[0].before.n).toBe(5)
    expect(withoutTop(h, 'past').past).toHaveLength(99)
  })
})
