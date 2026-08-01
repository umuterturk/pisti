import { describe, expect, it } from 'vitest'
import { createDeck, type Card } from './cards'
import {
  applyMove2v2,
  finalTeamScore,
  isTerminal2v2,
  liveTeamScore,
  nextSeat,
  seatNumberOf,
  teamOf,
  type Seat,
  type SimState2v2,
} from './engine2v2'
import { MAJORITY_BONUS } from './rules'

function card(id: string, rank: Card['rank'] = '7', suit: Card['suit'] = 'spades'): Card {
  return { id, rank, suit }
}

function emptyState(overrides: Partial<SimState2v2> = {}): SimState2v2 {
  return {
    deck: [],
    hands: [[], [], [], []],
    pile: [],
    collected: [[], [], [], []],
    pisti: [0, 0, 0, 0],
    doublePisti: [0, 0, 0, 0],
    lastCapturer: null,
    turn: 0,
    localSeat: 0,
    ...overrides,
  }
}

describe('engine2v2 seating helpers', () => {
  it('maps seats to Biz / Onlar', () => {
    expect(teamOf(0)).toBe('biz')
    expect(teamOf(2)).toBe('biz')
    expect(teamOf(1)).toBe('onlar')
    expect(teamOf(3)).toBe('onlar')
  })

  it('cycles turns 0→1→2→3→0', () => {
    expect(nextSeat(0)).toBe(1)
    expect(nextSeat(1)).toBe(2)
    expect(nextSeat(2)).toBe(3)
    expect(nextSeat(3)).toBe(0)
  })

  it('numbers seats from firstSeat clockwise (1–4)', () => {
    expect(seatNumberOf(0, 0)).toBe(1)
    expect(seatNumberOf(1, 0)).toBe(2)
    expect(seatNumberOf(2, 0)).toBe(3)
    expect(seatNumberOf(3, 0)).toBe(4)
    expect(seatNumberOf(1, 1)).toBe(1)
    expect(seatNumberOf(2, 1)).toBe(2)
    expect(seatNumberOf(3, 1)).toBe(3)
    expect(seatNumberOf(0, 1)).toBe(4)
  })
})

describe('applyMove2v2', () => {
  it('captures onto the capturer seat and advances turn', () => {
    const top = card('7-spades', '7', 'spades')
    const play = card('7-hearts', '7', 'hearts')
    const s = emptyState({
      hands: [[play], [], [], []],
      pile: [top],
      turn: 0,
    })
    const { next, refilled } = applyMove2v2(s, play.id)
    expect(refilled).toBe(false)
    expect(next.pile).toEqual([])
    expect(next.collected[0]).toEqual([top, play])
    expect(next.hands[0]).toEqual([])
    expect(next.turn).toBe(1)
    expect(next.lastCapturer).toBe(0)
  })

  it('awards pişti to the capturer seat', () => {
    const lone = card('5-clubs', '5', 'clubs')
    const match = card('5-hearts', '5', 'hearts')
    const s = emptyState({
      hands: [[], [match], [], []],
      pile: [lone],
      turn: 1,
    })
    const { next } = applyMove2v2(s, match.id)
    expect(next.pisti[1]).toBe(1)
    expect(next.collected[1]).toHaveLength(2)
  })

  it('refills all four hands when empty and deck remains', () => {
    const deck = createDeck().slice(0, 16)
    const s = emptyState({
      hands: [[card('x')], [], [], []],
      deck,
      turn: 0,
    })
    // Non-capturing play empties seat 0; other hands already empty → refill.
    const { next, refilled } = applyMove2v2(s, 'x')
    expect(refilled).toBe(true)
    expect(next.hands.every((h) => h.length === 4)).toBe(true)
    expect(next.deck).toHaveLength(0)
    expect(next.pile).toHaveLength(1)
  })

  it('is terminal when all hands and deck are empty', () => {
    const s = emptyState()
    expect(isTerminal2v2(s)).toBe(true)
  })
})

describe('team scoring', () => {
  it('pools partner piles for Biz vs Onlar', () => {
    const s = emptyState({
      collected: [
        [card('A-spades', 'A', 'spades')],
        [card('J-hearts', 'J', 'hearts')],
        [card('A-hearts', 'A', 'hearts')],
        [card('2-clubs', '2', 'clubs')],
      ],
      pisti: [1, 0, 0, 0],
      lastCapturer: 0,
    })
    const board = finalTeamScore(s)
    // Biz: 2 aces (2) + pişti (10) = 12; Onlar: J (1) + 2♣ (2) = 3
    expect(board.biz.cardPoints).toBe(2)
    expect(board.biz.pistiPoints).toBe(10)
    expect(board.onlar.cardPoints).toBe(3)
    expect(board.winner).toBe('biz')
  })

  it('sweeps remaining pile to last capturer before scoring', () => {
    const leftover = card('Q-spades', 'Q', 'spades')
    const s = emptyState({
      pile: [leftover],
      lastCapturer: 3,
      collected: [[], [], [], []],
    })
    const board = finalTeamScore(s)
    expect(board.onlar.cardCount).toBe(1)
    expect(board.biz.cardCount).toBe(0)
  })

  it('gives majority to the team with more cards', () => {
    const many: Card[] = Array.from({ length: 10 }, (_, i) =>
      card(`filler-${i}`, '3', 'spades'),
    )
    const few: Card[] = Array.from({ length: 3 }, (_, i) => card(`few-${i}`, '4', 'hearts'))
    const s = emptyState({
      collected: [many, few, [], []],
    })
    const board = finalTeamScore(s)
    expect(board.biz.majorityBonus).toBe(MAJORITY_BONUS)
    expect(board.onlar.majorityBonus).toBe(0)
  })

  it('live score omits majority', () => {
    const many: Card[] = Array.from({ length: 10 }, (_, i) =>
      card(`filler-${i}`, '3', 'spades'),
    )
    const s = emptyState({ collected: [many, [], [], []] })
    expect(liveTeamScore(s).biz.majorityBonus).toBe(0)
  })
})

describe('turn cycle playthrough', () => {
  it('rotates through all seats over four plays', () => {
    let s = emptyState({
      hands: [
        [card('a1', '3')],
        [card('b1', '4')],
        [card('c1', '5')],
        [card('d1', '6')],
      ],
      turn: 0 as Seat,
    })
    const order: Seat[] = []
    for (let i = 0; i < 4; i += 1) {
      order.push(s.turn)
      const id = s.hands[s.turn][0].id
      s = applyMove2v2(s, id).next
    }
    expect(order).toEqual([0, 1, 2, 3])
    expect(s.turn).toBe(0)
  })
})
