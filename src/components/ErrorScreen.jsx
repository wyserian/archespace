/**
 * ErrorScreen.jsx - Shared full-page error / recovery UI.
 *
 * Used by both the React error boundary (ErrorBoundary) and the router error
 * boundary (RouteErrorBoundary in App.jsx). The `chunk` variant swaps the icon
 * and is used when a stale dynamic import fails after a redeploy.
 *
 * The error itself is never shown (it can hold user content); "Copy error
 * details" copies a redacted report for a support email (errorReport.js).
 */

import { useState } from 'react'
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react'
import { buttonClass } from './ui/buttonStyles'
import { errorReport } from '../lib/errorReport'

export default function ErrorScreen({ variant = 'error', title, message, error }) {
  const isChunk = variant === 'chunk'
  const [copied, setCopied] = useState(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(errorReport(error))
      setCopied('Copied - paste it into an email to support')
    } catch {
      setCopied("Couldn't copy. Check the browser's clipboard permission.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg-base text-text-primary">
      <div role="alert" className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto bg-bg-surface border border-bg-border">
          {isChunk
            ? <RefreshCw size={24} className="text-accent" />
            : <AlertTriangle size={24} className="text-danger" />}
        </div>

        <h1 className="text-xl font-semibold">{title}</h1>

        <p className="text-sm text-text-secondary">
          {message}
        </p>

        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => window.location.reload()}
            className={buttonClass({ variant: 'primary' })}
          >
            Reload page
          </button>
          <button
            onClick={() => { window.location.href = '/app' }}
            className={buttonClass({ variant: 'secondary' })}
          >
            Go to dashboard
          </button>
        </div>

        {error != null && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              <Copy size={13} />
              Copy error details
            </button>
            <p aria-live="polite" className="text-xs text-text-muted">{copied}</p>
          </div>
        )}
      </div>
    </div>
  )
}
