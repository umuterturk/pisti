/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// Injected by vite.config.ts (`define`) — the commit/build this bundle was
// built from. Baked into the JS, so an old tab keeps reporting its own old
// value even while version.json on the server reports the new one.
declare const __APP_BUILD_ID__: string

// Minimum time between update checks — however many times checkForNewVersion()
// is called (landing on the main menu, switching its Home/Friends tab, the
// tab/PWA regaining focus/visibility, ...) within this window, only the first
// one actually hits the network.
const CHECK_COOLDOWN_MS = 60_000

// How long to wait for the graceful SW handoff (skipWaiting → controllerchange
// → reload) before assuming it's stuck and forcing a hard reload instead.
const GRACEFUL_RELOAD_TIMEOUT_MS = 4_000

// The service worker runs in `prompt` mode: a freshly deployed version installs
// in the background and then WAITS. checkForNewVersion() is called from the
// UI whenever the player re-engages the main menu (see StartScreen.tsx) or the
// tab/PWA regains focus/visibility (below), and the app applies the update at
// a safe moment — on the main menu — via applyUpdate(), which activates the
// waiting worker and reloads onto the new version. Never mid-hand.
//
// The SW's own update check is not trustworthy on every browser (WebKit —
// which underlies ALL iOS browsers, "Firefox" and "Chrome" on iPhone/iPad
// included — has a long history of flaky service worker update detection).
// So we also poll a plain version.json with `cache: 'no-store'`, which
// bypasses HTTP caching and the service worker entirely (see vite.config.ts).
// Either signal sets the same updateReady flag; applyUpdate() always falls
// back to a nuclear unregister-and-reload if the graceful path doesn't land.

type UpdateListener = (ready: boolean) => void

let updateReady = false
let applyFn: ((reloadPage?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined
let lastCheckAt = 0
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

/** Unregister every service worker and clear all Cache Storage entries, then
 *  force a real network navigation. Guarantees a fresh load even if the SW
 *  is stuck, broken, or never handed off control (seen on WebKit/iOS). */
async function forceHardReload(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((registrations ?? []).map((r) => r.unregister()))
  } catch {
    // Best effort — fall through to reload regardless.
  }
  try {
    const keys = await caches?.keys()
    await Promise.all((keys ?? []).map((key) => caches.delete(key)))
  } catch {
    // Best effort.
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_v', Date.now().toString(36))
  window.location.replace(url.toString())
}

/** Activate the waiting service worker and reload the page onto it. Falls
 *  back to a hard reload if the graceful handoff doesn't land in time. */
export function applyUpdate(): void {
  void applyFn?.(true)
  setTimeout(() => {
    void forceHardReload()
  }, GRACEFUL_RELOAD_TIMEOUT_MS)
}

/** Fetch version.json bypassing HTTP cache and the service worker, and flag
 *  an update as ready if it doesn't match the build this tab is running. */
function checkVersionFile() {
  const url = `${import.meta.env.BASE_URL}version.json?_=${Date.now().toString(36)}`
  fetch(url, { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<{ buildId?: string }>) : null))
    .then((data) => {
      if (!data?.buildId || data.buildId === __APP_BUILD_ID__ || updateReady) return
      updateReady = true
      for (const listener of listeners) listener(true)
    })
    .catch(() => {
      // Ignore transient failures (e.g. offline); we'll retry on the next tick.
    })
}

/** Ask the browser + server whether a newer build exists. Call this whenever
 *  the player lands on or re-engages the main menu — a no-op if it was
 *  already called within the last CHECK_COOLDOWN_MS. */
export function checkForNewVersion(): void {
  const now = Date.now()
  if (now - lastCheckAt < CHECK_COOLDOWN_MS) return
  lastCheckAt = now
  // Ignore transient failures (e.g. offline); the next trigger will retry.
  registration?.update().catch(() => {})
  checkVersionFile()
}

export function setupPwa() {
  applyFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true
      for (const listener of listeners) listener(true)
    },
    onRegisteredSW(_swUrl, reg) {
      registration = reg
    },
  })

  // Covers the very first "landing" on the main menu at app boot, before
  // StartScreen has even mounted.
  checkForNewVersion()

  // Also covers the tab/PWA already being open and the player just coming
  // back to it (switching apps, waking the phone, ...) without triggering
  // any in-app navigation. Cheap: checkForNewVersion() no-ops under cooldown.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForNewVersion()
  })
  window.addEventListener('focus', checkForNewVersion)
}
