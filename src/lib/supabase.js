/**
 * Shared Supabase client singleton. Configured from the VITE_SUPABASE_* env
 * vars (see `.env.example`); never create a second client.
 *
 * Signed in to an account, spaces and items go to this device's offline copy,
 * which syncs with the server (offlineCopy.js). In local mode
 * (lib/localMode.js) it's a stand-in with the same calls, answered from this
 * browser's storage, with no network at all.
 */

import { createClient } from '@supabase/supabase-js'
import { isLocalMode } from './localMode'
import { createLocalClient } from './local/localClient'
import { openIndexedDbStore } from './local/localStore'
import { createOfflineClient } from './offlineCopy'
import { openOutbox } from './outbox'

// A request with no answer by then counts as a network failure, so a
// connection that's up but goes nowhere is noticed quickly.
const REQUEST_TIMEOUT_MS = 10_000

function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout?.(REQUEST_TIMEOUT_MS)
  const signal = timeout && init.signal && AbortSignal.any ? AbortSignal.any([init.signal, timeout]) : timeout ?? init.signal
  return fetch(input, { ...init, signal })
}

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// "Remember me" preference. When true (default), the auth token lives in
// localStorage and survives a browser restart; when false, it lives in
// sessionStorage and is dropped when the browser closes. Read at each token
// write, so setRememberMe() before signing in routes the session correctly.
const REMEMBER_KEY = 'arche-remember-me'

function rememberMe() {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Set before signing in to choose persistent (true) vs session-only (false). */
export function setRememberMe(value) {
  try {
    localStorage.setItem(REMEMBER_KEY, value ? 'true' : 'false')
  } catch {
    // Storage unavailable (private mode); fall back to the default (persist).
  }
}

// Routes the auth token to localStorage or sessionStorage per the preference.
// Reads prefer whichever store holds it, so existing localStorage sessions stay
// valid and switching stores between logins works cleanly.
const authStorage = {
  getItem(key) {
    try {
      return sessionStorage.getItem(key) ?? localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      if (rememberMe()) {
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      }
    } catch {
      // Ignore write failures (private mode / quota).
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // Ignore.
    }
  },
}

function createRemoteClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[Arche] Missing Supabase configuration.\n' +
      'Create a .env file in the project root with:\n' +
      '  VITE_SUPABASE_URL=https://your-project-id.supabase.co\n' +
      '  VITE_SUPABASE_ANON_KEY=your-anon-key-here\n' +
      'See .env.example for reference.'
    )
  }
  // The auth storage key is pinned to supabase-js's default
  // (`sb-<project-ref>-auth-token`) so a library upgrade that changes how it's
  // derived can't orphan saved sessions and sign everyone out.
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Changing this signs everyone out once.
      storageKey: `sb-${projectRef}-auth-token`,
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: fetchWithTimeout },
  })
}

export const supabase = isLocalMode()
  ? createLocalClient(openIndexedDbStore)
  : createOfflineClient(createRemoteClient(), {
    openStore: (userId) => openIndexedDbStore(`archespace-copy-${userId}`),
    openOutbox,
  })
