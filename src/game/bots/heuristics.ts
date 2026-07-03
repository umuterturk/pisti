import type { Card } from '../cards'
import { cardPoints, checkCapture, DOUBLE_PISTI_BONUS, PISTI_BONUS } from '../rules'
import { pick, type Rng } from '../rng'
import type { BotStrategy } from './types'

const RANK_ORDER: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8,
  '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
}

function rankValue(card: Card): number {
  return RANK_ORDER[card.rank] ?? 0
}

function pileValue(pile: Card[]): number {
  return pile.reduce((total, card) => total + cardPoints(card), 0)
}

export function canCapture(card: Card, pile: Card[]): boolean {
  if (pile.length === 0) return false
  return card.rank === 'J' || card.rank === pile[pile.length - 1].rank
}

// Total points a capture nets: the pile's point cards + this card's own points
// (it joins your collected stack) + any pişti bonus.
function captureGain(card: Card, pile: Card[]): number {
  const { pisti, doublePisti } = checkCapture(card, pile)
  const bonus = doublePisti ? DOUBLE_PISTI_BONUS : pisti ? PISTI_BONUS : 0
  return pileValue(pile) + cardPoints(card) + bonus
}

// Playing a non-capturing card onto an empty pile leaves a lone card the
// opponent can pişti next turn.
function leavesPistiGift(card: Card, pile: Card[]): boolean {
  return pile.length === 0 && !canCapture(card, pile)
}

function hasPairInHand(card: Card, hand: Card[]): boolean {
  return hand.filter((c) => c.rank === card.rank).length >= 2
}

function compareTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

// Pick the item with the lexicographically smallest key tuple; random tiebreak.
function selectMin<T>(items: T[], keyFn: (item: T) => number[], rng: Rng): T {
  let best: T[] = []
  let bestKey: number[] | null = null
  for (const item of items) {
    const key = keyFn(item)
    if (bestKey === null) {
      bestKey = key
      best = [item]
    } else {
      const cmp = compareTuple(key, bestKey)
      if (cmp < 0) {
        bestKey = key
        best = [item]
      } else if (cmp === 0) {
        best.push(item)
      }
    }
  }
  return pick(rng, best)
}

const bit = (b: boolean): number => (b ? 1 : 0)

// Choose the capture that nets the most points. `jackPenalty` discourages
// spending a Jack on a capture unless the top card is itself a Jack.
function bestCapture(captures: Card[], pile: Card[], rng: Rng, jackPenalty = 0): Card {
  const top = pile.length > 0 ? pile[pile.length - 1] : null
  return selectMin(
    captures,
    (c) => {
      let gain = captureGain(c, pile)
      if (jackPenalty > 0 && c.rank === 'J' && top && top.rank !== 'J') gain -= jackPenalty
      return [-gain]
    },
    rng,
  )
}

// ── Core move functions: (hand, pile, rng) → card id ──────────────────────────
// These are reused both as opponent strategies and as Monte-Carlo rollout
// policies (where they drive both sides of a simulated game).

export function randomMove(hand: Card[], _pile: Card[], rng: Rng): string {
  return pick(rng, hand).id
}

export function greedyMove(hand: Card[], pile: Card[], rng: Rng): string {
  const captures = hand.filter((c) => canCapture(c, pile))
  if (captures.length > 0) return bestCapture(captures, pile, rng, 2).id
  return selectMin(hand, (c) => [cardPoints(c), bit(c.rank === 'J'), rankValue(c)], rng).id
}

export function safeMove(hand: Card[], pile: Card[], rng: Rng): string {
  const captures = hand.filter((c) => canCapture(c, pile))
  if (captures.length > 0) return bestCapture(captures, pile, rng).id
  return selectMin(
    hand,
    (c) => [bit(leavesPistiGift(c, pile)), cardPoints(c), bit(c.rank === 'J'), rankValue(c)],
    rng,
  ).id
}

export function pointHunterMove(hand: Card[], pile: Card[], rng: Rng): string {
  const captures = hand.filter((c) => canCapture(c, pile))
  if (captures.length > 0) return bestCapture(captures, pile, rng).id
  return selectMin(hand, (c) => [cardPoints(c), bit(c.rank === 'J'), rankValue(c)], rng).id
}

export function jackSaverMove(hand: Card[], pile: Card[], rng: Rng): string {
  const rankCaps = hand.filter((c) => c.rank !== 'J' && canCapture(c, pile))
  if (rankCaps.length > 0) return bestCapture(rankCaps, pile, rng).id

  const jackCaps = hand.filter((c) => c.rank === 'J' && canCapture(c, pile))
  const jackPistiAvailable = pile.length === 1 && pile[0].rank === 'J'
  if (jackCaps.length > 0 && (pileValue(pile) >= 2 || jackPistiAvailable)) {
    return jackCaps[0].id
  }

  const nonJacks = hand.filter((c) => c.rank !== 'J')
  const pool = nonJacks.length > 0 ? nonJacks : hand
  return selectMin(pool, (c) => [cardPoints(c), rankValue(c)], rng).id
}

export function aggressiveMove(hand: Card[], pile: Card[], rng: Rng): string {
  const captures = hand.filter((c) => canCapture(c, pile))
  if (captures.length > 0) return bestCapture(captures, pile, rng).id
  // Prefer discarding singletons (no duplicate in hand) to keep pairs intact.
  return selectMin(
    hand,
    (c) => [bit(hasPairInHand(c, hand)), cardPoints(c), bit(c.rank === 'J'), rankValue(c)],
    rng,
  ).id
}

export function defensiveMove(hand: Card[], pile: Card[], rng: Rng): string {
  const captures = hand.filter((c) => canCapture(c, pile))
  if (captures.length > 0) return bestCapture(captures, pile, rng).id
  return selectMin(
    hand,
    (c) => [bit(leavesPistiGift(c, pile)), cardPoints(c), bit(c.rank === 'J'), rankValue(c)],
    rng,
  ).id
}

// ── BotStrategy wrappers (BotContext → card id) ───────────────────────────────
const wrap =
  (move: (hand: Card[], pile: Card[], rng: Rng) => string): BotStrategy =>
  (ctx) =>
    move(ctx.hand, ctx.pile, ctx.rng)

export const randomStrategy = wrap(randomMove)
export const greedyStrategy = wrap(greedyMove)
export const safeStrategy = wrap(safeMove)
export const pointHunterStrategy = wrap(pointHunterMove)
export const jackSaverStrategy = wrap(jackSaverMove)
export const aggressiveStrategy = wrap(aggressiveMove)
export const defensiveStrategy = wrap(defensiveMove)
