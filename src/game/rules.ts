import type { Card } from './cards'

export const PISTI_BONUS = 10
export const DOUBLE_PISTI_BONUS = 20

export interface CaptureResult {
  captured: boolean
  pisti: boolean
  doublePisti: boolean
}

export function checkCapture(playedCard: Card, pile: Card[]): CaptureResult {
  if (pile.length === 0) {
    return { captured: false, pisti: false, doublePisti: false }
  }

  const topCard = pile[pile.length - 1]
  const matchesRank = playedCard.rank === topCard.rank
  const isJack = playedCard.rank === 'J'
  const captured = matchesRank || isJack

  // A Pişti is capturing a single face-up card with a matching rank.
  const pisti = captured && pile.length === 1 && matchesRank
  // A double Pişti is a Jack landing on a lone Jack (worth twice as much).
  const doublePisti = pisti && isJack

  return { captured, pisti, doublePisti }
}

export function cardPoints(card: Card): number {
  if (card.rank === 'J') return 1
  if (card.rank === 'A') return 1
  if (card.rank === '10' && card.suit === 'diamonds') return 3
  if (card.rank === '2' && card.suit === 'clubs') return 2
  return 0
}

export interface SideScore {
  cardCount: number
  cardPoints: number
  pistiCount: number
  doublePistiCount: number
  pistiPoints: number
  majorityBonus: number
  total: number
}

export interface Scoreboard {
  player: SideScore
  opponent: SideScore
  winner: 'player' | 'opponent' | 'tie'
}

function sumCardPoints(cards: Card[]): number {
  return cards.reduce((total, card) => total + cardPoints(card), 0)
}

export function computeScoreboard(
  playerCards: Card[],
  opponentCards: Card[],
  playerPisti: number,
  opponentPisti: number,
  playerDoublePisti = 0,
  opponentDoublePisti = 0,
): Scoreboard {
  const playerMajority = playerCards.length > opponentCards.length ? 3 : 0
  const opponentMajority = opponentCards.length > playerCards.length ? 3 : 0

  const player: SideScore = {
    cardCount: playerCards.length,
    cardPoints: sumCardPoints(playerCards),
    pistiCount: playerPisti,
    doublePistiCount: playerDoublePisti,
    pistiPoints: playerPisti * PISTI_BONUS + playerDoublePisti * DOUBLE_PISTI_BONUS,
    majorityBonus: playerMajority,
    total: 0,
  }
  player.total = player.cardPoints + player.pistiPoints + player.majorityBonus

  const opponent: SideScore = {
    cardCount: opponentCards.length,
    cardPoints: sumCardPoints(opponentCards),
    pistiCount: opponentPisti,
    doublePistiCount: opponentDoublePisti,
    pistiPoints: opponentPisti * PISTI_BONUS + opponentDoublePisti * DOUBLE_PISTI_BONUS,
    majorityBonus: opponentMajority,
    total: 0,
  }
  opponent.total = opponent.cardPoints + opponent.pistiPoints + opponent.majorityBonus

  let winner: Scoreboard['winner'] = 'tie'
  if (player.total > opponent.total) winner = 'player'
  else if (opponent.total > player.total) winner = 'opponent'

  return { player, opponent, winner }
}
