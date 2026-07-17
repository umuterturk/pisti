import { useEffect, useRef } from 'react'
import type { FriendsPort } from '../ports'

const HEARTBEAT_MS = 30_000
/** Stop presence writes after the tab has been hidden this long (cost / battery). */
const IDLE_PAUSE_MS = 60_000

export function useUserPresence(
  friends: FriendsPort,
  displayName: string,
  inMatch: boolean,
  matchId: string | undefined,
  enabled: boolean,
) {
  const inMatchRef = useRef(inMatch)
  const matchIdRef = useRef(matchId)
  inMatchRef.current = inMatch
  matchIdRef.current = matchId

  useEffect(() => {
    if (!enabled || !displayName.trim()) return
    void friends.syncProfile(displayName)
  }, [friends, enabled, displayName])

  useEffect(() => {
    if (!enabled) return

    let heartbeatId: number | null = null
    let idleTimerId: number | null = null
    let paused = false

    const clearHeartbeat = () => {
      if (heartbeatId != null) {
        window.clearInterval(heartbeatId)
        heartbeatId = null
      }
    }

    const clearIdleTimer = () => {
      if (idleTimerId != null) {
        window.clearTimeout(idleTimerId)
        idleTimerId = null
      }
    }

    const beat = () => {
      void friends.setPresence(inMatchRef.current, matchIdRef.current)
    }

    const startHeartbeat = () => {
      clearHeartbeat()
      beat()
      heartbeatId = window.setInterval(beat, HEARTBEAT_MS)
    }

    const pausePresence = () => {
      if (paused) return
      paused = true
      clearHeartbeat()
      // Drop online / in-match immediately so friend lists don't linger for ONLINE_MS.
      void friends.setPresence(false)
    }

    const resumePresence = () => {
      clearIdleTimer()
      if (!paused && heartbeatId != null) return
      paused = false
      startHeartbeat()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearIdleTimer()
        idleTimerId = window.setTimeout(pausePresence, IDLE_PAUSE_MS)
      } else {
        resumePresence()
      }
    }

    if (document.visibilityState === 'hidden') {
      idleTimerId = window.setTimeout(pausePresence, IDLE_PAUSE_MS)
      // Still heartbeating until the idle pause fires
      startHeartbeat()
    } else {
      startHeartbeat()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearIdleTimer()
      clearHeartbeat()
      if (inMatchRef.current) {
        void friends.setPresence(false)
      }
    }
  }, [friends, enabled])

  // Push presence immediately when match state changes (while not idle-paused).
  useEffect(() => {
    if (!enabled) return
    if (document.visibilityState === 'hidden') return
    void friends.setPresence(inMatch, matchId)
  }, [friends, enabled, inMatch, matchId])
}
