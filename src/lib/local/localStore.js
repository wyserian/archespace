/**
 * localStore.js - Local mode's tables, kept in this browser's IndexedDB.
 *
 * Each table is loaded into memory once and written through on every change,
 * so queries are plain array work. Rows hold the same (encrypted) values the
 * server would.
 */
import { openIdb } from '../idb'

const DB_NAME = 'archespace-local'
const DB_VERSION = 1

/** The tables and their primary keys. */
export const TABLES = {
  spaces: 'id',
  space_items: 'id',
  user_encryption: 'user_id',
  user_settings: 'user_id',
}

function openDb(name) {
  return openIdb(name, DB_VERSION, (db) => {
    for (const [table, keyPath] of Object.entries(TABLES)) {
      if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath })
    }
  })
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

/**
 * An IndexedDB-backed store (local mode's own database by default, or `name`):
 * `tables[name]` is a Map of key -> row, `save` / `remove` write changes
 * through, and `reload` reads every table again (after another tab wrote).
 */
export async function openIndexedDbStore(name = DB_NAME) {
  const db = await openDb(name)
  const tables = Object.fromEntries(Object.keys(TABLES).map(t => [t, new Map()]))
  const reload = async () => {
    for (const table of Object.keys(TABLES)) {
      const tx = db.transaction(table, 'readonly')
      const rows = await new Promise((resolve, reject) => {
        const req = tx.objectStore(table).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      tables[table].clear()
      for (const row of rows) tables[table].set(row[TABLES[table]], row)
    }
  }
  await reload()
  return {
    tables,
    reload,
    async save(table, rows) {
      const tx = db.transaction(table, 'readwrite')
      for (const row of rows) tx.objectStore(table).put(row)
      await done(tx)
    },
    async remove(table, keys) {
      const tx = db.transaction(table, 'readwrite')
      for (const key of keys) tx.objectStore(table).delete(key)
      await done(tx)
    },
  }
}

/** A store that lives only in memory (tests). */
export function openMemoryStore() {
  const tables = Object.fromEntries(Object.keys(TABLES).map(t => [t, new Map()]))
  return { tables, async save() {}, async remove() {}, async reload() {} }
}

/** Delete everything local mode (or the database `name`) has stored in this browser. */
export function eraseLocalData(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    // Another tab has it open; it's deleted once that tab closes.
    req.onblocked = () => resolve()
  })
}
