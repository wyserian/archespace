/**
 * SettingRow.jsx - Building blocks for the settings page.
 *
 * Every setting is one row: a title and a short explanation (with its current
 * state) on the left, a single action on the right. A row's form stays hidden
 * until its action opens it, so the page reads as a list of settings rather
 * than a wall of fields. Rows sit in labelled groups.
 */
// The row button and field styles live in settingStyles.js.
import { primaryButtonClass, rowButtonClass } from './settingStyles'

/**
 * @param {{ title: string, description?: React.ReactNode, action?: React.ReactNode, open?: boolean, children?: React.ReactNode }} props
 *   `children` is the row's form, shown only while `open`.
 */
export function SettingRow({ title, description, action, open = false, children }) {
  return (
    <div className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && (
            <div className="mt-0.5 text-xs leading-relaxed text-text-muted">{description}</div>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {open && children && (
        <div className="mt-4 rounded-xl bg-bg-sunken p-4">{children}</div>
      )}
    </div>
  )
}

/** A labelled group of rows in one bordered list. */
export function SettingGroup({ label, danger = false, children }) {
  return (
    <div className="mb-6 last:mb-0">
      {label && (
        <h3 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${danger ? 'text-danger' : 'text-text-muted'}`}>
          {label}
        </h3>
      )}
      <div className="divide-y divide-bg-border/60 overflow-hidden rounded-xl border border-bg-border/60 bg-bg-surface">
        {children}
      </div>
    </div>
  )
}

/** Cancel + submit footer for a row form. */
export function FormActions({ onCancel, submitLabel, busy, busyLabel, disabled = false }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className={rowButtonClass}>
        Cancel
      </button>
      <button type="submit" disabled={busy || disabled} className={primaryButtonClass}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  )
}
