/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// How often to ask the browser to look for a newer deployed version.
const UPDATE_INTERVAL_MS = 60_000

// The service worker runs in `prompt` mode: a freshly deployed version installs
// in the background and then WAITS. We poll aggressively (interval + focus) so
// the wait state is reached within a minute of a deploy, and the app applies it
// at a safe moment — on the main menu — via applyUpdate(), which activates the
// waiting worker and reloads onto the new version. Never mid-hand.

type UpdateListener = (ready: boolean) => void

let updateReady = false
let applyFn: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<UpdateListener>()

/** Subscribe to "a new version is installed and waiting". Fires immediately
 *  with the current state; returns an unsubscribe function. */
export function subscribeUpdateReady(listener: UpdateListener): () => void {
  listeners.add(listener)
  listener(updateReady)
  return () => {
    listeners.delete(listener)
  }
}

/** Activate the waiting service worker and reload the page onto it. */
export function applyUpdate(): void {
  void applyFn?.(true)
}

export function setupPwa() {
  applyFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true
      for (const listener of listeners) listener(true)
    },
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
