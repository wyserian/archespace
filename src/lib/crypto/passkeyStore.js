/**
 * passkeyStore.js - Local (IndexedDB) storage for passkey unlock records.
 *
 * The wrapped master key, credential id, and PRF salt live in the browser only -
 * never on the server. They are useless without the enrolled device's passkey
 * (the PRF secret that unwraps the key never leaves the device). Records are
 * scoped by user id so multiple accounts on one browser stay separate. Losing
 * browser storage just means falling back to the vault PIN.
 */
import { openIdb, withStore } from '../idb'

const DB_NAME = 'arche-passkeys'
const STORE = 'passkeys'

const openDb = () => openIdb(DB_NAME, 1, (db) => {
  db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('userId', 'userId', { unique: false })
})
const inStore = (mode, fn) => withStore(openDb, STORE, mode, fn)

/** All passkey records for a user, newest-last (creation order). */
export async function listPasskeyRecords(userId) {
  const rows = await inStore('readonly', store => store.index('userId').getAll(userId))
  return (rows || []).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

export async function savePasskeyRecord(record) {
  await inStore('readwrite', store => { store.put(record) })
}

export async function deletePasskeyRecord(id) {
  await inStore('readwrite', store => { store.delete(id) })
}

/** Merge `patch` into the record with `id` (no-op if it's gone). */
export async function updatePasskeyRecord(id, patch) {
  await inStore('readwrite', store => {
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      if (getReq.result) store.put({ ...getReq.result, ...patch })
    }
  })
}
