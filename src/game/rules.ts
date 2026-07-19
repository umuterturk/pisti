import type { Card } from './cards'

export const PISTI_BONUS = 10
export const DOUBLE_PISTI_BONUS = 20
export const MAJORITY_BONUS = 3

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

export type ScoreBreakdownKind = 'doublePisti' | 'pisti' | 'twoClubs' | 'tenDiamonds' | 'other'

export interface ScoreBreakdownItem {
  kind: ScoreBreakdownKind
  label: string
  points: number
}

/**
 * Splits a side's current total into the line items that make it up (the two
 * named point cards, everything else that scores, and any pişti bonuses) —
 * the same figures `computeScoreboard` sums, just itemized for display.
 */
export function scoreBreakdown(
  cards: Card[],
  pistiCount: number,
  doublePistiCount: number,
): { items: ScoreBreakdownItem[]; total: number } {
  const tenDiamonds = cards.find((c) => c.rank === '10' && c.suit === 'diamonds')
  const twoClubs = cards.find((c) => c.rank === '2' && c.suit === 'clubs')
  const otherPoints = cards.reduce((sum, card) => {
    if (card === tenDiamonds || card === twoClubs) return sum
    return sum + cardPoints(card)
  }, 0)

  const items: ScoreBreakdownItem[] = []
  if (doublePistiCount > 0) {
    items.push({
      kind: 'doublePisti',
      label: `Çift pişti ×${doublePistiCount}`,
      points: doublePistiCount * DOUBLE_PISTI_BONUS,
    })
  }
  if (pistiCount > 0) {
    items.push({
      kind: 'pisti',
      label: pistiCount === 1 ? 'Pişti' : `Pişti ×${pistiCount}`,
      points: pistiCount * PISTI_BONUS,
    })
  }
  if (twoClubs) items.push({ kind: 'twoClubs', label: '2 (Sinek)', points: cardPoints(twoClubs) })
  if (tenDiamonds) {
    items.push({ kind: 'tenDiamonds', label: '10 (Karo)', points: cardPoints(tenDiamonds) })
  }
  if (otherPoints > 0) items.push({ kind: 'other', label: 'Diğer toplananlar', points: otherPoints })

  return { items, total: items.reduce((sum, item) => sum + item.points, 0) }
}

export function computeScoreboard(
  playerCards: Card[],
  opponentCards: Card[],
  playerPisti: number,
  opponentPisti: number,
  playerDoublePisti = 0,
  opponentDoublePisti = 0,
  // The majority bonus (most cards collected) is only decided once the hand is
  // fully dealt out, so callers scoring a hand still in progress opt out of it.
  includeMajority = true,
): Scoreboard {
  const playerMajority =
    includeMajority && playerCards.length > opponentCards.length ? MAJORITY_BONUS : 0
  const opponentMajority =
    includeMajority && opponentCards.length > playerCards.length ? MAJORITY_BONUS : 0

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
