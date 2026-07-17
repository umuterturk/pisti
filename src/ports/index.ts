import type { PistiMatchSnapshot } from '../multiplayer/types'

/** Multiplayer room / move / presence contract. */
export interface MultiplayerPort {
  setDisplayName(name: string): void
  subscribe(handler: (snap: PistiMatchSnapshot | null) => void): () => void
  createRoom(): Promise<string>
  joinRoom(code: string): Promise<void>
  rejoinMatch(matchId: string): Promise<void>
  playMove(cardId: string, moveSeq: number, nextDeadline: number): Promise<void>
  requestRematch(): Promise<void>
  leave(forfeit?: boolean): Promise<void>
  forfeitForHeartbeat(): Promise<void>
  getActiveMatchId(): string | null
}

export interface FriendEntry {
  uid: string
  name: string
  addedAt: number
  wins: number
  losses: number
  ties: number
  online: boolean
  inMatch: boolean
  lastPlayedAt?: number
}

export type GameRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired'

export interface GameRequest {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  matchId: string
  inviteCode: string
  status: GameRequestStatus
  createdAt: number
}

export interface UserLifetimeStats {
  handsWon: number
  handsPlayed: number
}

export interface FriendsPort {
  syncProfile(displayName: string): Promise<void>
  /** Persist local lifetime tallies onto the Firebase user profile. */
  syncLifetimeStats(stats: UserLifetimeStats): Promise<void>
  /** Heartbeat + match presence for online status in friend lists. */
  setPresence(inMatch: boolean, matchId?: string): Promise<void>
  /** Read another player's published lifetime tallies (or null if missing). */
  getUserStats(uid: string): Promise<UserLifetimeStats | null>
  addFriend(uid: string, name: string): Promise<void>
  isFriend(uid: string): Promise<boolean>
  listFriends(): Promise<FriendEntry[]>
  /** Update head-to-head W/L/T against a friend (idempotent per resultId). */
  recordMatchResult(
    opponentUid: string,
    opponentName: string,
    result: 'win' | 'lose' | 'tie',
    resultId?: string,
  ): Promise<void>
  sendGameRequest(toUid: string, matchId: string, inviteCode: string): Promise<GameRequest>
  subscribeIncomingRequests(handler: (request: GameRequest | null) => void): () => void
  acceptGameRequest(requestId: string): Promise<void>
  declineGameRequest(requestId: string): Promise<void>
  cancelOutgoingRequest(requestId: string): Promise<void>
}

export interface StoragePort {
  loadUsername(): Promise<string>
  saveUsername(name: string): Promise<void>
  loadSession(): PistiSession | null
  saveSession(session: PistiSession): void
  clearSession(): void
}

export interface PistiSession {
  matchId: string
  inviteCode: string
}
