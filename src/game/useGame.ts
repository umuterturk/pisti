import { useCallback, useMemo, useRef, useState } from 'react'
import { getBot, DEFAULT_BOT_ID } from './bots/registry'
import type { BotContext } from './bots/types'
import { dealNewGame, type Card } from './cards'
import { applyMove, finalScore, HAND_SIZE, isTerminal, type SimState } from './engine'
import { checkCapture, type Scoreboard } from './rules'
import { randomRng } from './rng'

export type Turn = 'player' | 'opponent'
export type GamePhase = 'idle' | 'animating'

export interface PlayResult {
  who: Turn
  playedCard: Card
  captured: boolean
  pisti: boolean
  doublePisti: boolean
  /** How many piştis have now landed back-to-back (only meaningful when pisti). */
  pistiStreak: number
  /** Snapshot of the pile plus the played card, used for the collect animation. */
  capturedCards: Card[]
}

export interface MatchScore {
  player: number
  opponent: number
}

export interface GameState {
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
  /** Consecutive piştis landed back-to-back by either side (combo counter). */
  pistiStreak: number
  lastCapturer: Turn | null
  turn: Turn
  phase: GamePhase
  gameOver: boolean
  scoreboard: Scoreboard | null
  /** Games won across the whole match (persists between hands). */
  games: MatchScore
  gameNumber: number
  /** Bumped whenever cards are freshly dealt into hands (initial + refills), so
   *  the UI can play the deal-in animation and pause turns until it finishes. */
  dealSerial: number
  /** Id of the opponent bot profile for this match (persists between hands). */
  activeBotId: string
}

// Monotonic counter so every fresh deal produces a unique serial, even if two
// deals happen within the same millisecond.
let dealCounter = 0
function nextDealSerial(): number {
  dealCounter += 1
  return dealCounter
}

function freshState(
  games: MatchScore = { player: 0, opponent: 0 },
  gameNumber = 1,
  // The winner of the previous game leads the next one (game rule). Defaults to
  // the player for the very first game of a match.
  startingTurn: Turn = 'player',
  activeBotId: string = DEFAULT_BOT_ID,
): GameState {
  const { playerHand, opponentHand, table, deck } = dealNewGame(HAND_SIZE)
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
    pistiStreak: 0,
    lastCapturer: null,
    turn: startingTurn,
    phase: 'idle',
    gameOver: false,
    scoreboard: null,
    games,
    gameNumber,
    dealSerial: nextDealSerial(),
    activeBotId,
  }
}

// Project the rule-relevant slice of the React game state into the pure engine's
// SimState, so `commit` can advance play through the same code the bots simulate.
function toSimState(g: GameState): SimState {
  return {
    deck: g.deck,
    playerHand: g.playerHand,
    opponentHand: g.opponentHand,
    pile: g.pile,
    playerCollected: g.playerCollected,
    opponentCollected: g.opponentCollected,
    playerPisti: g.playerPisti,
    opponentPisti: g.opponentPisti,
    playerDoublePisti: g.playerDoublePisti,
    opponentDoublePisti: g.opponentDoublePisti,
    lastCapturer: g.lastCapturer,
    turn: g.turn,
  }
}

/** Applies the outcome of a play after its landing animation has finished. */
function commit(prev: GameState, result: PlayResult): GameState {
  const who = result.who

  // The played card was pulled from hand at throw time (so it flies away
  // visually); put it back so the engine can resolve the move canonically —
  // this keeps the human's game running on the exact rules the bots simulate.
  const base = toSimState(prev)
  const restored: SimState = {
    ...base,
    turn: who,
    playerHand:
      who === 'player' ? [...base.playerHand, result.playedCard] : base.playerHand,
    opponentHand:
      who === 'opponent' ? [...base.opponentHand, result.playedCard] : base.opponentHand,
  }
  const { next, refilled } = applyMove(restored, result.playedCard.id)

  // A pişti extends the combo; any other capture snaps it; a non-capture leaves
  // it. (Purely cosmetic — the engine doesn't track it.)
  const pistiStreak = result.captured
    ? result.pisti
      ? prev.pistiStreak + 1
      : 0
    : prev.pistiStreak
  const dealSerial = refilled ? nextDealSerial() : prev.dealSerial

  const shared = {
    ...prev,
    deck: next.deck,
    playerHand: next.playerHand,
    opponentHand: next.opponentHand,
    playerPisti: next.playerPisti,
    opponentPisti: next.opponentPisti,
    playerDoublePisti: next.playerDoublePisti,
    opponentDoublePisti: next.opponentDoublePisti,
    pistiStreak,
    lastCapturer: next.lastCapturer,
    phase: 'idle' as const,
    dealSerial,
  }

  if (isTerminal(next)) {
    const scoreboard = finalScore(next)
    // finalScore sweeps the table to the last capturer; mirror that in the piles
    // we surface so the UI shows the final counts.
    let playerCollected = next.playerCollected
    let opponentCollected = next.opponentCollected
    if (next.pile.length > 0 && next.lastCapturer) {
      if (next.lastCapturer === 'player')
        playerCollected = [...playerCollected, ...next.pile]
      else opponentCollected = [...opponentCollected, ...next.pile]
    }

    const games: MatchScore = {
      player: prev.games.player + (scoreboard.winner === 'player' ? 1 : 0),
      opponent: prev.games.opponent + (scoreboard.winner === 'opponent' ? 1 : 0),
    }

    return {
      ...shared,
      pile: [],
      playerCollected,
      opponentCollected,
      turn: prev.turn,
      gameOver: true,
      scoreboard,
      games,
    }
  }

  return {
    ...shared,
    pile: next.pile,
    playerCollected: next.playerCollected,
    opponentCollected: next.opponentCollected,
    turn: next.turn,
    gameOver: false,
    scoreboard: null,
  }
}

export function useGame() {
  const [state, setState] = useState<GameState>(freshState)

  // Mirror of the latest state so play functions can compute their result
  // synchronously, independent of when React runs the setState updater.
  const stateRef = useRef(state)
  stateRef.current = state

  const apply = useCallback((next: GameState) => {
    stateRef.current = next
    setState(next)
  }, [])

  // Full match reset (scores back to 0-0), keeping the chosen opponent.
  const newGame = useCallback(() => {
    apply(freshState({ player: 0, opponent: 0 }, 1, 'player', stateRef.current.activeBotId))
  }, [apply])

  // Deal the next game while keeping the running match score. The winner of the
  // game just finished leads the next one; a tie keeps the previous leader.
  const nextGame = useCallback(() => {
    const prev = stateRef.current
    const winner = prev.scoreboard?.winner
    const startingTurn: Turn =
      winner === 'player' || winner === 'opponent' ? winner : prev.turn
    apply(freshState(prev.games, prev.gameNumber + 1, startingTurn, prev.activeBotId))
  }, [apply])

  // Concede the current game: opponent takes the game, so they lead the next one.
  const resign = useCallback(() => {
    const prev = stateRef.current
    const games: MatchScore = {
      player: prev.games.player,
      opponent: prev.games.opponent + 1,
    }
    apply(freshState(games, prev.gameNumber + 1, 'opponent', prev.activeBotId))
  }, [apply])

  // Switch opponents: starts a fresh match (0-0) against the chosen bot.
  const chooseBot = useCallback(
    (botId: string) => {
      apply(freshState({ player: 0, opponent: 0 }, 1, 'player', botId))
    },
    [apply],
  )

  const reorderPlayerHand = useCallback(
    (newOrder: string[]) => {
      const prev = stateRef.current
      const byId = new Map(prev.playerHand.map((card) => [card.id, card]))
      const reordered = newOrder
        .map((id) => byId.get(id))
        .filter((card): card is Card => card !== undefined)
      if (reordered.length !== prev.playerHand.length) return
      apply({ ...prev, playerHand: reordered })
    },
    [apply],
  )

  // Removes the card from hand and marks the game as animating. The pile is not
  // mutated yet: the flying card represents the played card until it lands, and
  // the outcome is applied later via resolvePlay.
  const playPlayerCard = useCallback(
    (cardId: string): PlayResult | null => {
      const prev = stateRef.current
      if (prev.turn !== 'player' || prev.phase !== 'idle' || prev.gameOver) {
        console.log('[pisti] playPlayerCard REJECTED', {
          turn: prev.turn,
          phase: prev.phase,
          gameOver: prev.gameOver,
        })
        return null
      }
      const card = prev.playerHand.find((c) => c.id === cardId)
      if (!card) return null

      const { captured, pisti, doublePisti } = checkCapture(card, prev.pile)
      const result: PlayResult = {
        who: 'player',
        playedCard: card,
        captured,
        pisti,
        doublePisti,
        pistiStreak: pisti ? prev.pistiStreak + 1 : 0,
        capturedCards: [...prev.pile, card],
      }

      apply({
        ...prev,
        playerHand: prev.playerHand.filter((c) => c.id !== cardId),
        phase: 'animating',
      })

      return result
    },
    [apply],
  )

  const playOpponentCard = useCallback((): PlayResult | null => {
    const prev = stateRef.current
    if (prev.turn !== 'opponent' || prev.phase !== 'idle' || prev.gameOver) {
      console.log('[pisti] playOpponentCard REJECTED', {
        turn: prev.turn,
        phase: prev.phase,
        gameOver: prev.gameOver,
      })
      return null
    }
    const bot = getBot(prev.activeBotId)
    const ctx: BotContext = {
      hand: prev.opponentHand,
      pile: prev.pile,
      myCollected: prev.opponentCollected,
      oppCollected: prev.playerCollected,
      deckCount: prev.deck.length,
      oppHandCount: prev.playerHand.length,
      rng: randomRng(),
    }
    const cardId = bot.strategy(ctx)
    const card = prev.opponentHand.find((c) => c.id === cardId)
    if (!card) return null

    const { captured, pisti, doublePisti } = checkCapture(card, prev.pile)
    const result: PlayResult = {
      who: 'opponent',
      playedCard: card,
      captured,
      pisti,
      doublePisti,
      pistiStreak: pisti ? prev.pistiStreak + 1 : 0,
      capturedCards: [...prev.pile, card],
    }

    apply({
      ...prev,
      opponentHand: prev.opponentHand.filter((c) => c.id !== card.id),
      phase: 'animating',
    })

    return result
  }, [apply])

  const resolvePlay = useCallback(
    (result: PlayResult) => {
      const prev = stateRef.current
      const next = commit(prev, result)
      console.log('[pisti] resolvePlay commit', {
        who: result.who,
        capturedResult: result.captured,
        turnBefore: prev.turn,
        turnAfter: next.turn,
        phaseAfter: next.phase,
        pileAfter: next.pile.length,
        playerHand: next.playerHand.length,
        oppHand: next.opponentHand.length,
        gameOver: next.gameOver,
      })
      apply(next)
    },
    [apply],
  )

  const canPlayerAct = useMemo(
    () =>
      state.turn === 'player' &&
      state.phase === 'idle' &&
      !state.gameOver &&
      state.playerHand.length > 0,
    [state.turn, state.phase, state.gameOver, state.playerHand.length],
  )

  return {
    state,
    canPlayerAct,
    newGame,
    nextGame,
    resign,
    chooseBot,
    reorderPlayerHand,
    playPlayerCard,
    playOpponentCard,
    resolvePlay,
  }
}
