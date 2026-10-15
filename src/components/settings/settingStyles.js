/**
 * settingStyles.js - Class strings for the settings rows' buttons and fields
 * (the buttons use the app's shared styles, see ui/buttonStyles.js).
 */
import { buttonClass } from '../ui/buttonStyles'

/** Secondary action button used on the right of a row. */
export const rowButtonClass = buttonClass({ variant: 'secondary' })

/** Destructive variant of the row action. */
export const rowDangerButtonClass = buttonClass({ variant: 'danger' })

/** Primary submit button inside an opened row form. */
export const primaryButtonClass = buttonClass({ variant: 'primary' })

/** Text input inside a row form. */
export const inputClass =
  'w-full rounded-xl border border-bg-border/60 bg-bg-elevated px-4 py-3 text-sm text-text-primary focus:border-accent focus:outline-none'

export const labelClass = 'mb-1.5 block text-xs font-medium text-text-secondary'
