/**
 * localClient.js - Local mode's stand-in for the Supabase client: the same
 * calls the app makes (`from(table)` queries, `rpc`, `auth`, realtime
 * channels), answered from this browser's storage (localStore.js) with no
 * network at all.
 *
 * It mirrors what the database does for these tables (see schema.sql):
 * column defaults, `updated_at`, cascading deletes, the read-only space
 * guards and the vault PIN lockout. Like the server, it never empties the
 * recycle bin by itself. Rows hold the same encrypted values the server would.
 */
import { LOCAL_USER, leaveLocalMode } from '../localMode'
import { TABLES } from './localStore'
import { descendantsOf } from '../spaceTree'

const PIN_MAX_ATTEMPTS = 5
const PIN_LOCK_MS = 5 * 60 * 1000

const now = () => new Date().toISOString()
const copy = (value) => structuredClone(value)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const fail = (message, code = 'LOCAL') => ({ message, code, details: null, hint: null })
const READ_ONLY = fail('This space is read-only.', 'P0R01')
const UNAVAILABLE = fail('Not available in local mode.')

/** Column defaults (schema.sql), filled in on insert. */
const DEFAULTS = {
  spaces: () => ({
    description: '', position: 0, pinned: false, color: null, tags: [], parent_id: null,
    starred: false, locked: false, read_only: false, deleted_at: null, archived_at: null,
  }),
  space_items: () => ({
    space_id: null, title: '', content: {}, tags: [], reminder: null, position: 0, pinned: false,
    starred: false, locked: false, deleted_at: null, archived_at: null,
  }),
  user_encryption: () => ({
    wrapped_key: null, recovery_salt: null, recovery_wrapped_key: null,
    pin_failed_attempts: 0, pin_locked_until: null,
  }),
  user_settings: () => ({ theme_mode: 'system', accent_color: 'mint' }),
}
const HAS_UPDATED_AT = new Set(['spaces', 'space_items', 'user_settings'])

// Ordering as Postgres does it: ascending puts NULLs last, descending first.
function compare(a, b, ascending) {
  if (a === b) return 0
  if (a == null) return ascending ? 1 : -1
  if (b == null) return ascending ? -1 : 1
  return (a < b ? -1 : 1) * (ascending ? 1 : -1)
}

function project(row, columns) {
  if (!columns || columns.trim() === '*') return copy(row)
  const picked = {}
  for (const col of columns.split(',').map(c => c.trim()).filter(Boolean)) picked[col] = row[col]
  return copy(picked)
}

/** A query, built up like supabase-js's and run when awaited. */
class LocalQuery {
  constructor(engine, table) {
    this.engine = engine
    this.table = table
    this.op = 'select'
    this.columns = '*'
    this.filters = []
    this.orders = []
  }

  select(columns = '*', { count, head } = {}) {
    if (this.op === 'select') {
      this.columns = columns
      this.count = count
      this.head = head
    } else {
      this.returning = columns // e.g. insert(...).select()
    }
    return this
  }

  insert(values) { this.op = 'insert'; this.values = values; return this }
  upsert(values) { this.op = 'upsert'; this.values = values; return this }
  update(values) { this.op = 'update'; this.values = values; return this }
  delete() { this.op = 'delete'; return this }

  eq(col, value) { this.filters.push(row => row[col] === value); return this }
  neq(col, value) { this.filters.push(row => row[col] !== value); return this }
  in(col, values) { this.filters.push(row => values.includes(row[col])); return this }
  is(col, value) {
    this.filters.push(row => (value === null ? row[col] == null : row[col] === value))
    return this
  }
  not(col, op, value) {
    const test = op === 'is'
      ? (row => (value === null ? row[col] == null : row[col] === value))
      : (row => row[col] === value)
    this.filters.push(row => !test(row))
    return this
  }
  match(values) {
    for (const [col, value] of Object.entries(values)) this.eq(col, value)
    return this
  }

  order(col, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this }
  limit(n) { this.limitTo = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }

  then(onFulfilled, onRejected) {
    return this.engine.run(this).then(onFulfilled, onRejected)
  }
}

/** The local database: tables in memory, written through to the store. */
class LocalEngine {
  constructor(openStore) {
    this.ready = openStore().then((store) => {
      this.store = store
      return store
    })
  }

  get tables() { return this.store.tables }

  async run(query) {
    try {
      await this.ready
      const rows = await this[query.op](query)
      return this.shape(query, rows)
    } catch (error) {
      return { data: null, error: error?.code ? error : fail(error?.message || String(error)), count: null }
    }
  }

  matching(query) {
    return [...this.tables[query.table].values()].filter(row => query.filters.every(f => f(row)))
  }

  shape(query, rows) {
    if (query.op === 'select') {
      const count = query.count ? rows.length : null
      if (query.head) return { data: null, error: null, count }
      for (const { col, ascending } of [...query.orders].reverse()) {
        rows.sort((a, b) => compare(a[col], b[col], ascending))
      }
      if (query.limitTo != null) rows = rows.slice(0, query.limitTo)
      return this.single(query, rows.map(row => project(row, query.columns)), count)
    }
    if (query.returning === undefined) return { data: null, error: null, count: null }
    return this.single(query, rows.map(row => project(row, query.returning)), null)
  }

  single(query, data, count) {
    if (!query.one) return { data, error: null, count }
    if (data.length === 1) return { data: data[0], error: null, count }
    if (data.length === 0 && query.one === 'maybe') return { data: null, error: null, count }
    return { data: null, error: fail('JSON object requested, multiple (or no) rows returned', 'PGRST116'), count }
  }

  key(table, row) { return row[TABLES[table]] }

  // Reads
  async select(query) {
    return this.matching(query)
  }

  // Writes
  newRow(table, values) {
    const row = { ...DEFAULTS[table](), ...copy(values), created_at: now() }
    if (TABLES[table] === 'id') row.id ??= crypto.randomUUID()
    row.user_id ??= LOCAL_USER.id
    if (HAS_UPDATED_AT.has(table)) row.updated_at = row.created_at
    return row
  }

  async insert(query) {
    const { table } = query
    const rows = [].concat(query.values).map(values => this.newRow(table, values))
    for (const row of rows) {
      if (this.tables[table].has(this.key(table, row))) throw fail('duplicate key value', '23505')
      if (table === 'space_items' && this.isReadOnlySpace(row.space_id)) throw READ_ONLY
    }
    return this.write(table, rows)
  }

  async upsert(query) {
    const { table } = query
    const rows = [].concat(query.values).map((values) => {
      const existing = this.tables[table].get(values[TABLES[table]])
      if (!existing) return this.newRow(table, values)
      const row = { ...existing, ...copy(values) }
      if (HAS_UPDATED_AT.has(table)) row.updated_at = now()
      return row
    })
    return this.write(table, rows)
  }

  async update(query) {
    const { table } = query
    const rows = this.matching(query).map((old) => {
      const row = { ...old, ...copy(query.values) }
      this.guardUpdate(table, old, row)
      if (HAS_UPDATED_AT.has(table)) row.updated_at = now()
      return row
    })
    return this.write(table, rows)
  }

  async delete(query) {
    const { table } = query
    const rows = this.matching(query)
    if (table === 'spaces') {
      // ON DELETE CASCADE: sub-spaces at every level, and the items of every
      // space removed.
      const roots = rows.map(r => r.id)
      const ids = new Set([...roots, ...descendantsOf(roots, [...this.tables.spaces.values()])])
      const items = [...this.tables.space_items.values()].filter(i => ids.has(i.space_id))
      await this.erase('space_items', items)
      await this.erase('spaces', [...ids].map(id => this.tables.spaces.get(id)))
    } else {
      await this.erase(table, rows)
    }
    return rows
  }

  async write(table, rows) {
    for (const row of rows) this.tables[table].set(this.key(table, row), row)
    await this.store.save(table, rows)
    return rows
  }

  async erase(table, rows) {
    const keys = rows.map(row => this.key(table, row))
    for (const key of keys) this.tables[table].delete(key)
    await this.store.remove(table, keys)
  }

  // Read-only spaces (schema.sql, trg_spaces_read_only / trg_space_items_read_only)
  isReadOnlySpace(spaceId) {
    return spaceId != null && this.tables.spaces.get(spaceId)?.read_only === true
  }

  guardUpdate(table, old, row) {
    if (table === 'spaces') {
      const detailsChanged = ['name', 'description', 'color', 'tags', 'parent_id']
        .some(col => !same(old[col], row[col]))
      if (old.read_only && row.read_only && detailsChanged) throw READ_ONLY
    } else if (table === 'space_items') {
      if (old.space_id !== row.space_id) {
        if (this.isReadOnlySpace(old.space_id) || this.isReadOnlySpace(row.space_id)) throw READ_ONLY
      } else if (
        ['title', 'content', 'tags', 'type'].some(col => !same(old[col], row[col])) &&
        this.isReadOnlySpace(row.space_id)
      ) {
        throw READ_ONLY
      }
    }
  }

  // Database functions the app calls
  async rpc(name, args = {}) {
    try {
      await this.ready
      const vault = this.tables.user_encryption.get(LOCAL_USER.id)
      switch (name) {
        case 'update_space_positions':
        case 'update_item_positions': {
          const table = name === 'update_space_positions' ? 'spaces' : 'space_items'
          const rows = (args.updates || [])
            .map(({ id, position }) => {
              const old = this.tables[table].get(id)
              return old && { ...old, position, updated_at: now() }
            })
            .filter(Boolean)
          await this.write(table, rows)
          return { data: null, error: null }
        }
        case 'get_vault_pin_lock_status': {
          const until = vault?.pin_locked_until ? Date.parse(vault.pin_locked_until) : 0
          const locked = until > Date.now()
          return {
            data: { locked, retry_after_seconds: locked ? Math.ceil((until - Date.now()) / 1000) : 0 },
            error: null,
          }
        }
        case 'record_vault_pin_unlock_failure': {
          if (!vault) return { data: null, error: null }
          const lockExpired = vault.pin_locked_until && Date.parse(vault.pin_locked_until) <= Date.now()
          const attempts = (lockExpired ? 0 : vault.pin_failed_attempts) + 1
          await this.write('user_encryption', [{
            ...vault,
            pin_failed_attempts: attempts,
            pin_locked_until: attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCK_MS).toISOString() : null,
          }])
          return { data: null, error: null }
        }
        case 'record_vault_pin_unlock_success':
          if (vault) await this.write('user_encryption', [{ ...vault, pin_failed_attempts: 0, pin_locked_until: null }])
          return { data: null, error: null }
        case 'log_client_event':
          // Nothing is logged in local mode.
          return { data: null, error: null }
        default:
          return { data: null, error: UNAVAILABLE }
      }
    } catch (error) {
      return { data: null, error: fail(error?.message || String(error)) }
    }
  }
}

const unavailable = async () => ({ data: null, error: UNAVAILABLE })

/** The local "session": the local user, always signed in. */
const LOCAL_SESSION = Object.freeze({ user: LOCAL_USER, access_token: 'local', token_type: 'local' })

/** A Supabase-shaped client backed by local storage. */
export function createLocalClient(openStore) {
  const engine = new LocalEngine(openStore)
  const channel = {
    on() { return channel },
    subscribe() { return channel },
    unsubscribe: async () => 'ok',
  }
  return {
    from: (table) => {
      if (!TABLES[table]) throw new Error(`Table "${table}" isn't available in local mode.`)
      return new LocalQuery(engine, table)
    },
    rpc: (name, args) => engine.rpc(name, args),
    // Realtime has nothing to report: this tab is the only writer.
    channel: () => channel,
    removeChannel: async () => 'ok',
    auth: {
      getSession: async () => ({ data: { session: LOCAL_SESSION }, error: null }),
      getUser: async () => ({ data: { user: LOCAL_USER }, error: null }),
      onAuthStateChange: (callback) => {
        setTimeout(() => callback('INITIAL_SESSION', LOCAL_SESSION), 0)
        return { data: { subscription: { unsubscribe() {} } } }
      },
      // "Signing out" leaves local mode; the data stays for next time.
      signOut: async () => {
        leaveLocalMode()
        return { error: null }
      },
      signInWithPassword: unavailable,
      signUp: unavailable,
      resetPasswordForEmail: unavailable,
      reauthenticate: unavailable,
      updateUser: unavailable,
      refreshSession: async () => ({ data: { session: LOCAL_SESSION }, error: null }),
      mfa: {
        listFactors: async () => ({ data: { all: [], totp: [], phone: [] }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
          error: null,
        }),
        enroll: unavailable,
        challengeAndVerify: unavailable,
        unenroll: unavailable,
      },
    },
    /** Finishes loading the stored tables (for tests). */
    ready: () => engine.ready,
  }
}
