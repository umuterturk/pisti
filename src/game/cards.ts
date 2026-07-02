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
