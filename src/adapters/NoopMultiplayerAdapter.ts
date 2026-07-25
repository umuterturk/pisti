import type { MultiplayerPort } from '../ports'
import type { PistiMatchSnapshot } from '../multiplayer/types'
import type { GameMode } from '../game/engine'

export class NoopMultiplayerAdapter implements MultiplayerPort {
  setDisplayName(_name: string): void {}
  subscribe(_handler: (snap: PistiMatchSnapshot | null) => void): () => void {
    return () => {}
  }
  async createRoom(_mode?: GameMode): Promise<string> { return '' }
  async joinRoom(_code: string): Promise<void> {}
  async rejoinMatch(_matchId: string): Promise<void> {}
  async playMove(_cardId: string, _moveSeq: number, _nextDeadline: number): Promise<void> {}
  async requestRematch(): Promise<void> {}
  async leave(_forfeit?: boolean): Promise<void> {}
  async forfeitForHeartbeat(): Promise<void> {}
  getActiveMatchId(): string | null { return null }
  async sendEmoji(_emoji: string): Promise<void> {}
  async sendText(_text: string): Promise<void> {}
  getLocalUid(): string | null { return null }
}
