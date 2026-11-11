/**
 * AuthContext.jsx - The signed-in user (`user`, `loading` while the stored
 * session loads) and the account actions: sign in/up/out, password reset,
 * email and password change, and account deletion.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearVaultSession } from '../lib/crypto/vaultSession'
import { logAudit } from '../lib/auditLog'
import { AuthContext } from './AuthContextCore'

/** Leave nothing readable behind: the unlocked vault and the offline copy. */
async function leaveDevice() {
  clearVaultSession()
  await supabase.offline?.erase()
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    // The offline copy follows the signed-in account (local mode has none).
    const follow = (session) => {
      supabase.offline?.bind(session?.user?.id ?? null)
      setUser(session?.user ?? null)
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      follow(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        follow(session)
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setPasswordRecovery(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  /** Register a new account (when sign-up is enabled). */
  const signUp = (email, password, metadata = {}) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })

  /** Send a password reset email. */
  const requestPasswordReset = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

  /** Send a reauthentication code (OTP) to the user's current email. */
  const reauthenticate = () => supabase.auth.reauthenticate()

  /**
   * Request an account email change through Supabase Auth.
   * Pass the reauthentication `nonce` (code sent to the current email) so
   * the change is authorised. With Supabase "Secure email change" disabled,
   * only the new address receives a confirmation link.
   */
  const updateEmail = (email, nonce) =>
    supabase.auth.updateUser(
      nonce ? { email, nonce } : { email },
      { emailRedirectTo: `${window.location.origin}/login?email_change=verified` }
    )

  /** Permanently delete the signed-in user's account through a database RPC. */
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_current_user')
    if (error) return { error }
    await leaveDevice()
    setPasswordRecovery(false)
    await supabase.auth.signOut({ scope: 'local' })
    setUser(null)
    return { error: null }
  }

  /** Update password, revoke all sessions, and force a fresh sign-in. */
  const updatePasswordAndSignOut = async (password, afterUpdate, nonce) => {
    const { error: updateError } = await supabase.auth.updateUser(
      nonce ? { password, nonce } : { password }
    )
    if (updateError) return { error: updateError }
    if (afterUpdate) {
      try {
        await afterUpdate()
      } catch (error) {
        return { error }
      }
    }

    await leaveDevice()
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
    if (!signOutError) setPasswordRecovery(false)
    return { error: signOutError }
  }

  /**
   * End the session on this device only (`local` scope); other devices stay
   * signed in. Only a password change signs out everywhere.
   */
  const signOut = async (options = { scope: 'local' }) => {
    // Record the logout while the session (and auth.uid()) is still valid.
    await logAudit({ action: 'logout' })
    await supabase.offline?.sync() // send what waits, while still signed in
    await leaveDevice()
    setPasswordRecovery(false)
    return supabase.auth.signOut(options)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        reauthenticate,
        updateEmail,
        deleteAccount,
        updatePasswordAndSignOut,
        passwordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
