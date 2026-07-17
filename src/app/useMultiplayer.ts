import { useCallback, useEffect, useRef, useState } from 'react'
import type { MultiplayerPort } from '../ports'
import type { PistiMatchSnapshot } from '../multiplayer/types'

export type MpPhase =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'countdown'
  | 'playing'
  | 'ended'

export interface MultiplayerState {
  phase: MpPhase
  matchId: string | null
  inviteCode: string | null
  seed: string | null
  round: number
  localSeat: 0 | 1 | null
  firstSeat: 0 | 1 | null
  moves: string[]
  turnDeadline: number
  opponentUid: string | null
  opponentName: string | null
  opponentLastSeen: number
  opponentResigned: boolean
  opponentLeft: boolean
  localWantsRematch: boolean
  opponentWantsRematch: boolean
  endedReason?: string
  winnerUid?: string | null
  error: string | null
}

const INITIAL: MultiplayerState = {
  phase: 'idle',
  matchId: null,
  inviteCode: null,
  seed: null,
  round: 1,
  localSeat: null,
  firstSeat: null,
  moves: [],
  turnDeadline: 0,
  opponentUid: null,
  opponentName: null,
  opponentLastSeen: 0,
  opponentResigned: false,
  opponentLeft: false,
  localWantsRematch: false,
  opponentWantsRematch: false,
  error: null,
}

/** Prefer a future deadline over a dead/zero one so lagging snaps don't kill the HUD timer. */
function pickDeadline(prev: number, incoming: number): number {
  const now = Date.now()
  if (incoming > now) return incoming
  if (prev > now) return prev
  return incoming
}

export function useMultiplayer(mp: MultiplayerPort, displayName: string) {
  const [state, setState] = useState<MultiplayerState>(INITIAL)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    mp.setDisplayName(displayName)
  }, [mp, displayName])

  const update = useCallback((patch: Partial<MultiplayerState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      stateRef.current = next
      return next
    })
  }, [])

  const handleSnapshot = useCallback(
    (snap: PistiMatchSnapshot | null) => {
      if (!snap) {
        const prev = stateRef.current
        if (prev.phase === 'playing' || prev.phase === 'waiting' || prev.phase === 'countdown') {
          update({ phase: 'ended', opponentLeft: true })
        }
        return
      }

      const prev = stateRef.current
      const turnDeadline = pickDeadline(prev.turnDeadline, snap.turnDeadline ?? 0)

      const common = {
        matchId: snap.matchId,
        inviteCode: snap.inviteCode,
        seed: snap.seed,
        localSeat: snap.localSeat,
        firstSeat: snap.firstSeat,
        opponentUid: snap.opponentUid,
        opponentName: snap.opponentName,
        opponentLastSeen: snap.opponentLastSeen,
        round: snap.round,
        moves: snap.moves,
        turnDeadline,
        opponentResigned: snap.opponentResigned,
        opponentLeft: snap.opponentLeft,
        localWantsRematch: snap.localWantsRematch,
        opponentWantsRematch: snap.opponentWantsRematch,
        endedReason: snap.endedReason,
        winnerUid: snap.winnerUid,
      }

      if (snap.status === 'waiting') {
        update({ ...common, phase: 'waiting', error: null })
        return
      }

      if (snap.status === 'ready') {
        if (prev.phase !== 'countdown' && prev.phase !== 'playing') {
          update({ ...common, phase: 'countdown', error: null })
        } else {
          const { turnDeadline: _stale, ...rest } = common
          update(rest)
        }
        return
      }

      if (snap.status === 'ended') {
        update({ ...common, phase: 'ended' })
        return
      }

      if (prev.phase !== 'playing') {
        update({ ...common, phase: 'playing', error: null })
      } else {
        update(common)
      }
    },
    [update],
  )

  useEffect(() => {
    const matchId = stateRef.current.matchId
    if (!matchId) return
    const unsub = mp.subscribe(handleSnapshot)
    return unsub
  }, [mp, handleSnapshot, state.matchId])

  const createRoom = useCallback(async (): Promise<string | null> => {
    update({ phase: 'creating', error: null })
    try {
      const code = await mp.createRoom()
      const matchId = mp.getActiveMatchId()
      update({ phase: 'waiting', inviteCode: code, matchId })
      return code
    } catch (e) {
      update({ phase: 'idle', error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }, [mp, update])

  const joinRoom = useCallback(
    async (code: string) => {
      update({ phase: 'creating', error: null })
      try {
        await mp.joinRoom(code)
        const matchId = mp.getActiveMatchId()
        update({ matchId })
      } catch (e) {
        update({ phase: 'idle', error: e instanceof Error ? e.message : String(e) })
        throw e
      }
    },
    [mp, update],
  )

  const rejoinMatch = useCallback(
    async (matchId: string) => {
      try {
        await mp.rejoinMatch(matchId)
        update({ matchId })
      } catch {
        // Snapshot handler will set state once it arrives
      }
    },
    [mp, update],
  )

  const startPlaying = useCallback((turnDeadline?: number) => {
    update({
      phase: 'playing',
      ...(typeof turnDeadline === 'number' && turnDeadline > 0
        ? { turnDeadline }
        : {}),
    })
  }, [update])

  const setTurnDeadline = useCallback((turnDeadline: number) => {
    update({ turnDeadline })
  }, [update])

  const requestRematch = useCallback(async () => {
    await mp.requestRematch()
    update({ localWantsRematch: true })
  }, [mp, update])

  const leave = useCallback(
    async (forfeit = false) => {
      await mp.leave(forfeit)
      setState(INITIAL)
    },
    [mp],
  )

  const forfeitForHeartbeat = useCallback(async () => {
    await mp.forfeitForHeartbeat()
    update({ phase: 'ended', endedReason: 'forfeit_heartbeat' })
  }, [mp, update])

  const reset = useCallback(() => {
    setState(INITIAL)
  }, [])

  return {
    mpState: state,
    createRoom,
    joinRoom,
    rejoinMatch,
    startPlaying,
    setTurnDeadline,
    requestRematch,
    leave,
    forfeitForHeartbeat,
    reset,
  }
}
