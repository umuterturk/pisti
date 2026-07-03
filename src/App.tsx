import { useCallback, useEffect, useRef, useState } from 'react'
import type { PanInfo } from 'framer-motion'
import { CaptureLayer, type CaptureState } from './components/CaptureLayer'
import { FlyingCardLayer } from './components/FlyingCardLayer'
import {
  createFlyingCardFromThrow,
  createOpponentFlyingCard,
  type FlyingCardState,
  type LandingResult,
} from './components/flyingCard'
import { ConfirmDialog } from './components/ConfirmDialog'
import { GameOver } from './components/GameOver'
import { Hud } from './components/Hud'
import { OpponentArea } from './components/OpponentArea'
import { OpponentPicker } from './components/OpponentPicker'
import { PlayerHand } from './components/PlayerHand'
import { StartScreen } from './components/StartScreen'
import { TablePile, type PileVisuals } from './components/TablePile'
import { ScorePopLayer, type ScorePop } from './components/ScorePopLayer'
import { getBot } from './game/bots/registry'
import { runTournament } from './game/bots/selfplay'
import type { Card as CardType } from './game/cards'
import { useGame, type PlayResult } from './game/useGame'
import {
  cardPoints,
  computeScoreboard,
  DOUBLE_PISTI_BONUS,
  PISTI_BONUS,
} from './game/rules'
import { TIMING } from './motion/params'

const PLAYER_NAME = 'Sen'

const CAPTURE_TOTAL_MS = (TIMING.capturePause + TIMING.captureMove) * 1000 + 120

// How long the deal-in animation takes (last card's stagger + spring settle).
// Turns are paused for this long so nobody plays before the cards arrive.
const DEAL_ANIM_MS = 950

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[pisti]', ...args)
}

// Points earned by a capture: the point cards swept, plus any pişti bonus.
// (Majority bonus is decided only at the end of the hand, so it's excluded.)
function capturePoints(result: PlayResult): number {
  const cards = result.capturedCards.reduce((sum, c) => sum + cardPoints(c), 0)
  const bonus = result.doublePisti ? DOUBLE_PISTI_BONUS : result.pisti ? PISTI_BONUS : 0
  return cards + bonus
}

export default function App() {
  const {
    state,
    canPlayerAct,
    nextGame,
    resign,
    chooseBot,
    reorderPlayerHand,
    playPlayerCard,
    playOpponentCard,
    resolvePlay,
  } = useGame()

  const [resignOpen, setResignOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [started, setStarted] = useState(false)
  const opponentName = getBot(state.activeBotId).name

  const pileRef = useRef<HTMLDivElement>(null)
  const opponentHandRef = useRef<HTMLDivElement>(null)
  const sideHudRef = useRef<HTMLDivElement>(null)
  const playerScoreRef = useRef<HTMLSpanElement>(null)
  const opponentScoreRef = useRef<HTMLSpanElement>(null)
  const [flying, setFlying] = useState<FlyingCardState | null>(null)
  const [capture, setCapture] = useState<CaptureState | null>(null)
  const [scorePop, setScorePop] = useState<ScorePop | null>(null)
  const [pileHighlight, setPileHighlight] = useState(false)
  const [pileVisuals, setPileVisuals] = useState<PileVisuals>({})
  const [shaking, setShaking] = useState<false | 'soft' | 'hard'>(false)
  const [dealing, setDealing] = useState(true)
  const captureResultRef = useRef<PlayResult | null>(null)
  const landTimerRef = useRef<number | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)
  const scorePopTimerRef = useRef<number | null>(null)
  const pistiTriggerCountRef = useRef(0)

  // Whenever a fresh hand is dealt, pause play until the deal-in animation ends.
  useEffect(() => {
    setDealing(true)
    const timer = window.setTimeout(() => setDealing(false), DEAL_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [state.dealSerial])

  const getPileTarget = useCallback(() => {
    const pileEl = pileRef.current?.querySelector('.table-pile__stack')
    return pileEl?.getBoundingClientRect() ?? pileRef.current?.getBoundingClientRect()
  }, [])

  const recordLanding = useCallback((card: CardType, land: LandingResult) => {
    setPileVisuals((prev) => ({ ...prev, [card.id]: land }))
  }, [])

  const finishCapture = useCallback(() => {
    const result = captureResultRef.current
    log('finishCapture', { who: result?.who, card: result?.playedCard.id })
    captureResultRef.current = null
    setCapture(null)
    setPileHighlight(false)
    setPileVisuals({})
    if (result) resolvePlay(result)
  }, [resolvePlay])

  // Applies the result once the flying card has finished its motion. This is
  // the single source of progression, invoked only from a parent-owned timer.
  const applyLanding = useCallback(
    (result: PlayResult, land: LandingResult) => {
      log('applyLanding', {
        who: result.who,
        card: result.playedCard.id,
        captured: result.captured,
        pisti: result.pisti,
      })
      setFlying(null)
      recordLanding(result.playedCard, land)

      if (result.captured) {
        captureResultRef.current = result
        setPileHighlight(true)

        // A pişti gets a dramatic screen shake, synced with the badge pop.
        // A double pişti shakes harder and longer.
        if (result.pisti) {
          if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
          shakeTimerRef.current = window.setTimeout(() => {
            setShaking(result.doublePisti ? 'hard' : 'soft')
            shakeTimerRef.current = window.setTimeout(() => {
              shakeTimerRef.current = null
              setShaking(false)
            }, result.doublePisti ? 850 : 600)
          }, TIMING.capturePause * 1000)
        }

        const pileRect = getPileTarget()
        const originX = pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2
        const originY = pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2
        setCapture({
          id: `cap-${Date.now()}`,
          cards: result.capturedCards,
          winner: result.who,
          pisti: result.pisti,
          doublePisti: result.doublePisti,
          pistiStreak: result.pistiStreak,
          originX,
          originY,
        })

        // A "+N" popup floats from the pile toward the winner's score.
        const earned = capturePoints(result)
        if (earned > 0) {
          if (scorePopTimerRef.current !== null) window.clearTimeout(scorePopTimerRef.current)
          scorePopTimerRef.current = window.setTimeout(() => {
            scorePopTimerRef.current = null
            const scoreEl =
              result.who === 'player' ? playerScoreRef.current : opponentScoreRef.current
            const scoreRect = scoreEl?.getBoundingClientRect()
            const toX = scoreRect ? scoreRect.left + scoreRect.width / 2 : originX
            const toY = scoreRect ? scoreRect.top + scoreRect.height / 2 : originY
            setScorePop({
              id: `pop-${Date.now()}`,
              amount: earned,
              winner: result.who,
              fromX: originX,
              fromY: originY,
              toX,
              toY,
            })
            // Clear once its float-and-fade finishes (matches ScorePopLayer duration).
            scorePopTimerRef.current = window.setTimeout(() => {
              scorePopTimerRef.current = null
              setScorePop(null)
            }, 1250)
          }, TIMING.capturePause * 1000)
        }
        if (captureTimerRef.current !== null) {
          window.clearTimeout(captureTimerRef.current)
        }
        captureTimerRef.current = window.setTimeout(() => {
          captureTimerRef.current = null
          finishCapture()
        }, CAPTURE_TOTAL_MS)
        return
      }

      resolvePlay(result)
    },
    [recordLanding, resolvePlay, finishCapture],
  )

  // Launches the flying card and schedules its landing on a parent-owned timer
  // that cannot be cancelled by child re-renders or StrictMode double-effects.
  const launchFlight = useCallback(
    (result: PlayResult, fly: FlyingCardState) => {
      log('launchFlight', { who: result.who, card: result.playedCard.id, totalMs: fly.totalMs })
      if (landTimerRef.current !== null) {
        window.clearTimeout(landTimerRef.current)
      }
      setFlying(fly)
      landTimerRef.current = window.setTimeout(() => {
        log('landTimer fired', { who: result.who, card: result.playedCard.id })
        landTimerRef.current = null
        applyLanding(result, fly.landing)
      }, fly.totalMs + 30)
    },
    [applyLanding],
  )

  const handlePlayerThrow = useCallback(
    (card: CardType, info: PanInfo, element: HTMLElement) => {
      log('handlePlayerThrow', {
        card: card.id,
        canPlayerAct,
        flying: !!flying,
        capture: !!capture,
      })
      if (!canPlayerAct || flying || capture) {
        log('handlePlayerThrow BLOCKED', { canPlayerAct, flying: !!flying, capture: !!capture })
        return
      }

      const target = getPileTarget()
      if (!target) {
        log('handlePlayerThrow: no pile target')
        return
      }

      const result = playPlayerCard(card.id)
      log('playPlayerCard ->', result ? { card: result.playedCard.id, captured: result.captured } : null)
      if (!result) return

      launchFlight(
        result,
        createFlyingCardFromThrow(card, element, target, info.velocity, info.offset, result.pisti),
      )
    },
    [canPlayerAct, flying, capture, getPileTarget, playPlayerCard, launchFlight],
  )

  const triggerOpponentThrow = useCallback(() => {
    log('triggerOpponentThrow', { flying: !!flying, capture: !!capture })
    if (flying || capture) {
      log('triggerOpponentThrow BLOCKED', { flying: !!flying, capture: !!capture })
      return
    }

    const result = playOpponentCard()
    log('playOpponentCard ->', result ? { card: result.playedCard.id, captured: result.captured } : null)
    if (!result) return

    const target = getPileTarget()
    const opponentCard = opponentHandRef.current?.querySelector('.opponent-area__card')
    const fromRect = opponentCard?.getBoundingClientRect()
    log('opponent geometry', { hasTarget: !!target, hasFromRect: !!fromRect })

    if (!target || !fromRect) {
      applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
      return
    }

    launchFlight(result, createOpponentFlyingCard(result.playedCard, fromRect, target, result.pisti))
  }, [flying, capture, getPileTarget, playOpponentCard, applyLanding, launchFlight])

  useEffect(() => {
    log('opponent-effect check', {
      turn: state.turn,
      phase: state.phase,
      gameOver: state.gameOver,
      flying: !!flying,
      capture: !!capture,
      oppHand: state.opponentHand.length,
    })
    if (
      state.turn !== 'opponent' ||
      state.phase !== 'idle' ||
      state.gameOver ||
      flying ||
      capture ||
      dealing
    ) {
      return
    }

    log('opponent-effect: scheduling throw in 650ms')
    const timer = window.setTimeout(triggerOpponentThrow, 650)
    return () => window.clearTimeout(timer)
  }, [state.turn, state.phase, state.gameOver, flying, capture, dealing, triggerOpponentThrow, state.opponentHand.length])

  const resetTransient = useCallback(() => {
    if (landTimerRef.current !== null) {
      window.clearTimeout(landTimerRef.current)
      landTimerRef.current = null
    }
    if (captureTimerRef.current !== null) {
      window.clearTimeout(captureTimerRef.current)
      captureTimerRef.current = null
    }
    if (shakeTimerRef.current !== null) {
      window.clearTimeout(shakeTimerRef.current)
      shakeTimerRef.current = null
    }
    if (scorePopTimerRef.current !== null) {
      window.clearTimeout(scorePopTimerRef.current)
      scorePopTimerRef.current = null
    }
    setFlying(null)
    setCapture(null)
    setScorePop(null)
    setPileHighlight(false)
    setPileVisuals({})
    setShaking(false)
    captureResultRef.current = null
  }, [])

  const handleNextGame = useCallback(() => {
    resetTransient()
    nextGame()
  }, [resetTransient, nextGame])

  const handleResignConfirm = useCallback(() => {
    setResignOpen(false)
    resetTransient()
    resign()
  }, [resetTransient, resign])

  const handleSelectBot = useCallback(
    (botId: string) => {
      setPickerOpen(false)
      resetTransient()
      chooseBot(botId)
    },
    [resetTransient, chooseBot],
  )

  const handleStart = useCallback(
    (botId: string) => {
      resetTransient()
      chooseBot(botId)
      setStarted(true)
    },
    [resetTransient, chooseBot],
  )

  // Dev-only: replay the pişti capture animation without touching game state.
  const triggerPistiDemo = useCallback((streak = 1) => {
    if (flying || capture) return
    const demoCards: CardType[] = [
      { id: 'demo-1', suit: 'hearts', rank: '7' },
      { id: 'demo-2', suit: 'spades', rank: '7' },
    ]
    const pileRect = getPileTarget()
    setPileHighlight(true)
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => {
      setShaking(streak >= 4 ? 'hard' : 'soft')
      shakeTimerRef.current = window.setTimeout(() => {
        shakeTimerRef.current = null
        setShaking(false)
      }, streak >= 4 ? 850 : 600)
    }, TIMING.capturePause * 1000)

    setCapture({
      id: `demo-${Date.now()}`,
      cards: demoCards,
      winner: 'player',
      pisti: true,
      doublePisti: false,
      pistiStreak: streak,
      originX: pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2,
      originY: pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2,
    })
    if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
    captureTimerRef.current = window.setTimeout(() => {
      captureTimerRef.current = null
      setCapture(null)
      setPileHighlight(false)
    }, CAPTURE_TOTAL_MS)
  }, [flying, capture, getPileTarget])

  useEffect(() => {
    return () => {
      if (landTimerRef.current !== null) window.clearTimeout(landTimerRef.current)
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
      if (scorePopTimerRef.current !== null) window.clearTimeout(scorePopTimerRef.current)
    }
  }, [])

  const liveScore = computeScoreboard(
    state.playerCollected,
    state.opponentCollected,
    state.playerPisti,
    state.opponentPisti,
  )

  // Capture hint: while the player can act, highlight the rank of any hand card
  // that matches the top pile card, plus the matching card on the board.
  const canHint = canPlayerAct && !flying && !capture && !dealing
  const topCard = state.pile.length > 0 ? state.pile[state.pile.length - 1] : null
  const matchRank = canHint && topCard ? topCard.rank : null
  const playerHasJack = canHint && state.pile.length > 0 && state.playerHand.some((c) => c.rank === 'J')
  const playerHasMatch =
    matchRank != null && state.playerHand.some((c) => c.rank === matchRank)
  const highlightPileTop = playerHasMatch || playerHasJack

  return (
    <div
      className={`game-shell${
        shaking === 'hard'
          ? ' game-shell--shake-hard'
          : shaking === 'soft'
            ? ' game-shell--shake'
            : ''
      }`}
    >
      <div
        className={`opponent-wrap${dealing ? ' opponent-wrap--dealing' : ''}`}
        ref={opponentHandRef}
      >
        <Hud
          side="top"
          name={opponentName}
          score={liveScore.opponent.total}
          cards={state.opponentCollected.length}
          active={state.turn === 'opponent'}
          scoreRef={opponentScoreRef}
        />
        <OpponentArea handCount={state.opponentHand.length} dealFromRef={sideHudRef} />
      </div>

      <div className="table-area">
        <TablePile
          ref={pileRef}
          cards={state.pile}
          visuals={pileVisuals}
          highlight={pileHighlight}
          highlightTopRank={highlightPileTop}
          showPlayPrompt={canPlayerAct && !flying && !capture && !dealing}
          dealFromRef={sideHudRef}
          capturing={!!capture}
        />
      </div>

      <div className="player-area">
        <PlayerHand
          cards={state.playerHand}
          disabled={!canPlayerAct || !!flying || !!capture || dealing}
          matchRank={matchRank}
          dealFromRef={sideHudRef}
          onReorder={reorderPlayerHand}
          onThrow={handlePlayerThrow}
        />
        <Hud
          side="bottom"
          name={PLAYER_NAME}
          score={liveScore.player.total}
          cards={state.playerCollected.length}
          active={state.turn === 'player'}
          scoreRef={playerScoreRef}
        />
      </div>

      <div className="side-hud" ref={sideHudRef}>
        <div className="side-hud__match">
          <span className="side-hud__score side-hud__score--me">{state.games.player}</span>
          <span className="side-hud__sep">–</span>
          <span className="side-hud__score">{state.games.opponent}</span>
        </div>
        <div className="side-hud__label">El {state.gameNumber}</div>
        <div className="side-hud__label">Deste {state.deck.length}</div>
        <button
          className="side-hud__btn"
          onClick={() => setPickerOpen(true)}
          aria-label="Rakip seç"
        >
          Rakip
        </button>
        <button
          className="side-hud__btn"
          onClick={() => setResignOpen(true)}
          aria-label="Oyunu bırak"
        >
          Çekil
        </button>
        {import.meta.env.DEV && (
          <button
            className="side-hud__btn side-hud__btn--debug"
            onClick={() => {
              const streak = (pistiTriggerCountRef.current % 4) + 1
              pistiTriggerCountRef.current += 1
              triggerPistiDemo(streak)
            }}
            aria-label="Pişti animasyonunu test et"
          >
            Pişti?
          </button>
        )}
        {import.meta.env.DEV && (
          <button
            className="side-hud__btn side-hud__btn--debug"
            onClick={() =>
              runTournament(
                ['random', 'greedy', 'defensive', 'jackSaver', 'mc16', 'mc40'],
                200,
              )
            }
            aria-label="Botları karşılaştır"
          >
            Turnuva
          </button>
        )}
      </div>

      <FlyingCardLayer flying={flying} />
      <CaptureLayer capture={capture} visuals={pileVisuals} />
      <ScorePopLayer pop={scorePop} />
      {state.gameOver && state.scoreboard && (
        <GameOver
          scoreboard={state.scoreboard}
          games={state.games}
          playerName={PLAYER_NAME}
          opponentName={opponentName}
          onNewGame={handleNextGame}
        />
      )}
      <StartScreen
        open={!started}
        defaultBotId={state.activeBotId}
        onStart={handleStart}
      />
      <OpponentPicker
        open={pickerOpen}
        activeBotId={state.activeBotId}
        onSelect={handleSelectBot}
        onClose={() => setPickerOpen(false)}
      />
      <ConfirmDialog
        open={resignOpen}
        title="Oyunu bırak"
        message="Bu eli rakibe bırakıp yeni el başlatılsın mı?"
        confirmLabel="Çekil"
        cancelLabel="Vazgeç"
        onConfirm={handleResignConfirm}
        onCancel={() => setResignOpen(false)}
      />
    </div>
  )
}
