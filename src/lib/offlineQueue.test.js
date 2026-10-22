// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { enqueueOffline, getOfflineQueue } from './offlineQueue'

const edit = (userId, id, title, base) =>
  ({ type: 'item-update', userId, payload: { id, title, base } })

describe('enqueueOffline', () => {
  beforeEach(() => localStorage.clear())

  it('keeps one entry per item, with the latest text and the first base', () => {
    enqueueOffline(edit('u1', 'a', 'first', 'v1'))
    enqueueOffline(edit('u1', 'a', 'second', 'v2'))
    const queue = getOfflineQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].payload).toMatchObject({ title: 'second', base: 'v1' })
  })

  it("keeps other items' and other users' edits apart", () => {
    enqueueOffline(edit('u1', 'a', 'x', 'v1'))
    enqueueOffline(edit('u1', 'b', 'y', 'v1'))
    enqueueOffline(edit('u2', 'a', 'z', 'v1'))
    expect(getOfflineQueue()).toHaveLength(3)
  })
})
