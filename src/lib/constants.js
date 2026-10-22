/**
 * constants.js - Shared limits and settings, tuned in one place.
 */

// Auth & Session
/** Max failed login attempts before cooldown */
export const MAX_LOGIN_ATTEMPTS = 5

/** Window over which failed login attempts accumulate toward the max (ms) */
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

/** Cooldown/lockout duration after max login attempts (ms) */
export const LOGIN_COOLDOWN_MS = 30_000

/** Vault PIN unlock: max failed attempts before lockout */
export const VAULT_PIN_MAX_ATTEMPTS = 5

/** Vault PIN unlock lockout duration (ms) */
export const VAULT_PIN_LOCKOUT_MS = 5 * 60 * 1000

/** Absolute maximum session lifetime (ms) - 1 week; no inactivity logout */
export const SESSION_ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000

// Vault PIN. The minimum applies when a PIN is set; an existing shorter PIN
// still unlocks.
export const VAULT_PIN_MIN_LENGTH = 6
// Long enough for passphrases, not just PINs.
export const VAULT_PIN_MAX_LENGTH = 64

/** User-selectable vault auto-lock durations. `ms: null` means "Never". */
export const VAULT_AUTO_LOCK_OPTIONS = [
  { id: '5m', label: '5 minutes', ms: 5 * 60 * 1000 },
  { id: '15m', label: '15 minutes', ms: 15 * 60 * 1000 },
  { id: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { id: '8h', label: '8 hours', ms: 8 * 60 * 60 * 1000 },
  { id: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: 'never', label: 'Never', ms: null },
]

/** Default auto-lock option id. */
export const VAULT_AUTO_LOCK_DEFAULT_ID = '5m'

// Import / Export
/** Maximum import file size in bytes (10 MB) */
export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024

/** Maximum number of spaces per import */
export const MAX_IMPORT_SPACES = 500

/** Maximum number of items per space in an import */
export const MAX_IMPORT_ITEMS_PER_SPACE = 1000

// Item Types
/** Allowed item type values (must match DB CHECK constraint) */
export const ITEM_TYPES = ['textbox', 'checkbox_list', 'menu_list', 'numbered_list', 'card_list', 'richtext', 'code', 'whiteboard', 'table', 'kanban']

// UI
/** Auto-save debounce delay (ms) */
export const AUTO_SAVE_DELAY_MS = 5000

/** Maximum rows loaded into global search per entity */
export const GLOBAL_SEARCH_RESULT_LIMIT = 500

/** Toast auto-dismiss delay (ms) */
export const TOAST_DISMISS_MS = 3000

/** Error toasts linger longer so they can be read */
export const TOAST_ERROR_DISMISS_MS = 7000

/** Maximum visible toasts */
export const MAX_TOASTS = 5

// Field Limits (match DB constraints)
export const MAX_NAME_LENGTH = 255
export const MAX_DESCRIPTION_LENGTH = 2000
export const MAX_TITLE_LENGTH = 255
