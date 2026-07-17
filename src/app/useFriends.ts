import { useCallback, useEffect, useRef, useState } from 'react'
import type { FriendEntry, FriendsPort, GameRequest, PlayerEntry } from '../ports'

export interface RefreshFriendsOpts {
  silent?: boolean
  /** Skip fetch if a successful refresh completed within this many ms. */
  maxAgeMs?: number
}

export function useFriends(friends: FriendsPort, enabled: boolean) {
  const [friendList, setFriendList] = useState<FriendEntry[]>([])
  const [otherPlayers, setOtherPlayers] = useState<PlayerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [incomingRequest, setIncomingRequest] = useState<GameRequest | null>(null)
  const lastFetchedAtRef = useRef(0)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async (opts?: RefreshFriendsOpts) => {
    if (!enabled) {
      setFriendList([])
      setOtherPlayers([])
      setLoading(false)
      return
    }

    const maxAgeMs = opts?.maxAgeMs
    if (
      typeof maxAgeMs === 'number' &&
      maxAgeMs > 0 &&
      lastFetchedAtRef.current > 0 &&
      Date.now() - lastFetchedAtRef.current < maxAgeMs
    ) {
      return
    }

    if (inFlightRef.current) {
      await inFlightRef.current
      return
    }

    const silent = opts?.silent === true
    if (!silent) setLoading(true)

    const run = (async () => {
      try {
        const [nextFriends, playerList] = await Promise.all([
          friends.listFriends(),
          friends.listOtherPlayers(),
        ])
        setFriendList(nextFriends)
        setOtherPlayers(playerList)
        lastFetchedAtRef.current = Date.now()
      } catch {
        if (!silent) {
          setFriendList([])
          setOtherPlayers([])
        }
      } finally {
        if (!silent) setLoading(false)
        inFlightRef.current = null
      }
    })()

    inFlightRef.current = run
    await run
  }, [friends, enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) {
      setIncomingRequest(null)
      return () => {}
    }
    return friends.subscribeIncomingRequests(setIncomingRequest)
  }, [friends, enabled])

  const removeFriend = useCallback(
    async (uid: string) => {
      setFriendList((prev) => prev.filter((f) => f.uid !== uid))
      try {
        await friends.removeFriend(uid)
      } catch {
        void refresh({ silent: true })
      }
    },
    [friends, refresh],
  )

  const addFriend = useCallback(
    async (player: PlayerEntry) => {
      await friends.addFriend(player.uid, player.name)
      await refresh({ silent: true })
    },
    [friends, refresh],
  )

  const sendChallenge = useCallback(
    async (toUid: string, matchId: string, inviteCode: string) =>
      friends.sendGameRequest(toUid, matchId, inviteCode),
    [friends],
  )

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await friends.acceptGameRequest(requestId)
      setIncomingRequest(null)
    },
    [friends],
  )

  const declineRequest = useCallback(
    async (requestId: string) => {
      await friends.declineGameRequest(requestId)
      setIncomingRequest(null)
    },
    [friends],
  )

  const cancelOutgoingRequest = useCallback(
    async (requestId: string) => {
      await friends.cancelOutgoingRequest(requestId)
    },
    [friends],
  )

  return {
    friendList,
    otherPlayers,
    loading,
    refresh,
    incomingRequest,
    removeFriend,
    addFriend,
    sendChallenge,
    acceptRequest,
    declineRequest,
    cancelOutgoingRequest,
  }
}
