/**
 * outbox.js - Changes made to this device's offline copy that the server
 * hasn't had yet, in the order they were made (see offlineCopy.js). Each
 * holds only what the server would store: ciphertext and plain metadata.
 */
import { openIdb, withStore } from './idb'
import { eraseLocalData } from './local/localStore'

const outboxName = (userId) => `archespace-outbox-${userId}`

/** The outbox of `userId`, kept in IndexedDB. */
export function openOutbox(userId) {
  const open = () => openIdb(outboxName(userId), 1, (db) => {
    db.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true })
  })
  const inOps = (mode, fn) => withStore(open, 'ops', mode, fn)
  return {
    /** Every change waiting, oldest first. */
    all: async () => (await inOps('readonly', store => store.getAll())) || [],
    add: (op) => inOps('readwrite', (store) => { store.add(op) }),
    put: (op) => inOps('readwrite', (store) => { store.put(op) }),
    remove: (seq) => inOps('readwrite', (store) => { store.delete(seq) }),
    erase: () => eraseLocalData(outboxName(userId)),
  }
}

/** An outbox in memory (tests). */
export function memoryOutbox() {
  const ops = new Map()
  let seq = 0
  return {
    all: async () => [...ops.values()],
    add: async (op) => { seq += 1; ops.set(seq, structuredClone({ ...op, seq })) },
    put: async (op) => { ops.set(op.seq, structuredClone(op)) },
    remove: async (key) => { ops.delete(key) },
    erase: async () => { ops.clear() },
  }
}
