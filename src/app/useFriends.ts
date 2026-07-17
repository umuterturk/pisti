import { useCallback, useEffect, useState } from 'react'
import type { FriendEntry, FriendsPort, GameRequest } from '../ports'

export function useFriends(friends: FriendsPort, enabled: boolean) {
  const [friendList, setFriendList] = useState<FriendEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [incomingRequest, setIncomingRequest] = useState<GameRequest | null>(null)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabled) {
      setFriendList([])
      setLoading(false)
      return
    }
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    try {
      const list = await friends.listFriends()
      setFriendList(list)
    } catch {
      if (!silent) setFriendList([])
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
    loading,
    refresh,
    incomingRequest,
    sendChallenge,
    acceptRequest,
    declineRequest,
    cancelOutgoingRequest,
  }
}
