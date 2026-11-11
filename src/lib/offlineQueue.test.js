// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { enqueueOffline, flushOfflineQueue, getOfflineQueue } from './offlineQueue'

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

describe('flushOfflineQueue', () => {
  beforeEach(() => localStorage.clear())

  it('removes what it sent, keeping edits queued or changed while sending', async () => {
    enqueueOffline(edit('u1', 'a', 'first', 'v1'))
    enqueueOffline(edit('u1', 'b', 'x', 'v1'))
    const flushed = await flushOfflineQueue(async (entry) => {
      if (entry.payload.id === 'a') {
        enqueueOffline(edit('u1', 'c', 'new', 'v1')) // queued while sending
        enqueueOffline(edit('u1', 'a', 'second', 'v2')) // a changed again
      }
      return true
    })
    expect(flushed).toBe(2)
    expect(getOfflineQueue().map(e => e.payload.title).sort()).toEqual(['new', 'second'])
  })

  it('keeps what failed', async () => {
    enqueueOffline(edit('u1', 'a', 'x', 'v1'))
    await flushOfflineQueue(async () => false)
    await flushOfflineQueue(async () => { throw new Error('offline') })
    expect(getOfflineQueue()).toHaveLength(1)
  })
})
