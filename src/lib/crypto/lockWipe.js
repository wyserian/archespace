/**
 * lockWipe.js - Plain text stays in memory only while the vault is unlocked.
 */
import { clearDecryptCache } from './cipher'

/**
 * When the vault key goes (lock, auto-lock, screen lock, sign-out) or
 * changes, drop every decrypted value and every loaded list. Whether it did.
 */
export function wipeOnKeyChange(previousKey, nextKey, queryClient) {
  if (!previousKey || previousKey === nextKey) return false
  clearDecryptCache()
  queryClient.resetQueries()
  return true
}
