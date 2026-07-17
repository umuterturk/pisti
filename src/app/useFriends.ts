import { useCallback, useEffect, useState } from 'react'
import type { FriendEntry, FriendsPort, GameRequest, PlayerEntry } from '../ports'

export function useFriends(friends: FriendsPort, enabled: boolean) {
  const [friendList, setFriendList] = useState<FriendEntry[]>([])
  const [otherPlayers, setOtherPlayers] = useState<PlayerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [incomingRequest, setIncomingRequest] = useState<GameRequest | null>(null)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled) {
      setFriendList([])
      setOtherPlayers([])
      setLoading(false)
      return
    }
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    try {
      const [friendList, playerList] = await Promise.all([
        friends.listFriends(),
        friends.listOtherPlayers(),
      ])
      setFriendList(friendList)
      setOtherPlayers(playerList)
    } catch {
      if (!silent) {
        setFriendList([])
        setOtherPlayers([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
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
