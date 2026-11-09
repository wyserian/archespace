/**
 * legal.js - Single source of truth for the current legal policy version.
 *
 * TERMS_VERSION is recorded server-side against each new account's consent
 * (see the `user_consent` table + `log_auth_event` trigger in schema.sql).
 * Bump it - and TERMS_LAST_UPDATED - together whenever the Terms of Service
 * or Privacy Policy changes materially, so we can tell which version a given
 * user agreed to. Keep TERMS_VERSION as a sortable YYYY-MM-DD string.
 */
export const TERMS_VERSION = '2026-11-09'
export const TERMS_LAST_UPDATED = '9 November 2026'
