/**
 * PasswordRules.jsx - The login password rules under a new-password field,
 * each ticked off while typing, so they are known before submitting.
 */
import { Check, Circle } from 'lucide-react'
import { passwordChecks } from '../lib/passwordPolicy'

export function PasswordRules({ password, id }) {
  return (
    // Tight spacing so all five fit one line under a sign-up field; they wrap
    // only where even that doesn't fit (narrow phones).
    <ul id={id} aria-label="Password needs" className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1 text-[11px]">
      {passwordChecks(password).map(({ label, ok }) => (
        <li key={label} className={`flex items-center gap-0.5 transition-colors ${ok ? 'text-success' : 'text-text-muted'}`}>
          {ok ? <Check size={12} aria-hidden="true" /> : <Circle size={8} aria-hidden="true" className="mx-0.5" />}
          {label}
          <span className="sr-only">{ok ? ', done' : ', missing'}</span>
        </li>
      ))}
    </ul>
  )
}
