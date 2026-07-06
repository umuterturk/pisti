import type { GameState } from './useGame'

const STORAGE_KEY = 'pisti:active-game-v1'

// Present in the URL for as long as a match is in progress, so a refresh
// (which keeps the address bar as-is) knows to resume from storage instead
// of showing the home page. ("s" for single player.)
export const CONTINUE_PARAM = 's'

export function hasContinueParam(): boolean {
  return new URLSearchParams(window.location.search).has(CONTINUE_PARAM)
}

export function setContinueParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.set(CONTINUE_PARAM, '1')
  window.history.replaceState(null, '', url)
}

export function clearContinueParam(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(CONTINUE_PARAM)
  window.history.replaceState(null, '', url)
}

export function saveGame(state: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable (private mode, quota) — the game just won't persist.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

export function clearGame(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Reads a saved match iff the URL says one should be resumed. */
export function readContinuedGame(): GameState | null {
  if (!hasContinueParam()) return null
  return loadGame()
}
