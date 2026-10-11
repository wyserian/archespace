import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { EXCALIDRAW_FONT_DIR, rewriteExcalidrawFonts, shippedFontFiles } from './scripts/excalidraw-fonts.mjs'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { cloudflare } from '@cloudflare/vite-plugin'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Commit hash for the running build, so the deployed code can be checked
// against the public source. Prefers CI-provided env vars, falls back to git.
function resolveCommit() {
  const fromEnv =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// App version from the git tag: the CI tag, then the nearest tag in history,
// then package.json for untagged builds. The leading "v" is stripped (the UI
// adds its own).
function resolveVersion() {
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME.replace(/^v/, '')
  }
  try {
    return execSync('git describe --tags --abbrev=0').toString().trim().replace(/^v/, '')
  } catch {
    return pkg.version
  }
}

// Canonical site origin used for absolute SEO URLs (canonical tag, Open Graph,
// sitemap, robots). Overridable per environment via VITE_SITE_URL; the trailing
// slash is stripped so paths join cleanly.
function resolveSiteUrl() {
  return (process.env.VITE_SITE_URL || 'https://archespace.app').replace(/\/+$/, '')
}
const siteUrl = resolveSiteUrl()

const robotsTxt = `User-agent: *
Allow: /
Disallow: /app
Disallow: /space
Disallow: /settings
Disallow: /starred
Disallow: /reminders
Disallow: /archive
Disallow: /recycle-bin
Disallow: /login
Disallow: /auth
Disallow: /reset-password

Sitemap: ${siteUrl}/sitemap.xml
`

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${siteUrl}/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`

// Substitutes {{SITE_URL}} in index.html and writes robots.txt / sitemap.xml
// into the build so the canonical origin lives in exactly one place.
function seoPlugin() {
  return {
    name: 'arche-seo',
    transformIndexHtml(html) {
      return html.replaceAll('{{SITE_URL}}', siteUrl)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml })
    },
  }
}

// Excalidraw's fonts, served by the app rather than its CDN: from node_modules
// in dev, and copied into the build under excalidraw/fonts/. Excalidraw's code
// is rewritten to load them from there and nowhere else
// (scripts/excalidraw-fonts.mjs), in the build and in dev's pre-bundled copy.
const excalidrawFontsTransform = {
  name: 'arche-excalidraw-font-paths',
  transform(code, id) {
    if (!id.includes('@excalidraw') || !code.includes('./fonts/')) return null
    const local = (family, file) => `(location.origin + "/excalidraw/fonts/${family}/${file}")`
    return { code: rewriteExcalidrawFonts(code, local), map: null }
  },
}

function excalidrawFontsPlugin() {
  const served = new Set(shippedFontFiles())
  return {
    ...excalidrawFontsTransform,
    name: 'arche-excalidraw-fonts',
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (req, res, next) => {
        const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
        if (!served.has(path)) return next()
        res.setHeader('Content-Type', 'font/woff2')
        res.end(readFileSync(join(EXCALIDRAW_FONT_DIR, path)))
      })
    },
    generateBundle() {
      for (const path of served) {
        this.emitFile({
          type: 'asset',
          fileName: `excalidraw/fonts/${path}`,
          source: readFileSync(join(EXCALIDRAW_FONT_DIR, path)),
        })
      }
    },
  }
}

// The Whiteboard runs in English, so Excalidraw's other translations (about
// 1.7 MB) are left out of the build.
function excalidrawEnglishOnlyPlugin() {
  const stub = '\0excalidraw-unused-locale'
  return {
    name: 'arche-excalidraw-english',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.includes('@excalidraw') && /^\.\/locales\/(?!en-)/.test(source)) return stub
      return undefined
    },
    load(id) {
      return id === stub ? 'export default {}' : undefined
    },
  }
}

// Built files of the Whiteboard and PDF export, left out of the service
// worker's precache (see VitePWA below).
const LAZY_FEATURE_GLOBS = [
  '**/pdfmake-*.js',
  '**/pdfVfs-*.js',
  '**/preview-*.js',
  '**/chunk-*.js',
  '**/subset-*.js',
  '**/WhiteboardEditor-*.css',
  'excalidraw/**',
]
const LAZY_FEATURE_URL =
  /\/(?:assets\/(?:pdfmake-|pdfVfs-|preview-|chunk-|subset-|WhiteboardEditor-)|excalidraw\/fonts\/)/

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(resolveVersion()),
    __BUILD_HASH__: JSON.stringify(resolveCommit()),
  },
  optimizeDeps: {
    rolldownOptions: { plugins: [excalidrawFontsTransform] },
  },
  resolve: {
    alias: {
      // The Whiteboard leaves out Excalidraw's Mermaid import (several MB).
      '@excalidraw/mermaid-to-excalidraw': fileURLToPath(
        new URL('./src/lib/whiteboard/noMermaid.js', import.meta.url)
      ),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Only the libraries every page needs get named chunks. The rest
          // (the Rich text editor's Tiptap and ProseMirror, the Whiteboard's
          // Excalidraw and its React-based UI) splits off with the lazy import
          // that uses it, so it loads only when that item shows.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react'
          }
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('lucide-react')) return 'icons'
          // Keep pdfmake in its own chunk so it loads only when exporting a PDF.
          if (id.includes('pdfmake')) return 'pdfmake'
          return undefined
        },
      },
    },
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
      // The Whiteboard (Excalidraw, its fonts) and PDF export are several MB
      // that most visits never use, so they aren't downloaded up front: each
      // is cached the first time it loads (below), and works offline after.
      globIgnores: LAZY_FEATURE_GLOBS,
      runtimeCaching: [
        {
          urlPattern: LAZY_FEATURE_URL,
          handler: 'CacheFirst',
          options: {
            cacheName: 'lazy-features',
            expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'google-fonts-cache',
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
      ],
    },
  }), cloudflare(), seoPlugin(), excalidrawFontsPlugin(), excalidrawEnglishOnlyPlugin()],
})