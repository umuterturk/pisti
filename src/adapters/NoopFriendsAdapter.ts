import type {
  FriendEntry,
  FriendsPort,
  GameRequest,
  PlayerEntry,
  RivalryStats,
  UserLifetimeStats,
} from '../ports'

export class NoopFriendsAdapter implements FriendsPort {
  async syncProfile(_displayName: string): Promise<void> {}
  async syncLifetimeStats(_stats: UserLifetimeStats): Promise<void> {}
  async setPresence(_inMatch: boolean, _matchId?: string): Promise<void> {}
  async getUserStats(_uid: string): Promise<UserLifetimeStats | null> {
    return null
  }
  async getRivalry(_opponentUid: string): Promise<RivalryStats | null> {
    return null
  }
  async addFriend(_uid: string, _name: string): Promise<void> {}
  async removeFriend(_uid: string): Promise<void> {}
  async isFriend(_uid: string): Promise<boolean> {
    return false
  }
  async listFriends(): Promise<FriendEntry[]> {
    return []
  }
  async listOtherPlayers(): Promise<PlayerEntry[]> {
    return []
  }
  async recordMatchResult(
    _opponentUid: string,
    _opponentName: string,
    _result: 'win' | 'lose' | 'tie',
    _resultId?: string,
  ): Promise<void> {}
  async sendGameRequest(
    _toUid: string,
    _matchId: string,
    _inviteCode: string,
  ): Promise<GameRequest> {
    throw new Error('Friends unavailable')
  }
  subscribeIncomingRequests(_handler: (request: GameRequest | null) => void): () => void {
    return () => {}
  }
  async acceptGameRequest(_requestId: string): Promise<void> {}
  async declineGameRequest(_requestId: string): Promise<void> {}
  async cancelOutgoingRequest(_requestId: string): Promise<void> {}
}
