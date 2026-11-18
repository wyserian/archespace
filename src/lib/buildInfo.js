/**
 * buildInfo.js - Build provenance injected at compile time (see vite.config.js).
 *
 * The commit hash lets people check that the code their browser runs matches
 * the open-source release.
 */
/* global __APP_VERSION__, __BUILD_HASH__ */

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'
export const BUILD_HASH = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'

export const REPO_URL = 'https://github.com/wyserian/archespace'
export const COMMIT_URL = BUILD_HASH === 'dev' ? REPO_URL : `${REPO_URL}/commit/${BUILD_HASH}`

/** Companion Android app (Flutter), open source alongside the web app. */
export const MOBILE_REPO_URL = 'https://github.com/wyserian/archespace-mobile'
