/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// How often to ask the browser to look for a newer deployed version.
const UPDATE_INTERVAL_MS = 60_000

// In `autoUpdate` mode vite-plugin-pwa reloads the page automatically once a new
// service worker activates. The catch: it only checks for a new version at page
// load. Long-lived sessions (installed PWA, a tab that never fully closes on
// mobile) therefore keep running stale code and miss fixes. We register the SW
// ourselves and actively poll for updates so a fresh deploy is picked up within
// a minute, and immediately whenever the app regains focus.
export function setupPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        // Ignore transient failures (e.g. offline); we'll retry on the next tick.
        registration.update().catch(() => {})
      }

      setInterval(checkForUpdate, UPDATE_INTERVAL_MS)

      // Re-check the moment the user comes back to the game.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
      window.addEventListener('focus', checkForUpdate)
    },
  })
}
