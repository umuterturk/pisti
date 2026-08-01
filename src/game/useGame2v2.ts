import { useCallback, useMemo, useRef, useState } from 'react'
import { getBot, BOTS, DEFAULT_BOT_ID } from './bots/registry'
import type { BotContext } from './bots/types'
import { dealNewGame2v2, type Card } from './cards'
import {
  applyMove2v2,
  finalTeamScore,
  HAND_SIZE_2V2,
  isTerminal2v2,
  liveTeamScore,
  nextSeat,
  seatsOfTeam,
  teamOf,
  type Seat,
  type SimState2v2,
} from './engine2v2'
import { checkCapture, type TeamId, type TeamScoreboard } from './rules'
import { randomRng } from './rng'

export type GamePhase2v2 = 'idle' | 'animating'

export interface PlayResult2v2 {
  who: Seat
  playedCard: Card
  captured: boolean
  pisti: boolean
  doublePisti: boolean
  pistiStreak: number
  capturedCards: Card[]
}

export interface TeamMatchScore {
  biz: number
  onlar: number
}

export interface SeatBots {
  /** Seat 1 (right), seat 2 (partner), seat 3 (left). */
  1: string
  2: string
  3: string
}

export interface GameState2v2 {
  deck: Card[]
  hands: [Card[], Card[], Card[], Card[]]
  pile: Card[]
  collected: [Card[], Card[], Card[], Card[]]
  pisti: [number, number, number, number]
  doublePisti: [number, number, number, number]
  pistiStreak: number
  lastCapturer: Seat | null
  turn: Seat
  phase: GamePhase2v2
  gameOver: boolean
  scoreboard: TeamScoreboard | null
  games: TeamMatchScore
  gameNumber: number
  dealSerial: number
  /** Selected opponent difficulty (both Onlar seats). Partner is a separate random bot. */
  activeBotId: string
  /** Per-seat bot id: strategy + display. Seats 1 & 3 = opponents, 2 = partner. */
  seatBots: SeatBots
  localSeat: Seat
  /** Who leads this el; badge 1. Advances clockwise each el. */
  firstSeat: Seat
}

let dealCounter = 0
function nextDealSerial(): number {
  dealCounter += 1
  return dealCounter
}

/**
 * Opponents (right + left) use the selected difficulty bot.
 * Partner (top) is a random other bot.
 */
export function assignSeatBots(opponentBotId: string): SeatBots {
  const opponent = getBot(opponentBotId).id
  const others = BOTS.map((b) => b.id).filter((id) => id !== opponent)
  const partnerPool = others.length > 0 ? others : [opponent]
  const partner = partnerPool[Math.floor(Math.random() * partnerPool.length)]!
  return {
    1: opponent,
    2: partner,
    3: opponent,
  }
}

function emptyTuple4<T>(value: T): [T, T, T, T] {
  return [value, value, value, value]
}

function freshState(
  games: TeamMatchScore = { biz: 0, onlar: 0 },
  gameNumber = 1,
  firstSeat: Seat = 0,
  activeBotId: string = DEFAULT_BOT_ID,
  seatBots?: SeatBots,
): GameState2v2 {
  const { hands, table, deck } = dealNewGame2v2(HAND_SIZE_2V2)
  return {
    deck,
    hands,
    pile: table,
    collected: [[], [], [], []],
    pisti: emptyTuple4(0),
    doublePisti: emptyTuple4(0),
    pistiStreak: 0,
    lastCapturer: null,
    turn: firstSeat,
    phase: 'idle',
    gameOver: false,
    scoreboard: null,
    games,
    gameNumber,
    dealSerial: nextDealSerial(),
    activeBotId,
    seatBots: seatBots ?? assignSeatBots(activeBotId),
    localSeat: 0,
    firstSeat,
  }
}

function toSimState(g: GameState2v2): SimState2v2 {
  return {
    deck: g.deck,
    hands: g.hands,
    pile: g.pile,
    collected: g.collected,
    pisti: g.pisti,
    doublePisti: g.doublePisti,
    lastCapturer: g.lastCapturer,
    turn: g.turn,
    localSeat: g.localSeat,
  }
}

function commit(prev: GameState2v2, result: PlayResult2v2): GameState2v2 {
  const who = result.who
  const base = toSimState(prev)
  const hands: SimState2v2['hands'] = [
    base.hands[0].slice(),
    base.hands[1].slice(),
    base.hands[2].slice(),
    base.hands[3].slice(),
  ]
  // Card was removed at throw time; restore so the engine can resolve canonically.
  hands[who] = [...hands[who], result.playedCard]

  const restored: SimState2v2 = { ...base, turn: who, hands }
  const { next, refilled } = applyMove2v2(restored, result.playedCard.id)

  const pistiStreak = result.captured
    ? result.pisti
      ? prev.pistiStreak + 1
      : 0
    : prev.pistiStreak
  const dealSerial = refilled ? nextDealSerial() : prev.dealSerial

  const shared = {
    ...prev,
    deck: next.deck,
    hands: next.hands,
    pisti: next.pisti,
    doublePisti: next.doublePisti,
    pistiStreak,
    lastCapturer: next.lastCapturer,
    phase: 'idle' as const,
    dealSerial,
  }

  if (isTerminal2v2(next)) {
    const scoreboard = finalTeamScore(next)
    const collected: GameState2v2['collected'] = [
      next.collected[0].slice(),
      next.collected[1].slice(),
      next.collected[2].slice(),
      next.collected[3].slice(),
    ]
    if (next.pile.length > 0 && next.lastCapturer !== null) {
      const seat = next.lastCapturer
      collected[seat] = [...collected[seat], ...next.pile]
    }

    const games: TeamMatchScore = {
      biz: prev.games.biz + (scoreboard.winner === 'biz' ? 1 : 0),
      onlar: prev.games.onlar + (scoreboard.winner === 'onlar' ? 1 : 0),
    }

    return {
      ...shared,
      pile: [],
      collected,
      turn: prev.turn,
      gameOver: true,
      scoreboard,
      games,
    }
  }

  return {
    ...shared,
    pile: next.pile,
    collected: next.collected,
    turn: next.turn,
    gameOver: false,
    scoreboard: null,
  }
}

function opposingTeamCollected(g: GameState2v2, seat: Seat): Card[] {
  const oppTeam: TeamId = teamOf(seat) === 'biz' ? 'onlar' : 'biz'
  const [a, b] = seatsOfTeam(oppTeam)
  return [...g.collected[a], ...g.collected[b]]
}

function opposingHandCount(g: GameState2v2, seat: Seat): number {
  const oppTeam: TeamId = teamOf(seat) === 'biz' ? 'onlar' : 'biz'
  const [a, b] = seatsOfTeam(oppTeam)
  return g.hands[a].length + g.hands[b].length
}

function myTeamCollected(g: GameState2v2, seat: Seat): Card[] {
  const [a, b] = seatsOfTeam(teamOf(seat))
  return [...g.collected[a], ...g.collected[b]]
}

export function useGame2v2(options?: { initialState?: GameState2v2; botId?: string }) {
  const [state, setState] = useState<GameState2v2>(() => {
    if (options?.initialState) return options.initialState
    const botId = options?.botId ?? DEFAULT_BOT_ID
    return freshState({ biz: 0, onlar: 0 }, 1, 0, botId, assignSeatBots(botId))
  })
  const stateRef = useRef(state)
  stateRef.current = state

  const apply = useCallback((next: GameState2v2) => {
    stateRef.current = next
    setState(next)
  }, [])

  const newGame = useCallback(() => {
    const prev = stateRef.current
    apply(
      freshState(
        { biz: 0, onlar: 0 },
        1,
        0,
        prev.activeBotId,
        assignSeatBots(prev.activeBotId),
      ),
    )
  }, [apply])

  const nextGame = useCallback(() => {
    const prev = stateRef.current
    // Next el: first player rotates clockwise; badge numbers follow.
    const firstSeat = nextSeat(prev.firstSeat)
    apply(
      freshState(prev.games, prev.gameNumber + 1, firstSeat, prev.activeBotId, prev.seatBots),
    )
  }, [apply])

  const chooseBot = useCallback(
    (botId: string) => {
      apply(freshState({ biz: 0, onlar: 0 }, 1, 0, botId, assignSeatBots(botId)))
    },
    [apply],
  )

  const reorderPlayerHand = useCallback(
    (newOrder: string[]) => {
      const prev = stateRef.current
      const byId = new Map(prev.hands[0].map((c) => [c.id, c]))
      const reordered = newOrder
        .map((id) => byId.get(id))
        .filter((c): c is Card => c !== undefined)
      if (reordered.length !== prev.hands[0].length) return
      const hands: GameState2v2['hands'] = [
        reordered,
        prev.hands[1],
        prev.hands[2],
        prev.hands[3],
      ]
      apply({ ...prev, hands })
    },
    [apply],
  )

  const playLocalCard = useCallback(
    (cardId: string): PlayResult2v2 | null => {
      const prev = stateRef.current
      if (prev.turn !== 0 || prev.phase !== 'idle' || prev.gameOver) return null
      const card = prev.hands[0].find((c) => c.id === cardId)
      if (!card) return null

      const { captured, pisti, doublePisti } = checkCapture(card, prev.pile)
      const result: PlayResult2v2 = {
        who: 0,
        playedCard: card,
        captured,
        pisti,
        doublePisti,
        pistiStreak: pisti ? prev.pistiStreak + 1 : 0,
        capturedCards: [...prev.pile, card],
      }

      const hands: GameState2v2['hands'] = [
        prev.hands[0].filter((c) => c.id !== cardId),
        prev.hands[1],
        prev.hands[2],
        prev.hands[3],
      ]
      apply({ ...prev, hands, phase: 'animating' })
      return result
    },
    [apply],
  )

  const playBotSeat = useCallback((): PlayResult2v2 | null => {
    const prev = stateRef.current
    const seat = prev.turn
    if (seat === 0 || prev.phase !== 'idle' || prev.gameOver) return null

    const seatBotId = prev.seatBots[seat as 1 | 2 | 3]
    const bot = getBot(seatBotId)
    const hand = prev.hands[seat]
    if (hand.length === 0) return null

    const ctx: BotContext = {
      hand,
      pile: prev.pile,
      myCollected: myTeamCollected(prev, seat),
      oppCollected: opposingTeamCollected(prev, seat),
      deckCount: prev.deck.length,
      oppHandCount: opposingHandCount(prev, seat),
      rng: randomRng(),
    }
    const cardId = bot.strategy(ctx)
    const card = hand.find((c) => c.id === cardId) ?? hand[0]
    if (!card) return null

    const { captured, pisti, doublePisti } = checkCapture(card, prev.pile)
    const result: PlayResult2v2 = {
      who: seat,
      playedCard: card,
      captured,
      pisti,
      doublePisti,
      pistiStreak: pisti ? prev.pistiStreak + 1 : 0,
      capturedCards: [...prev.pile, card],
    }

    const hands: GameState2v2['hands'] = [
      prev.hands[0],
      prev.hands[1],
      prev.hands[2],
      prev.hands[3],
    ]
    hands[seat] = hand.filter((c) => c.id !== card.id)
    apply({ ...prev, hands, phase: 'animating' })
    return result
  }, [apply])

  const resolvePlay = useCallback(
    (result: PlayResult2v2) => {
      apply(commit(stateRef.current, result))
    },
    [apply],
  )

  const canPlayerAct = useMemo(
    () =>
      state.turn === 0 &&
      state.phase === 'idle' &&
      !state.gameOver &&
      state.hands[0].length > 0,
    [state.turn, state.phase, state.gameOver, state.hands],
  )

  const liveScore = useMemo(() => liveTeamScore(toSimState(state)), [state])

  return {
    state,
    canPlayerAct,
    liveScore,
    newGame,
    nextGame,
    chooseBot,
    reorderPlayerHand,
    playLocalCard,
    playBotSeat,
    resolvePlay,
  }
}

export type { TeamScoreboard, Seat }
