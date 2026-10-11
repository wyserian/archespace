/**
 * passwordPolicy.js - Login password strength validation, checked on submit
 * (the server enforces the same rules).
 */

const PASSWORD_RULES = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
}

// ASCII punctuation, the symbols Supabase Auth counts.
const SYMBOL = /[!-/:-@[-`{-~]/

/** "a", "a and b", "a, b and c". */
function joinList(parts) {
  return parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * One sentence naming everything the password still lacks ("Password needs
 * at least 8 characters, a number and a symbol."), or null when it's fine.
 */
export function validatePassword(password) {
  const missing = [
    password.length < PASSWORD_RULES.minLength && `at least ${PASSWORD_RULES.minLength} characters`,
    PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password) && 'an uppercase letter',
    PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password) && 'a lowercase letter',
    PASSWORD_RULES.requireNumber && !/\d/.test(password) && 'a number',
    PASSWORD_RULES.requireSymbol && !SYMBOL.test(password) && 'a symbol',
  ].filter(Boolean)
  return missing.length ? `Password needs ${joinList(missing)}.` : null
}
