import { dealNewGame } from '../cards'
import { applyMove, finalScore, isTerminal, type SimState, type Turn } from '../engine'
import { mulberry32, type Rng } from '../rng'
import { getBot } from './registry'
import type { BotContext, BotProfile } from './types'

// Build a bot's-eye context for whichever side is to move.
function contextFor(s: SimState, who: Turn, rng: Rng): BotContext {
  const mine = who === 'player'
  return {
    hand: mine ? s.playerHand : s.opponentHand,
    pile: s.pile,
    myCollected: mine ? s.playerCollected : s.opponentCollected,
    oppCollected: mine ? s.opponentCollected : s.playerCollected,
    deckCount: s.deck.length,
    oppHandCount: mine ? s.opponentHand.length : s.playerHand.length,
    rng,
  }
}

function freshSim(startingTurn: Turn): SimState {
  const { playerHand, opponentHand, table, deck } = dealNewGame()
  return {
    deck,
    playerHand,
    opponentHand,
    pile: table,
    playerCollected: [],
    opponentCollected: [],
    playerPisti: 0,
    opponentPisti: 0,
    playerDoublePisti: 0,
    opponentDoublePisti: 0,
    lastCapturer: null,
    turn: startingTurn,
    localSeat: 0,
  }
}

/** Play one full game: botA in the player seat, botB in the opponent seat. */
function playGame(botA: BotProfile, botB: BotProfile, rng: Rng, startingTurn: Turn): Turn | 'tie' {
  let s = freshSim(startingTurn)
  let guard = 0
  while (!isTerminal(s) && guard < 400) {
    guard += 1
    const bot = s.turn === 'player' ? botA : botB
    const id = bot.strategy(contextFor(s, s.turn, rng))
    s = applyMove(s, id).next
  }
  return finalScore(s).winner
}

export interface MatchResult {
  aWins: number
  bWins: number
  ties: number
  games: number
}

/** Run `games` head-to-head games, alternating who leads for fairness. */
export function runMatch(botA: BotProfile, botB: BotProfile, games = 200, seed = 1): MatchResult {
  const rng = mulberry32(seed)
  const result: MatchResult = { aWins: 0, bWins: 0, ties: 0, games }
  for (let g = 0; g < games; g += 1) {
    const winner = playGame(botA, botB, rng, g % 2 === 0 ? 'player' : 'opponent')
    if (winner === 'player') result.aWins += 1
    else if (winner === 'opponent') result.bWins += 1
    else result.ties += 1
  }
  return result
}

/**
 * Dev-only: round-robin a set of bots and print a win-rate matrix. Validates the
 * expected strength gradient (Random weakest, Monte-Carlo tiers strongest).
 */
export function runTournament(botIds: string[], gamesPer = 200, seed = 1): void {
  const bots = botIds.map(getBot)
  const table: Record<string, Record<string, string>> = {}
  const overall: Record<string, { w: number; total: number }> = {}

  for (const b of bots) overall[b.name] = { w: 0, total: 0 }

  for (const a of bots) {
    table[a.name] = {}
    for (const b of bots) {
      if (a.id === b.id) {
        table[a.name][b.name] = '—'
        continue
      }
      const r = runMatch(a, b, gamesPer, seed)
      const winRate = (r.aWins + r.ties * 0.5) / r.games
      table[a.name][b.name] = `${Math.round(winRate * 100)}%`
      overall[a.name].w += r.aWins + r.ties * 0.5
      overall[a.name].total += r.games
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[selfplay] win-rate (row vs column), ${gamesPer} games each:`)
  // eslint-disable-next-line no-console
  console.table(table)
  const ranking = Object.entries(overall)
    .map(([name, s]) => ({ name, winRate: `${Math.round((s.w / s.total) * 100)}%` }))
    .sort((x, y) => parseFloat(y.winRate) - parseFloat(x.winRate))
  // eslint-disable-next-line no-console
  console.log('[selfplay] overall ranking:')
  // eslint-disable-next-line no-console
  console.table(ranking)
}
