/**
 * vaultPin.js - Vault secret validation.
 *
 * The vault secret can be a numeric PIN or a passphrase (letters, numbers,
 * symbols). Only length is enforced; weak choices get a warning, not a block.
 */
import { VAULT_PIN_MAX_LENGTH, VAULT_PIN_MIN_LENGTH } from '../constants'

const DIGITS_ONLY = /^\d+$/

/**
 * @param {string} pin
 * @returns {string|null} Error message or null if valid
 */
export function validateVaultPin(pin) {
  const value = String(pin ?? '')
  if (value.length < VAULT_PIN_MIN_LENGTH || value.length > VAULT_PIN_MAX_LENGTH) {
    return `Must be ${VAULT_PIN_MIN_LENGTH}-${VAULT_PIN_MAX_LENGTH} characters.`
  }
  return null
}

/**
 * Security warning for weak vault secrets. Short and/or digits-only values
 * are the most guessable; returns null once reasonably strong.
 * @param {string} pin
 * @returns {string|null}
 */
export function getWeakPinWarning(pin) {
  const value = String(pin ?? '')
  if (value.length < VAULT_PIN_MIN_LENGTH) return null // handled by validation

  if (DIGITS_ONLY.test(value) && value.length < 8) {
    return `A ${value.length}-digit PIN is easy to guess. Use 8+ digits, or add letters and symbols for much stronger protection.`
  }
  return null
}
