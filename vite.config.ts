import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://umuterturk.github.io/pisti/ on GitHub Pages, so all
// asset URLs must be prefixed with the repository name.
export default defineConfig({
  base: '/pisti/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register + poll for updates ourselves in src/pwa.ts, so the plugin
      // must not also inject its own bare registration script.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      workbox: {
        // Take control immediately so an updated worker can activate (and the
        // page auto-reload) without waiting for every tab to close first.
        clientsClaim: true,
        skipWaiting: true,
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
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
