import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://umuterturk.github.io/pisti/ on GitHub Pages, so all
// asset URLs must be prefixed with the repository name.
export default defineConfig({
  base: '/pisti/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
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
