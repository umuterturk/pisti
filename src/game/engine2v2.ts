import type { Card } from './cards'
import { checkCapture, computeTeamScoreboard, type TeamId, type TeamScoreboard } from './rules'

export type Seat = 0 | 1 | 2 | 3

export const HAND_SIZE_2V2 = 4
export const SEAT_COUNT = 4

/** Biz = local + partner (across); Onlar = left + right. */
export function teamOf(seat: Seat): TeamId {
  return seat % 2 === 0 ? 'biz' : 'onlar'
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % SEAT_COUNT) as Seat
}

/**
 * Display badge 1–4 for a physical seat this hand.
 * Seat `firstSeat` (who leads) is always 1; then clockwise 2, 3, 4.
 */
export function seatNumberOf(seat: Seat, firstSeat: Seat): 1 | 2 | 3 | 4 {
  return ((((seat - firstSeat + SEAT_COUNT) % SEAT_COUNT) + 1) as 1 | 2 | 3 | 4)
}

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % SEAT_COUNT) as Seat
}

export function seatsOfTeam(team: TeamId): [Seat, Seat] {
  return team === 'biz' ? [0, 2] : [1, 3]
}

/**
 * Pure 2v2 rule state. Seats are absolute around the table:
 * 0 = local (bottom), 1 = right, 2 = partner (top), 3 = left.
 */
export interface SimState2v2 {
  deck: Card[]
  hands: [Card[], Card[], Card[], Card[]]
  pile: Card[]
  collected: [Card[], Card[], Card[], Card[]]
  pisti: [number, number, number, number]
  doublePisti: [number, number, number, number]
  lastCapturer: Seat | null
  turn: Seat
  localSeat: Seat
}

function cloneHands(hands: SimState2v2['hands']): SimState2v2['hands'] {
  return [hands[0].slice(), hands[1].slice(), hands[2].slice(), hands[3].slice()]
}

function cloneCollected(collected: SimState2v2['collected']): SimState2v2['collected'] {
  return [collected[0].slice(), collected[1].slice(), collected[2].slice(), collected[3].slice()]
}

export function legalMoves2v2(s: SimState2v2): Card[] {
  return s.hands[s.turn]
}

export function isTerminal2v2(s: SimState2v2): boolean {
  return s.hands.every((h) => h.length === 0) && s.deck.length === 0
}

function allHandsEmpty(hands: SimState2v2['hands']): boolean {
  return hands.every((h) => h.length === 0)
}

function poolTeam(
  collected: SimState2v2['collected'],
  pisti: SimState2v2['pisti'],
  doublePisti: SimState2v2['doublePisti'],
  team: TeamId,
): { cards: Card[]; pisti: number; doublePisti: number } {
  const [a, b] = seatsOfTeam(team)
  return {
    cards: [...collected[a], ...collected[b]],
    pisti: pisti[a] + pisti[b],
    doublePisti: doublePisti[a] + doublePisti[b],
  }
}

export function applyMove2v2(
  s: SimState2v2,
  cardId: string,
): { next: SimState2v2; refilled: boolean } {
  const who = s.turn
  const hand = s.hands[who]
  const card = hand.find((c) => c.id === cardId)
  if (!card) throw new Error(`applyMove2v2: card ${cardId} not in seat ${who} hand`)

  const { captured, pisti, doublePisti } = checkCapture(card, s.pile)

  let pile = s.pile
  const collected = cloneCollected(s.collected)
  const pistiCounts: SimState2v2['pisti'] = [...s.pisti]
  const doublePistiCounts: SimState2v2['doublePisti'] = [...s.doublePisti]
  let lastCapturer = s.lastCapturer

  if (captured) {
    const haul = [...s.pile, card]
    collected[who] = [...collected[who], ...haul]
    if (doublePisti) doublePistiCounts[who] += 1
    else if (pisti) pistiCounts[who] += 1
    pile = []
    lastCapturer = who
  } else {
    pile = [...s.pile, card]
  }

  const hands = cloneHands(s.hands)
  hands[who] = hand.filter((c) => c.id !== cardId)

  let deck = s.deck
  let refilled = false

  if (allHandsEmpty(hands) && deck.length > 0) {
    const take = HAND_SIZE_2V2 * SEAT_COUNT
    const chunk = deck.slice(0, take)
    deck = deck.slice(take)
    for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
      const start = seat * HAND_SIZE_2V2
      hands[seat as Seat] = chunk.slice(start, start + HAND_SIZE_2V2)
    }
    refilled = true
  }

  return {
    refilled,
    next: {
      deck,
      hands,
      pile,
      collected,
      pisti: pistiCounts,
      doublePisti: doublePistiCounts,
      lastCapturer,
      turn: nextSeat(who),
      localSeat: s.localSeat,
    },
  }
}

/** Sweep remaining pile to last capturer, then compute team scoreboard. */
export function finalTeamScore(s: SimState2v2): TeamScoreboard {
  const collected = cloneCollected(s.collected)
  if (s.pile.length > 0 && s.lastCapturer !== null) {
    collected[s.lastCapturer] = [...collected[s.lastCapturer], ...s.pile]
  }
  const biz = poolTeam(collected, s.pisti, s.doublePisti, 'biz')
  const onlar = poolTeam(collected, s.pisti, s.doublePisti, 'onlar')
  return computeTeamScoreboard(
    biz.cards,
    onlar.cards,
    biz.pisti,
    onlar.pisti,
    biz.doublePisti,
    onlar.doublePisti,
  )
}

/** Live (in-progress) team totals without majority bonus. */
export function liveTeamScore(s: SimState2v2): TeamScoreboard {
  const biz = poolTeam(s.collected, s.pisti, s.doublePisti, 'biz')
  const onlar = poolTeam(s.collected, s.pisti, s.doublePisti, 'onlar')
  return computeTeamScoreboard(
    biz.cards,
    onlar.cards,
    biz.pisti,
    onlar.pisti,
    biz.doublePisti,
    onlar.doublePisti,
    false,
  )
}

export function teamCollectedCount(s: SimState2v2, team: TeamId): number {
  const [a, b] = seatsOfTeam(team)
  return s.collected[a].length + s.collected[b].length
}
