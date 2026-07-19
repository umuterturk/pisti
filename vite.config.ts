import { execSync } from 'node:child_process'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Identifies this exact build so the client can detect a stale version even
// if the service worker's own update check never fires (some WebKit-based
// browsers, notably Firefox/Chrome-on-iOS which all run on Safari's engine,
// are unreliable about SW update detection). See src/pwa.ts.
function getBuildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return Date.now().toString(36)
  }
}

const buildId = getBuildId()

// Emits a tiny, never-precached version.json so clients can poll it with a
// cache: 'no-store' fetch (bypasses HTTP cache entirely) to detect new
// deploys, independent of the service worker lifecycle.
function versionFilePlugin(): Plugin {
  return {
    name: 'pisti-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      })
    },
  }
}

// Served from https://umuterturk.github.io/pisti/ on GitHub Pages, so all
// asset URLs must be prefixed with the repository name.
export default defineConfig({
  base: '/pisti/',
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    versionFilePlugin(),
    VitePWA({
      // 'prompt': the updated worker installs and WAITS. The app decides when
      // to activate it (src/pwa.ts applyUpdate) — on the main menu, never
      // mid-hand. 'autoUpdate' + skipWaiting hard-reloaded players mid-game.
      registerType: 'prompt',
      // We register + poll for updates ourselves in src/pwa.ts, so the plugin
      // must not also inject its own bare registration script.
      injectRegister: false,
      includeAssets: [
        'favicon-32.png',
        'apple-touch-icon.png',
        'og-image.jpg',
      ],
      workbox: {
        // skipWaiting must stay off (worker waits for applyUpdate), but claim
        // clients on activation so the reload lands on the new version at once.
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        // Never let workbox precache this — every fetch of it must reach the
        // network so version polling in src/pwa.ts can trust it.
        globIgnores: ['version.json'],
      },
      manifest: {
        name: 'Pişti',
        short_name: 'Pişti',
        description: 'Tactile Pişti card game prototype',
        theme_color: '#1a472a',
        background_color: '#0d2818',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/pisti/',
        start_url: '/pisti/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
