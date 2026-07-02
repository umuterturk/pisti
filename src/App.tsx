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
import { PlayerHand } from './components/PlayerHand'
import { TablePile, type PileVisuals } from './components/TablePile'
import type { Card as CardType } from './game/cards'
import { useGame, type PlayResult } from './game/useGame'
import { computeScoreboard } from './game/rules'
import { TIMING } from './motion/params'

const PLAYER_NAME = 'Sen'
const OPPONENT_NAME = 'Rakip'

const CAPTURE_TOTAL_MS = (TIMING.capturePause + TIMING.captureMove) * 1000 + 120

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[pisti]', ...args)
}

export default function App() {
  const {
    state,
    canPlayerAct,
    nextGame,
    resign,
    reorderPlayerHand,
    playPlayerCard,
    playOpponentCard,
    resolvePlay,
  } = useGame()

  const [resignOpen, setResignOpen] = useState(false)

  const pileRef = useRef<HTMLDivElement>(null)
  const opponentHandRef = useRef<HTMLDivElement>(null)
  const [flying, setFlying] = useState<FlyingCardState | null>(null)
  const [capture, setCapture] = useState<CaptureState | null>(null)
  const [pileHighlight, setPileHighlight] = useState(false)
  const [pileVisuals, setPileVisuals] = useState<PileVisuals>({})
  const [shaking, setShaking] = useState(false)
  const captureResultRef = useRef<PlayResult | null>(null)
  const landTimerRef = useRef<number | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)

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
        if (result.pisti) {
          if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
          shakeTimerRef.current = window.setTimeout(() => {
            setShaking(true)
            shakeTimerRef.current = window.setTimeout(() => {
              shakeTimerRef.current = null
              setShaking(false)
            }, 600)
          }, TIMING.capturePause * 1000)
        }

        const pileRect = getPileTarget()
        setCapture({
          id: `cap-${Date.now()}`,
          cards: result.capturedCards,
          winner: result.who,
          pisti: result.pisti,
          originX: pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2,
          originY: pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2,
        })
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

      launchFlight(result, createFlyingCardFromThrow(card, element, target, info.velocity, info.offset))
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

    launchFlight(result, createOpponentFlyingCard(result.playedCard, fromRect, target))
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
      capture
    ) {
      return
    }

    log('opponent-effect: scheduling throw in 650ms')
    const timer = window.setTimeout(triggerOpponentThrow, 650)
    return () => window.clearTimeout(timer)
  }, [state.turn, state.phase, state.gameOver, flying, capture, triggerOpponentThrow, state.opponentHand.length])

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
    setFlying(null)
    setCapture(null)
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

  // Dev-only: replay the pişti capture animation without touching game state.
  const triggerPistiDemo = useCallback(() => {
    if (flying || capture) return
    const demoCards: CardType[] = [
      { id: 'demo-1', suit: 'hearts', rank: '7' },
      { id: 'demo-2', suit: 'spades', rank: '7' },
    ]
    const pileRect = getPileTarget()
    setPileHighlight(true)
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => {
      setShaking(true)
      shakeTimerRef.current = window.setTimeout(() => {
        shakeTimerRef.current = null
        setShaking(false)
      }, 600)
    }, TIMING.capturePause * 1000)

    setCapture({
      id: `demo-${Date.now()}`,
      cards: demoCards,
      winner: 'player',
      pisti: true,
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
    }
  }, [])

  const liveScore = computeScoreboard(
    state.playerCollected,
    state.opponentCollected,
    state.playerPisti,
    state.opponentPisti,
  )

  return (
    <div className={`game-shell${shaking ? ' game-shell--shake' : ''}`}>
      <div className="opponent-wrap" ref={opponentHandRef}>
        <Hud
          side="top"
          name={OPPONENT_NAME}
          score={liveScore.opponent.total}
          pisti={state.opponentPisti}
          cards={state.opponentCollected.length}
          active={state.turn === 'opponent'}
        />
        <OpponentArea handCount={state.opponentHand.length} />
      </div>

      <div className="table-area">
        <TablePile
          ref={pileRef}
          cards={state.pile}
          visuals={pileVisuals}
          highlight={pileHighlight}
          capturing={!!capture}
        />
      </div>

      <div className="player-area">
        <PlayerHand
          cards={state.playerHand}
          disabled={!canPlayerAct || !!flying || !!capture}
          onReorder={reorderPlayerHand}
          onThrow={handlePlayerThrow}
        />
        <Hud
          side="bottom"
          name={PLAYER_NAME}
          score={liveScore.player.total}
          pisti={state.playerPisti}
          cards={state.playerCollected.length}
          active={state.turn === 'player'}
        />
      </div>

      <div className="side-hud">
        <div className="side-hud__match">
          <span className="side-hud__score side-hud__score--me">{state.games.player}</span>
          <span className="side-hud__sep">–</span>
          <span className="side-hud__score">{state.games.opponent}</span>
        </div>
        <div className="side-hud__label">El {state.gameNumber}</div>
        <div className="side-hud__label">Deste {state.deck.length}</div>
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
            onClick={triggerPistiDemo}
            aria-label="Pişti animasyonunu test et"
          >
            Pişti?
          </button>
        )}
      </div>

      <FlyingCardLayer flying={flying} />
      <CaptureLayer capture={capture} visuals={pileVisuals} />
      {state.gameOver && state.scoreboard && (
        <GameOver
          scoreboard={state.scoreboard}
          games={state.games}
          playerName={PLAYER_NAME}
          opponentName={OPPONENT_NAME}
          onNewGame={handleNextGame}
        />
      )}
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
