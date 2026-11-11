/**
 * useCapsLock.js - Whether Caps Lock is on while typing in a password field:
 * [on, fieldProps], with fieldProps spread onto the field.
 */
import { useState } from 'react'

export function useCapsLock() {
  const [on, setOn] = useState(false)
  const onKey = (e) => {
    if (typeof e.getModifierState === 'function') setOn(e.getModifierState('CapsLock'))
  }
  return [on, { onKeyDown: onKey, onKeyUp: onKey, onBlur: () => setOn(false) }]
}
