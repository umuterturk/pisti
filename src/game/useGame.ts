import { useCallback, useMemo, useRef, useState } from 'react'
import { chooseOpponentCard } from './ai'
import { dealNewGame, type Card } from './cards'
import {
  checkCapture,
  computeScoreboard,
  type Scoreboard,
} from './rules'

export type Turn = 'player' | 'opponent'
export type GamePhase = 'idle' | 'animating'

export interface PlayResult {
  who: Turn
  playedCard: Card
  captured: boolean
  pisti: boolean
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
}

const HAND_SIZE = 4

// Monotonic counter so every fresh deal produces a unique serial, even if two
// deals happen within the same millisecond.
let dealCounter = 0
function nextDealSerial(): number {
  dealCounter += 1
  return dealCounter
}

function freshState(games: MatchScore = { player: 0, opponent: 0 }, gameNumber = 1): GameState {
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
    lastCapturer: null,
    turn: 'player',
    phase: 'idle',
    gameOver: false,
    scoreboard: null,
    games,
    gameNumber,
    dealSerial: nextDealSerial(),
  }
}

function other(turn: Turn): Turn {
  return turn === 'player' ? 'opponent' : 'player'
}

/** Applies the outcome of a play after its landing animation has finished. */
function commit(prev: GameState, result: PlayResult): GameState {
  const { who, playedCard, captured, pisti } = result

  let pile = prev.pile
  let playerCollected = prev.playerCollected
  let opponentCollected = prev.opponentCollected
  let playerPisti = prev.playerPisti
  let opponentPisti = prev.opponentPisti
  let lastCapturer = prev.lastCapturer

  if (captured) {
    const haul = [...prev.pile, playedCard]
    if (who === 'player') {
      playerCollected = [...playerCollected, ...haul]
      if (pisti) playerPisti += 1
    } else {
      opponentCollected = [...opponentCollected, ...haul]
      if (pisti) opponentPisti += 1
    }
    pile = []
    lastCapturer = who
  } else {
    pile = [...prev.pile, playedCard]
  }

  let deck = prev.deck
  let playerHand = prev.playerHand
  let opponentHand = prev.opponentHand
  let dealSerial = prev.dealSerial

  // Refill both hands once they are empty and the draw pile still has cards.
  if (playerHand.length === 0 && opponentHand.length === 0 && deck.length > 0) {
    playerHand = deck.slice(0, HAND_SIZE)
    opponentHand = deck.slice(HAND_SIZE, HAND_SIZE * 2)
    deck = deck.slice(HAND_SIZE * 2)
    dealSerial = nextDealSerial()
  }

  const handsEmpty = playerHand.length === 0 && opponentHand.length === 0
  const gameOver = handsEmpty && deck.length === 0

  if (gameOver) {
    // The last player to capture sweeps whatever remains on the table.
    if (pile.length > 0 && lastCapturer) {
      if (lastCapturer === 'player') playerCollected = [...playerCollected, ...pile]
      else opponentCollected = [...opponentCollected, ...pile]
      pile = []
    }

    const scoreboard = computeScoreboard(
      playerCollected,
      opponentCollected,
      playerPisti,
      opponentPisti,
    )

    const games: MatchScore = {
      player: prev.games.player + (scoreboard.winner === 'player' ? 1 : 0),
      opponent: prev.games.opponent + (scoreboard.winner === 'opponent' ? 1 : 0),
    }

    return {
      ...prev,
      deck,
      playerHand,
      opponentHand,
      pile,
      playerCollected,
      opponentCollected,
      playerPisti,
      opponentPisti,
      lastCapturer,
      turn: prev.turn,
      phase: 'idle',
      gameOver: true,
      scoreboard,
      games,
      dealSerial,
    }
  }

  return {
    ...prev,
    deck,
    playerHand,
    opponentHand,
    pile,
    playerCollected,
    opponentCollected,
    playerPisti,
    opponentPisti,
    lastCapturer,
    turn: other(who),
    phase: 'idle',
    gameOver: false,
    scoreboard: null,
    dealSerial,
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

  // Full match reset (scores back to 0-0).
  const newGame = useCallback(() => {
    apply(freshState())
  }, [apply])

  // Deal the next game while keeping the running match score.
  const nextGame = useCallback(() => {
    const prev = stateRef.current
    apply(freshState(prev.games, prev.gameNumber + 1))
  }, [apply])

  // Concede the current game: opponent takes the game, then deal the next one.
  const resign = useCallback(() => {
    const prev = stateRef.current
    const games: MatchScore = {
      player: prev.games.player,
      opponent: prev.games.opponent + 1,
    }
    apply(freshState(games, prev.gameNumber + 1))
  }, [apply])

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

      const { captured, pisti } = checkCapture(card, prev.pile)
      const result: PlayResult = {
        who: 'player',
        playedCard: card,
        captured,
        pisti,
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
    const cardId = chooseOpponentCard(prev.opponentHand, prev.pile)
    const card = prev.opponentHand.find((c) => c.id === cardId)
    if (!card) return null

    const { captured, pisti } = checkCapture(card, prev.pile)
    const result: PlayResult = {
      who: 'opponent',
      playedCard: card,
      captured,
      pisti,
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
    reorderPlayerHand,
    playPlayerCard,
    playOpponentCard,
    resolvePlay,
  }
}
