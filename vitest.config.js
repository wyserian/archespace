import { defineConfig } from 'vitest/config'

// Standalone test config so the app's Vite/Cloudflare plugins don't load
// during unit tests. Node environment; a test that needs a DOM opts into jsdom
// in its first line.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
