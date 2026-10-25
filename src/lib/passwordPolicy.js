/**
 * passwordPolicy.js - Login password rules: shown as a checklist while typing
 * and checked on submit (the server enforces the same rules).
 */

const MIN_LENGTH = 8

// ASCII punctuation, the symbols Supabase Auth counts.
const SYMBOL = /[!-/:-@[-`{-~]/

// `label` for the checklist, `need` for the submit error.
const RULES = [
  { label: `${MIN_LENGTH}+ chars`, need: `at least ${MIN_LENGTH} characters`, test: p => p.length >= MIN_LENGTH },
  { label: 'Uppercase', need: 'an uppercase letter', test: p => /[A-Z]/.test(p) },
  { label: 'Lowercase', need: 'a lowercase letter', test: p => /[a-z]/.test(p) },
  { label: 'Number', need: 'a number', test: p => /\d/.test(p) },
  { label: 'Symbol', need: 'a symbol', test: p => SYMBOL.test(p) },
]

/** Each rule's checklist label and whether `password` meets it. */
export function passwordChecks(password) {
  return RULES.map(rule => ({ label: rule.label, ok: rule.test(password) }))
}

/** "a", "a and b", "a, b and c". */
function joinList(parts) {
  return parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * One sentence naming everything the password still lacks ("Password needs
 * at least 8 characters, a number and a symbol."), or null when it's fine.
 */
export function validatePassword(password) {
  const missing = RULES.filter(rule => !rule.test(password)).map(rule => rule.need)
  return missing.length ? `Password needs ${joinList(missing)}.` : null
}
