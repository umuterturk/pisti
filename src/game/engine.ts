import type { Card } from './cards'
import { checkCapture, computeScoreboard, type Scoreboard } from './rules'

export type Turn = 'player' | 'opponent'

export const HAND_SIZE = 4

/**
 * The pure, headless rule state of a Pişti game — everything needed to advance
 * play and score it, with none of the React/animation bookkeeping that lives in
 * `useGame`. This is the single source of rule truth: both the real game
 * (`commit` delegates here) and the Monte-Carlo bots simulate through it.
 */
export interface SimState {
  deck: Card[]
  playerHand: Card[]
  opponentHand: Card[]
  pile: Card[]
  playerCollected: Card[]
  opponentCollected: Card[]
  playerPisti: number
  opponentPisti: number
  playerDoublePisti: number
  opponentDoublePisti: number
  lastCapturer: Turn | null
  turn: Turn
}

function other(turn: Turn): Turn {
  return turn === 'player' ? 'opponent' : 'player'
}

/** Legal moves for the side to act. In Pişti any held card may be played. */
export function legalMoves(s: SimState): Card[] {
  return s.turn === 'player' ? s.playerHand : s.opponentHand
}

/** Both hands empty and the draw pile exhausted — the hand is over. */
export function isTerminal(s: SimState): boolean {
  return s.playerHand.length === 0 && s.opponentHand.length === 0 && s.deck.length === 0
}

/**
 * Apply a single card play by `s.turn`. Mirrors the rule math in
 * `useGame.commit`: capture (with pişti / double-pişti counting), otherwise
 * stack onto the pile; refill both hands from the deck once they are empty; flip
 * the turn. Returns whether a refill happened so the UI layer can bump its deal
 * animation serial.
 */
export function applyMove(s: SimState, cardId: string): { next: SimState; refilled: boolean } {
  const who = s.turn
  const hand = who === 'player' ? s.playerHand : s.opponentHand
  const card = hand.find((c) => c.id === cardId)
  if (!card) throw new Error(`applyMove: card ${cardId} not in ${who} hand`)

  const { captured, pisti, doublePisti } = checkCapture(card, s.pile)

  let pile = s.pile
  let playerCollected = s.playerCollected
  let opponentCollected = s.opponentCollected
  let playerPisti = s.playerPisti
  let opponentPisti = s.opponentPisti
  let playerDoublePisti = s.playerDoublePisti
  let opponentDoublePisti = s.opponentDoublePisti
  let lastCapturer = s.lastCapturer

  if (captured) {
    const haul = [...s.pile, card]
    if (who === 'player') {
      playerCollected = [...playerCollected, ...haul]
      if (doublePisti) playerDoublePisti += 1
      else if (pisti) playerPisti += 1
    } else {
      opponentCollected = [...opponentCollected, ...haul]
      if (doublePisti) opponentDoublePisti += 1
      else if (pisti) opponentPisti += 1
    }
    pile = []
    lastCapturer = who
  } else {
    pile = [...s.pile, card]
  }

  let deck = s.deck
  let playerHand = who === 'player' ? hand.filter((c) => c.id !== cardId) : s.playerHand
  let opponentHand = who === 'opponent' ? hand.filter((c) => c.id !== cardId) : s.opponentHand

  let refilled = false
  if (playerHand.length === 0 && opponentHand.length === 0 && deck.length > 0) {
    playerHand = deck.slice(0, HAND_SIZE)
    opponentHand = deck.slice(HAND_SIZE, HAND_SIZE * 2)
    deck = deck.slice(HAND_SIZE * 2)
    refilled = true
  }

  return {
    refilled,
    next: {
      deck,
      playerHand,
      opponentHand,
      pile,
      playerCollected,
      opponentCollected,
      playerPisti,
      opponentPisti,
      playerDoublePisti,
      opponentDoublePisti,
      lastCapturer,
      turn: other(who),
    },
  }
}

/**
 * Score a terminal (or to-be-terminal) state: the last capturer sweeps whatever
 * remains on the table, then the standard scoreboard is computed.
 */
export function finalScore(s: SimState): Scoreboard {
  let playerCollected = s.playerCollected
  let opponentCollected = s.opponentCollected

  if (s.pile.length > 0 && s.lastCapturer) {
    if (s.lastCapturer === 'player') playerCollected = [...playerCollected, ...s.pile]
    else opponentCollected = [...opponentCollected, ...s.pile]
  }

  return computeScoreboard(
    playerCollected,
    opponentCollected,
    s.playerPisti,
    s.opponentPisti,
    s.playerDoublePisti,
    s.opponentDoublePisti,
  )
}

/** Play a full game to terminal, choosing each move with the given policies. */
export function playout(
  start: SimState,
  policyFor: (turn: Turn) => (s: SimState) => string,
): Scoreboard {
  let s = start
  // Guard against pathological loops; a full hand is at most 52 plies.
  let guard = 0
  while (!isTerminal(s) && guard < 200) {
    guard += 1
    const moves = legalMoves(s)
    if (moves.length === 0) break
    const cardId = policyFor(s.turn)(s)
    s = applyMove(s, cardId).next
  }
  return finalScore(s)
}
