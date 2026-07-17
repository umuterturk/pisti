export type PistiFirestoreStatus = 'waiting' | 'ready' | 'playing' | 'ended'

export interface PistiMatchPlayer {
  name: string
  joinedAt: number
  lastSeen?: number
  resigned?: boolean
  left?: boolean
}

export interface EmojiReaction {
  emoji: string
  from: string
  timestamp: number
}

/**
 * Firestore document shape for pisti-matches/{matchId}.
 *
 * Sync model: both clients deal identically from `seed`, then replay
 * `moves[]` (ordered card ids) through the pure engine.  Each turn has
 * a `turnDeadline`; the active client auto-plays if it expires.
 */
export interface PistiMatchDoc {
  status: PistiFirestoreStatus
  inviteCode: string
  seed: string
  round: number
  createdBy: string
  createdAt: unknown
  /** uid for seat 0 and seat 1 — populated once both players have joined. */
  seats: Record<string, string> | null
  /** Which seat plays first (set on join when 2nd player arrives). */
  firstSeat: 0 | 1 | null
  /** Ordered card ids; the ground truth for game state. */
  moves: string[]
  /** = moves.length; used for optimistic concurrency on writes. */
  moveSeq: number
  /** Epoch ms when the current turn expires. */
  turnDeadline: number
  players: Record<string, PistiMatchPlayer>
  rematchReady?: Record<string, boolean>
  endedReason?: 'completed' | 'forfeit_heartbeat' | 'resign'
  winnerUid?: string | null
  /** Seat (0 or 1) of the player who won the completed round. Null on a tie. Only set for endedReason: 'completed'. */
  winnerSeat?: 0 | 1 | null
  /** Latest emoji reactions sent between players */
  reactions?: EmojiReaction[]
}

/** Parsed view of a match snapshot, from the local player's perspective. */
export interface PistiMatchSnapshot {
  matchId: string
  inviteCode: string
  seed: string
  status: PistiFirestoreStatus
  round: number
  localSeat: 0 | 1 | null
  firstSeat: 0 | 1 | null
  seats: Record<string, string> | null
  moves: string[]
  turnDeadline: number
  opponentUid: string
  opponentName: string
  opponentLastSeen: number
  opponentResigned: boolean
  opponentLeft: boolean
  localWantsRematch: boolean
  opponentWantsRematch: boolean
  endedReason?: string
  winnerUid?: string | null
  reactions?: EmojiReaction[]
}
