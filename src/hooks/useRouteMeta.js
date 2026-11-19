/**
 * useRouteMeta.js - Per-route document title and index/noindex hint.
 *
 * The app lives behind auth and must not be indexed; only the public landing
 * page ("/") should be. Googlebot runs JS, so toggling the robots meta on the
 * client is enough to keep private views (dashboard, spaces, settings) out of
 * search results.
 */
import { useEffect } from 'react'

const SITE_NAME = 'ArcheSpace'
const DEFAULT_TITLE = 'ArcheSpace | Your Private Space'

function setDocumentTitle(title) {
  document.title = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE
}

function setRobotsIndexable(indexable) {
  let tag = document.head.querySelector('meta[name="robots"]')
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'robots')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', indexable ? 'index, follow' : 'noindex, nofollow')
}

/**
 * @param {{ title?: string|null, indexable?: boolean }} options
 *   - title `null` sets the landing-page title; a string becomes
 *     "Title · ArcheSpace"; `undefined` leaves the current title untouched.
 *   - indexable defaults to false (noindex), the safe default for app routes.
 */
export function useRouteMeta({ title, indexable = false } = {}) {
  useEffect(() => {
    if (title !== undefined) setDocumentTitle(title)
    setRobotsIndexable(indexable)
  }, [title, indexable])
}
