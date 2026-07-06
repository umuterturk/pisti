const STORAGE_KEY = 'pisti:lifetime-stats-v1'

export interface LifetimeStats {
  handsPlayed: number
  handsWon: number
  winStreak: number
  bestWinStreak: number
}

const EMPTY_STATS: LifetimeStats = {
  handsPlayed: 0,
  handsWon: 0,
  winStreak: 0,
  bestWinStreak: 0,
}

export function getLifetimeStats(): LifetimeStats {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATS
    const parsed = JSON.parse(raw)
    return {
      handsPlayed: parsed.handsPlayed ?? 0,
      handsWon: parsed.handsWon ?? 0,
      winStreak: parsed.winStreak ?? 0,
      bestWinStreak: parsed.bestWinStreak ?? 0,
    }
  } catch {
    return EMPTY_STATS
  }
}

/** Records the outcome of a finished hand, persisting the running tally. */
export function recordHandResult(won: boolean): LifetimeStats {
  const prev = getLifetimeStats()
  const winStreak = won ? prev.winStreak + 1 : 0
  const next: LifetimeStats = {
    handsPlayed: prev.handsPlayed + 1,
    handsWon: prev.handsWon + (won ? 1 : 0),
    winStreak,
    bestWinStreak: Math.max(prev.bestWinStreak, winStreak),
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode, quota) — stats just won't persist.
  }
  return next
}
