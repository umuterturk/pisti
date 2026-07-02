import type { Card } from './cards'
import { cardPoints } from './rules'

const RANK_ORDER: Record<string, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
}

// Cards worth keeping (they score points), so avoid discarding them.
function keepValue(card: Card): number {
  const points = cardPoints(card)
  if (card.rank === 'J') return 100
  if (points > 0) return 40 + points
  return RANK_ORDER[card.rank] ?? 0
}

function pileValue(pile: Card[]): number {
  return pile.reduce((total, card) => total + cardPoints(card), 0)
}

export function chooseOpponentCard(hand: Card[], pile: Card[]): string | null {
  if (hand.length === 0) return null

  const top = pile.length > 0 ? pile[pile.length - 1] : null

  // 1. Rank match captures the pile (and is a Pişti when the pile is a single card).
  if (top) {
    const matches = hand.filter((c) => c.rank === top.rank && c.rank !== 'J')
    if (matches.length > 0) {
      // Prefer the least valuable matching card to preserve stronger cards.
      matches.sort((a, b) => keepValue(a) - keepValue(b))
      return matches[0].id
    }
  }

  // 2. Use a Jack to sweep the pile when it is worth taking.
  const jacks = hand.filter((c) => c.rank === 'J')
  if (jacks.length > 0 && pile.length > 0 && (pile.length >= 2 || pileValue(pile) > 0)) {
    return jacks[0].id
  }

  // 3. Otherwise discard the least valuable card, avoiding point cards and Jacks.
  const discardable = hand.filter((c) => c.rank !== 'J')
  const pool = discardable.length > 0 ? discardable : hand
  const sorted = [...pool].sort((a, b) => keepValue(a) - keepValue(b))
  return sorted[0].id
}
