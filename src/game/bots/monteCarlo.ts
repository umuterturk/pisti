import { createDeck, type Card } from '../cards'
import { applyMove, legalMoves, playout, type SimState } from '../engine'
import { shuffleWith, type Rng } from '../rng'
import { greedyMove } from './heuristics'
import type { BotContext, BotStrategy } from './types'

// Rollout policy used inside every simulated world: fast Greedy play for both
// sides. Cheap and decent — the point of MC is the sampling, not the rollout.
function greedyPolicy(rng: Rng) {
  return () => (s: SimState) => greedyMove(legalMoves(s), s.pile, rng)
}

/**
 * Determinization: figure out which cards are hidden, then deal one plausible
 * world. `unknown = 52 − (bot hand ∪ pile ∪ both collected piles)` is exactly
 * "the player's hand + the face-down deck"; we shuffle it and split by the known
 * player-hand size. The more cards accounted for, the tighter the guess.
 */
function sampleWorld(ctx: BotContext, rng: Rng): SimState {
  const known = new Set<string>()
  for (const c of ctx.hand) known.add(c.id)
  for (const c of ctx.pile) known.add(c.id)
  for (const c of ctx.myCollected) known.add(c.id)
  for (const c of ctx.oppCollected) known.add(c.id)

  const unknown = createDeck().filter((c) => !known.has(c.id))
  const shuffled = shuffleWith(rng, unknown)
  const handSize = Math.min(ctx.oppHandCount, shuffled.length)
  const playerHand: Card[] = shuffled.slice(0, handSize)
  const deck: Card[] = shuffled.slice(handSize)

  // Past pişti counts are sunk and identical across candidate moves, so they
  // cancel in the margin — start them at 0. The bot is the `opponent` seat.
  return {
    deck,
    playerHand,
    opponentHand: ctx.hand,
    pile: ctx.pile,
    playerCollected: ctx.oppCollected,
    opponentCollected: ctx.myCollected,
    playerPisti: 0,
    opponentPisti: 0,
    playerDoublePisti: 0,
    opponentDoublePisti: 0,
    lastCapturer: null,
    turn: 'opponent',
    localSeat: 0,
  }
}

/**
 * Build a Monte-Carlo strategy that samples `worlds` hidden layouts and, for
 * each candidate card, averages the end-of-game margin (bot − player) after a
 * Greedy rollout. Worlds are the outer loop so every candidate is judged against
 * the same sampled layouts (common random numbers → lower variance).
 */
export function makeMonteCarloBot(worlds: number): BotStrategy {
  return (ctx) => {
    const candidates = ctx.hand
    if (candidates.length <= 1) return candidates[0].id

    const totals = new Array(candidates.length).fill(0)
    const policy = greedyPolicy(ctx.rng)

    for (let w = 0; w < worlds; w += 1) {
      const world = sampleWorld(ctx, ctx.rng)
      for (let i = 0; i < candidates.length; i += 1) {
        const afterMove = applyMove(world, candidates[i].id).next
        const score = playout(afterMove, policy)
        totals[i] += score.opponent.total - score.player.total
      }
    }

    let bestIdx = 0
    for (let i = 1; i < candidates.length; i += 1) {
      if (totals[i] > totals[bestIdx]) bestIdx = i
    }
    return candidates[bestIdx].id
  }
}
