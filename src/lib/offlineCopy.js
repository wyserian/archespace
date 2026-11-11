/**
 * offlineCopy.js - The client the app uses when signed in to an account.
 *
 * Spaces and items live in an offline copy on this device: the account's
 * rows exactly as the server stores them (encrypted), kept by the local-mode
 * engine (local/localClient.js), which applies the same defaults and rules
 * as the database. Every screen reads the copy, so it opens at once with or
 * without a connection. Every change goes to the copy first and into the
 * outbox (outbox.js); a sync sends the outbox to the server, then brings the
 * copy up to date with what changed there. Auth, the vault and settings go
 * straight to the server.
 *
 * When the same thing changed on two devices: an item's text or content
 * edited here on a version that changed meanwhile is kept as a copy beside
 * it; any other change made last wins. Deleting for good needs the server: it
 * sends what's waiting first, then deletes there, then here.
 */
import { createLocalClient } from './local/localClient'
import { isNetworkError, setReachable } from './connectivity'

const SYNCED = new Set(['spaces', 'space_items'])
const LOGGED_RPC = new Set(['update_space_positions', 'update_item_positions'])
const METHODS = [
  'select', 'insert', 'upsert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'not', 'match',
  'order', 'limit', 'range', 'single', 'maybeSingle',
]
const PAGE = 1000 // rows per request, the server's most
const ID_CHUNK = 100 // ids per follow-up request, so its URL stays short

/** Rebuild a recorded query on `client`. */
const apply = (client, table, calls) =>
  calls.reduce((query, [method, args]) => query[method](...args), client.from(table))

// The copy's rows carry `_synced`, the server's updated_at when last synced;
// the app never sees it.
function strip(result) {
  const clean = (row) => {
    if (!row || typeof row !== 'object' || !('_synced' in row)) return row
    const rest = { ...row }
    delete rest._synced
    return rest
  }
  const { data } = result
  return { ...result, data: Array.isArray(data) ? data.map(clean) : clean(data) }
}

// A new row gets its id here, so the copy and the server share it.
const withIds = (values) =>
  Array.isArray(values)
    ? values.map(v => (v.id ? v : { ...v, id: crypto.randomUUID() }))
    : values.id ? values : { ...values, id: crypto.randomUUID() }

/** A query on a synced table, recorded as it's built and run when awaited. */
class SyncedQuery {
  constructor(copy, table) {
    this.copy = copy
    this.table = table
    this.op = 'select'
    this.calls = []
  }

  then(onFulfilled, onRejected) {
    return this.copy.run(this).then(onFulfilled, onRejected)
  }
}
for (const method of METHODS) {
  SyncedQuery.prototype[method] = function (...args) {
    if (method === 'insert' || method === 'upsert') {
      this.op = method
      args = [withIds(args[0]), ...args.slice(1)]
    } else if (method === 'update' || method === 'delete') {
      this.op = method
    }
    this.calls.push([method, args])
    return this
  }
}

// Whether this device's copy of `userId` has been filled from the server once.
const syncedKey = (userId) => `archespace-copy-synced-${userId}`
function everSynced(userId) {
  try {
    return localStorage.getItem(syncedKey(userId)) === '1'
  } catch {
    return false
  }
}
function markSynced(userId, synced) {
  try {
    if (synced) localStorage.setItem(syncedKey(userId), '1')
    else localStorage.removeItem(syncedKey(userId))
  } catch {
    // Storage unavailable: a later start just waits for its first sync again.
  }
}

/** The ids a waiting change touches, so a sync leaves them as they are here. */
function pendingIds(ops) {
  const ids = new Set()
  for (const op of ops) {
    if (op.target) ids.add(op.target)
    for (const { id } of op.args?.updates || []) ids.add(id)
    for (const [method, args] of op.calls || []) {
      if (method === 'insert' || method === 'upsert') [].concat(args[0]).forEach(v => ids.add(v.id))
      if (method === 'eq' && args[0] === 'id') ids.add(args[1])
      if (method === 'in' && args[0] === 'id') args[1].forEach(id => ids.add(id))
    }
  }
  return ids
}

/**
 * The account client: `remote` (supabase-js) with spaces and items routed to
 * the offline copy. `openStore(userId)` opens a user's copy, `openOutbox(userId)`
 * their outbox. `client.offline` is bound to the signed-in user (`bind`), and
 * syncs (`sync`), runs server-only work (`online`) and reports (`subscribe`).
 */
export function createOfflineClient(remote, { openStore, openOutbox }) {
  let userId = null
  let replica = null
  let outbox = null
  let channel = null
  const listeners = new Set()
  const emit = (event) => { for (const fn of listeners) fn(event) }

  // Copies made of conflicting edits are titled by the app (it holds the key).
  let copyTitle = async (title) => title
  // A copy never filled yet waits for its first sync before answering, so a
  // new device doesn't show an empty account meanwhile.
  let firstSync = null

  const copy = {
    async run(query) {
      if (query.op === 'select' && !everSynced(userId)) await (firstSync ??= copy.sync())
      if (query.op === 'delete') {
        return copy.online(async () => {
          const result = await apply(remote, query.table, query.calls)
          if (!result.error) await apply(replica, query.table, query.calls)
          return result
        }, { refresh: false })
      }
      const op = query.op === 'select' ? null : await describe(query)
      const result = await apply(replica, query.table, query.calls)
      if (op && !result.error) await logged(op)
      return strip(result)
    },
  }

  async function logged(op) {
    await outbox.add(op)
    channel?.postMessage('changed')
    emit({ type: 'write' })
  }

  // What a change sends, and for an edit of an item's text or content, the
  // version it was made on and what a copy of it would hold.
  async function describe(query) {
    const op = { table: query.table, calls: query.calls }
    if (query.table !== 'space_items' || query.op !== 'update') return op
    const values = query.calls.find(([method]) => method === 'update')[1][0]
    const id = query.calls.find(([method, [col]]) => method === 'eq' && col === 'id')?.[1][1]
    if (!id || !('title' in values || 'content' in values)) return op
    const row = (await replica.ready()).tables.space_items.get(id)
    if (!row?._synced) return op
    return {
      ...op,
      target: id,
      base: row._synced,
      copy: { space_id: row.space_id, type: row.type, title: row.title, content: row.content },
    }
  }

  async function rpc(name, args) {
    if (!replica) return remote.rpc(name, args)
    if (LOGGED_RPC.has(name)) {
      const result = await replica.rpc(name, args)
      if (!result.error) await logged({ rpc: name, args })
      return result
    }
    if (name === 'purge_expired') {
      remote.rpc(name, args).then(() => {}, () => {}) // the server's own; best effort
      return replica.rpc(name, args)
    }
    return remote.rpc(name, args)
  }

  // Sending

  // Undefined when it landed; else how it ended. A network error is thrown,
  // leaving it (and everything after it) for the next sync.
  function outcome(error) {
    if (!error) return undefined
    if (isNetworkError(error)) throw error
    if (error.code === '23505') return undefined // sent before, its answer lost
    return error.code === 'P0R01' ? 'refused' : 'lost'
  }

  async function send(op) {
    if (op.rpc) return outcome((await remote.rpc(op.rpc, op.args)).error)
    if (!op.base) return outcome((await apply(remote, op.table, op.calls)).error)
    const { data, error } = await apply(remote, op.table, op.calls)
      .eq('updated_at', op.base)
      .select('id, updated_at')
    if (error) return outcome(error)
    if (data?.length) return rebase(op.target, op.base, data[0].updated_at)
    return saveCopy(op)
  }

  // The item changed elsewhere (or is gone): keep this edit as a new item
  // beside it, or on the dashboard if its space is gone too.
  async function saveCopy(op) {
    const values = op.calls.find(([method]) => method === 'update')[1][0]
    const row = {
      id: crypto.randomUUID(),
      type: op.copy.type,
      title: await copyTitle(values.title ?? op.copy.title),
      content: values.content ?? op.copy.content,
    }
    for (const spaceId of op.copy.space_id ? [op.copy.space_id, null] : [null]) {
      const { error } = await remote.from('space_items').insert({ ...row, space_id: spaceId })
      if (!error) return 'copied'
      if (isNetworkError(error)) throw error
      if (error.code === 'P0R01') return 'refused'
    }
    return 'lost'
  }

  // An edit landed as `version`: later edits of the item made here build on
  // it, not on the version it replaced.
  async function rebase(id, oldBase, version) {
    const store = await replica.ready()
    const row = store.tables.space_items.get(id)
    if (row) {
      row._synced = version
      await store.save('space_items', [row])
    }
    for (const op of await outbox.all()) {
      if (op.target === id && op.base === oldBase) await outbox.put({ ...op, base: version })
    }
  }

  async function push() {
    const ended = { copied: 0, refused: 0, lost: 0 }
    for (let ops = await outbox.all(); ops.length; ops = await outbox.all()) {
      const end = await send(ops[0])
      await outbox.remove(ops[0].seq)
      if (end) ended[end] += 1
    }
    if (ended.copied || ended.refused || ended.lost) emit({ type: 'report', ...ended })
  }

  // Receiving

  async function pages(table, columns) {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await remote.from(table).select(columns).order('id').range(from, from + PAGE - 1)
      if (error) throw error
      rows.push(...data)
      if (data.length < PAGE) return rows
    }
  }

  // With two-factor pending the server shows nothing and takes nothing: a sync
  // then would read the account as empty and reject what waits, so none runs.
  async function signedInFully() {
    const { data: aal } = await remote.auth.mfa.getAuthenticatorAssuranceLevel()
    return !(aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2')
  }

  // Bring the copy up to date: rows new or changed on the server come in,
  // rows gone from it go, except those with a change still waiting here.
  async function pull() {
    const pending = pendingIds(await outbox.all())
    const store = await replica.ready()
    let changed = false
    for (const table of SYNCED) {
      const heads = await pages(table, 'id, updated_at')
      const local = store.tables[table]
      const stale = heads
        .filter(h => !pending.has(h.id) && local.get(h.id)?._synced !== h.updated_at)
        .map(h => h.id)
      const rows = []
      for (let i = 0; i < stale.length; i += ID_CHUNK) {
        const { data, error } = await remote.from(table).select('*').in('id', stale.slice(i, i + ID_CHUNK))
        if (error) throw error
        rows.push(...data)
      }
      for (const row of rows) local.set(row.id, { ...row, _synced: row.updated_at })
      if (rows.length) await store.save(table, rows.map(row => local.get(row.id)))
      const live = new Set(heads.map(h => h.id))
      const gone = [...local.keys()].filter(id => !live.has(id) && !pending.has(id))
      for (const id of gone) local.delete(id)
      if (gone.length) await store.remove(table, gone)
      changed ||= rows.length > 0 || gone.length > 0
    }
    markSynced(userId, true)
    if (changed) {
      channel?.postMessage('changed')
      emit({ type: 'changed' })
    }
  }

  // One sync at a time (across tabs too, where the browser allows); one asked
  // for meanwhile runs right after.
  let running = null
  let again = false
  const acrossTabs = (fn) =>
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request(`archespace-sync-${userId}`, fn)
      : fn()

  copy.sync = () => {
    if (!replica) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        try {
          if (!(await signedInFully())) return
          await acrossTabs(async () => {
            await push()
            await pull()
          })
          setReachable(true)
        } catch (err) {
          if (!isNetworkError(err)) console.warn('Sync failed:', err)
          setReachable(false)
          return
        }
      } while (again)
    })().finally(() => { running = null })
    return running
  }

  /**
   * Run `fn` against the server once everything waiting is sent (and, with
   * `refresh`, the copy is up to date): for what must not act on an old copy.
   * Offline it ends at once with an error, as a failed request would.
   */
  copy.online = async (fn, { refresh = true } = {}) => {
    const offline = { data: null, error: { message: "You're offline - reconnect to do this.", code: 'OFFLINE' } }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return offline
    if (!(await signedInFully())) return { data: null, error: { message: 'Finish signing in first.', code: 'AAL' } }
    try {
      await acrossTabs(refresh ? async () => { await push(); await pull() } : push)
    } catch (err) {
      if (isNetworkError(err)) {
        setReachable(false)
        return offline
      }
      throw err
    }
    return fn()
  }

  /** Point the copy at the signed-in user (null when signed out). */
  copy.bind = (id) => {
    if (id === (userId ?? null)) return
    channel?.close()
    userId = id
    firstSync = null
    replica = id ? createLocalClient(() => openStore(id), { userId: id }) : null
    outbox = id ? openOutbox(id) : null
    channel = id && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`archespace-copy-${id}`) : null
    if (channel) {
      // Another tab changed the copy: read it again.
      channel.onmessage = async () => {
        await (await replica.ready()).reload()
        emit({ type: 'changed' })
      }
    }
  }

  /**
   * Delete this user's copy (signing out, a vault reset). Changes not sent
   * yet stay in the outbox, which holds only ciphertext, and go out at the
   * next sign-in.
   */
  copy.erase = async () => {
    if (!userId) return
    markSynced(userId, false)
    const store = await replica.ready()
    for (const table of SYNCED) {
      const keys = [...store.tables[table].keys()]
      store.tables[table].clear()
      await store.remove(table, keys)
    }
  }

  copy.subscribe = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
  copy.setCopyTitle = (fn) => { copyTitle = fn }
  /** How many changes wait to be sent. */
  copy.pending = async () => (outbox ? (await outbox.all()).length : 0)

  return new Proxy(remote, {
    get(target, prop) {
      if (prop === 'from') {
        return (table) => (replica && SYNCED.has(table) ? new SyncedQuery(copy, table) : remote.from(table))
      }
      if (prop === 'rpc') return rpc
      if (prop === 'offline') return copy
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
