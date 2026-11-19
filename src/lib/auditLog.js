/**
 * auditLog.js - Best-effort audit logging.
 *
 * The audit_log table is owner-only: end users have no read or write
 * access to it. Actions only the app sees (sign-in, vault, backup export and
 * import) are recorded through the scoped log_client_event RPC, which writes
 * on the user's behalf without exposing the table.
 */
import { supabase } from './supabase'

/** Records `action` from the web app (who and when are added by the server). */
export async function logAudit(action) {
  try {
    const { error } = await supabase.rpc('log_client_event', { p_action: action, p_client: 'web' })
    // Auditing must never block a user action, but a rejected call
    // should still surface in the console instead of vanishing silently.
    if (error) console.debug('[audit] log_client_event failed:', error.message)
  } catch (err) {
    console.debug('[audit] log_client_event threw:', err)
  }
}
