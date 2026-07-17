export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  id: string
  suit: Suit
  rank: Rank
}

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

export const SUIT_COLOR: Record<Suit, string> = {
  hearts: '#c0392b',
  diamonds: '#c0392b',
  clubs: '#1a1a2e',
  spades: '#1a1a2e',
}

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}-${suit}`, suit, rank })
    }
  }
  return deck
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Convert an arbitrary string seed into a 32-bit integer for mulberry32.
 * Simple djb2-style hash — deterministic across clients for the same string.
 */
function hashSeed(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * mulberry32 PRNG — same one used in rng.ts, copied here to avoid circular
 * imports between cards ↔ rng.
 */
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic Fisher-Yates shuffle seeded from a string.
 * Both clients calling this with the same seed string produce the same order.
 */
export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const rng = makeRng(hashSeed(seed))
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Seeded deal: same distribution as dealNewGame but deterministic.
 * `localSeat` determines which hand becomes `playerHand` from the local
 * player's perspective:
 *   seat 0 → first 4 cards dealt are the local player's hand
 *   seat 1 → second 4 cards dealt are the local player's hand
 */
export function dealNewGameSeeded(seed: string, localSeat: 0 | 1, handSize = 4, tableSize = 4): Deal {
  const shuffled = shuffleWithSeed(createDeck(), seed)
  let cursor = 0
  const take = (n: number) => shuffled.slice(cursor, (cursor += n))

  const hand0 = take(handSize)
  const hand1 = take(handSize)
  const table = take(tableSize)
  const deck = shuffled.slice(cursor)

  return {
    playerHand: localSeat === 0 ? hand0 : hand1,
    opponentHand: localSeat === 0 ? hand1 : hand0,
    table,
    deck,
  }
}

export interface Deal {
  playerHand: Card[]
  opponentHand: Card[]
  table: Card[]
  deck: Card[]
}

// Traditional Pişti opening deal: 4 cards to each player and 4 face-up on the
// table, with the rest forming the draw pile.
export function dealNewGame(handSize = 4, tableSize = 4): Deal {
  const shuffled = shuffle(createDeck())
  let cursor = 0
  const take = (n: number) => shuffled.slice(cursor, (cursor += n))

  const playerHand = take(handSize)
  const opponentHand = take(handSize)
  const table = take(tableSize)
  const deck = shuffled.slice(cursor)

  return { playerHand, opponentHand, table, deck }
}
