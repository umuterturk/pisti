import {
  getAnalytics,
  isSupported,
  logEvent,
  setUserProperties,
  type Analytics,
} from 'firebase/analytics'
import { getFirebaseApp } from './firebase/config'
import { isWeakDevice } from './perf/deviceTier'

/** GA4 / Firebase Analytics event params (undefined values are stripped). */
export type AnalyticsParams = Record<string, string | number | boolean | undefined>

export type PlayMode = 'solo' | 'mp_link' | 'mp_challenge' | 'mp_join'

export type HandResult = 'win' | 'lose' | 'tie'

export interface EndScreenContext {
  mode: PlayMode
  result: HandResult
  ended_reason: string
  score_margin: number
  match_games_player: number
  match_games_opponent: number
  hands_in_session: number
  bot_id?: string
  difficulty?: string
  was_opponent_rematch_nudge?: boolean
}

let analytics: Analytics | null = null
let initStarted = false

let playMode: PlayMode = 'solo'
let handsInSession = 0
let endScreenShownAt = 0
let lastEndContext: EndScreenContext | null = null
let localRematchPending = false
let rematchRequestedAt = 0
let handStartedAt = 0
/** Dedupes end_screen_view for a given hand key. */
let lastEndScreenKey: string | null = null
/** Dedupes challenge_receive for a given request id. */
let lastChallengeReceiveId: string | null = null
/** Dedupes rematch_offered_by_opponent for a given end-screen key. */
let lastRematchOfferKey: string | null = null

function cleanParams(params?: AnalyticsParams): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Lazily init Analytics once; no-ops when measurement ID missing or unsupported. */
export function initAnalytics(): void {
  if (initStarted) return
  initStarted = true

  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined
  if (!measurementId) return

  void isSupported()
    .then((ok) => {
      if (!ok) return null
      analytics = getAnalytics(getFirebaseApp())
      setUserProperties(analytics, {
        device_tier: isWeakDevice() ? 'lite' : 'full',
        is_pwa:
          window.matchMedia('(display-mode: standalone)').matches ||
          // iOS Safari "Add to Home Screen"
          ('standalone' in navigator &&
            Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
            ? 'yes'
            : 'no',
      })
      return analytics
    })
    .catch(() => {
      analytics = null
    })
}

export function track(name: string, params?: AnalyticsParams): void {
  initAnalytics()
  const cleaned = cleanParams(params)
  if (analytics) {
    logEvent(analytics, name, cleaned)
    return
  }
  // Init may still be in flight — retry shortly once.
  if (initStarted) {
    window.setTimeout(() => {
      if (analytics) logEvent(analytics, name, cleaned)
    }, 0)
  }
}

export function setAnalyticsUserProperties(
  props: Record<string, string | undefined>,
): void {
  initAnalytics()
  const cleaned = cleanParams(props) as Record<string, string> | undefined
  if (!cleaned) return
  if (analytics) {
    setUserProperties(analytics, cleaned)
    return
  }
  window.setTimeout(() => {
    if (analytics) setUserProperties(analytics, cleaned)
  }, 0)
}

export function getPlayMode(): PlayMode {
  return playMode
}

export function setPlayMode(mode: PlayMode): void {
  playMode = mode
  setAnalyticsUserProperties({ preferred_mode: mode })
}

export function resetSessionHands(): void {
  handsInSession = 0
  localRematchPending = false
  rematchRequestedAt = 0
  lastEndScreenKey = null
  lastEndContext = null
  endScreenShownAt = 0
  lastRematchOfferKey = null
}

export function noteHandStarted(): void {
  handStartedAt = Date.now()
}

export function getHandDurationSec(): number {
  if (!handStartedAt) return 0
  return Math.max(0, Math.round((Date.now() - handStartedAt) / 1000))
}

export function noteHandCompleted(): number {
  handsInSession += 1
  return handsInSession
}

export function getHandsInSession(): number {
  return handsInSession
}

export function noteEndScreenShown(ctx: EndScreenContext, dedupeKey: string): boolean {
  if (lastEndScreenKey === dedupeKey) return false
  lastEndScreenKey = dedupeKey
  endScreenShownAt = Date.now()
  lastEndContext = ctx
  return true
}

export function takeEndScreenDecisionParams(
  extra?: AnalyticsParams,
): AnalyticsParams {
  const timeOnScreen =
    endScreenShownAt > 0
      ? Math.max(0, Math.round((Date.now() - endScreenShownAt) / 1000))
      : 0
  return {
    ...lastEndContext,
    time_on_end_screen_s: timeOnScreen,
    ...extra,
  }
}

export function noteLocalRematchRequest(): void {
  localRematchPending = true
  rematchRequestedAt = Date.now()
}

export function clearLocalRematchPending(): void {
  localRematchPending = false
  rematchRequestedAt = 0
}

export function isLocalRematchPending(): boolean {
  return localRematchPending
}

export function getRematchWaitSec(): number {
  if (!rematchRequestedAt) return 0
  return Math.max(0, Math.round((Date.now() - rematchRequestedAt) / 1000))
}

export function noteRematchOffer(dedupeKey: string): boolean {
  if (lastRematchOfferKey === dedupeKey) return false
  lastRematchOfferKey = dedupeKey
  return true
}

export function noteChallengeReceived(requestId: string): boolean {
  if (lastChallengeReceiveId === requestId) return false
  lastChallengeReceiveId = requestId
  return true
}

export function winnerToResult(
  winner: 'player' | 'opponent' | 'tie' | null | undefined,
): HandResult {
  if (winner === 'player') return 'win'
  if (winner === 'opponent') return 'lose'
  return 'tie'
}
