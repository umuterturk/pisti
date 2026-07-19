const STORAGE_KEY = 'pisti:lifetime-stats-v1'
const RECORDED_IDS_KEY = 'pisti:recorded-hand-ids-v1'
const MAX_RECORDED_IDS = 200

export interface LifetimeStats {
  handsPlayed: number
  handsWon: number
  multiplayerGamesPlayed: number
  multiplayerGamesWon: number
  winStreak: number
  bestWinStreak: number
}

export interface RecordHandOutcome {
  stats: LifetimeStats
  /** False when `resultId` was already counted (rejoin / Strict Mode / retry). */
  didRecord: boolean
}

const EMPTY_STATS: LifetimeStats = {
  handsPlayed: 0,
  handsWon: 0,
  multiplayerGamesPlayed: 0,
  multiplayerGamesWon: 0,
  winStreak: 0,
  bestWinStreak: 0,
}

/** In-memory set survives React Strict Mode remounts within the same tab. */
const recordedIdsMemory = new Set<string>()

function loadRecordedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECORDED_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function persistRecordedId(resultId: string): void {
  recordedIdsMemory.add(resultId)
  try {
    const prev = loadRecordedIds().filter((id) => id !== resultId)
    prev.push(resultId)
    const trimmed = prev.length > MAX_RECORDED_IDS ? prev.slice(-MAX_RECORDED_IDS) : prev
    window.localStorage.setItem(RECORDED_IDS_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage unavailable — memory set still blocks same-tab duplicates.
  }
}

/** Whether this hand result id was already applied to lifetime stats. */
export function wasHandRecorded(resultId: string): boolean {
  if (recordedIdsMemory.has(resultId)) return true
  const stored = loadRecordedIds()
  if (stored.includes(resultId)) {
    recordedIdsMemory.add(resultId)
    return true
  }
  return false
}

export function getLifetimeStats(): LifetimeStats {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATS
    const parsed = JSON.parse(raw)
    return {
      handsPlayed: parsed.handsPlayed ?? 0,
      handsWon: parsed.handsWon ?? 0,
      multiplayerGamesPlayed: parsed.multiplayerGamesPlayed ?? 0,
      multiplayerGamesWon: parsed.multiplayerGamesWon ?? 0,
      winStreak: parsed.winStreak ?? 0,
      bestWinStreak: parsed.bestWinStreak ?? 0,
    }
  } catch {
    return EMPTY_STATS
  }
}

/**
 * Records the outcome of a finished hand.
 * Pass a stable `resultId` so rejoins / Strict Mode remounts do not double-count.
 */
export function recordHandResult(
  won: boolean,
  mode: 'solo' | 'multiplayer' = 'solo',
  resultId?: string,
): RecordHandOutcome {
  const prev = getLifetimeStats()
  if (resultId && wasHandRecorded(resultId)) {
    return { stats: prev, didRecord: false }
  }

  const winStreak = won ? prev.winStreak + 1 : 0
  const next: LifetimeStats = {
    handsPlayed: prev.handsPlayed + 1,
    handsWon: prev.handsWon + (won ? 1 : 0),
    multiplayerGamesPlayed:
      prev.multiplayerGamesPlayed + (mode === 'multiplayer' ? 1 : 0),
    multiplayerGamesWon:
      prev.multiplayerGamesWon + (mode === 'multiplayer' && won ? 1 : 0),
    winStreak,
    bestWinStreak: Math.max(prev.bestWinStreak, winStreak),
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode, quota) — stats just won't persist.
  }
  if (resultId) persistRecordedId(resultId)
  return { stats: next, didRecord: true }
}
