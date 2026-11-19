/**
 * worker/index.js - The Cloudflare Worker in front of the site's files.
 *
 * Everything is served from the built site (env.ASSETS), except
 * /download/android: it sends the browser straight to the latest mobile
 * release's arm64 APK, whatever its versioned file name, falling back to the
 * release page when GitHub can't say. wrangler.jsonc routes only /download/*
 * here first; every other path goes to the files directly.
 */

const REPO = 'wyserian/archespace-mobile'
export const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`
// GitHub answers the same for a while, and allows few unauthenticated calls.
const CACHE_SECONDS = 300

const redirect = (location) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
  })

/** Where /download/android sends the browser: the arm64 APK, else the release page. */
export async function androidDownload(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'archespace-download' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    })
    if (res.ok) {
      const release = await res.json()
      const apk = release?.assets?.find?.(a => typeof a?.name === 'string' && a.name.endsWith('-arm64.apk'))
      const url = apk?.browser_download_url
      // Only ever to GitHub's own downloads: never an open redirect.
      if (typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/releases/download/`)) {
        return redirect(url)
      }
    }
  } catch {
    // GitHub unreachable or answered oddly: the release page instead.
  }
  return redirect(RELEASE_PAGE)
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/download/android') return androidDownload()
    return env.ASSETS.fetch(request)
  },
}
