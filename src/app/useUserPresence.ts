import { useEffect } from 'react'
import type { FriendsPort } from '../ports'

const HEARTBEAT_MS = 30_000

export function useUserPresence(
  friends: FriendsPort,
  displayName: string,
  inMatch: boolean,
  matchId: string | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !displayName.trim()) return
    void friends.syncProfile(displayName)
  }, [friends, enabled, displayName])

  useEffect(() => {
    if (!enabled) return

    void friends.setPresence(inMatch, matchId)

    if (inMatch) {
      // Clear presence if we unmount / leave the match while still flagged in-match
      return () => {
        void friends.setPresence(false)
      }
    }

    const interval = window.setInterval(() => {
      void friends.setPresence(false)
    }, HEARTBEAT_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [friends, enabled, inMatch, matchId])
}
