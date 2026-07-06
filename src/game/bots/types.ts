import type { Card } from '../cards'
import type { Rng } from '../rng'

/**
 * Everything the opponent bot can legitimately see when choosing a card. From
 * the bot's seat, `hand` is its own hand; the two collected piles plus the pile
 * are the "accounted" cards a card-counter would know, which the Monte-Carlo
 * bots subtract from the full deck to derive the hidden pool.
 */
export interface BotContext {
  hand: Card[]
  pile: Card[]
  myCollected: Card[]
  oppCollected: Card[]
  deckCount: number
  oppHandCount: number
  rng: Rng
}

/** A strategy picks a card from `ctx.hand` and returns its id. */
export type BotStrategy = (ctx: BotContext) => string

export interface BotProfile {
  id: string
  /** Display name shown to the human (persona flavor for aliases). */
  name: string
  difficulty: string
  /** A one-line, slightly tongue-in-cheek description of how this bot plays. */
  blurb: string
  strategy: BotStrategy
}
