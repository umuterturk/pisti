import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanInfo } from 'framer-motion'
import { avatarUrl } from '../app/avatarUrl'
import { TURN_MS } from '../app/TurnTimer'
import { track } from '../analytics'
import { getBot } from '../game/bots/registry'
import type { Card as CardType } from '../game/cards'
import { DOUBLE_PISTI_BONUS, PISTI_BONUS, cardPoints, type TeamScoreboard } from '../game/rules'
import {
  CAPTURE,
  DOUBLE_PISTI,
  EXTREME_PISTI,
  PISTI,
  QUAD_PISTI,
  TAP,
  TRIPLE_PISTI,
  WIN,
  vibrate,
} from '../game/haptics'
import { useGame2v2, type PlayResult2v2, type Seat } from '../game/useGame2v2'
import { seatNumberOf, teamOf } from '../game/engine2v2'
import {
  PARTNER_OPP_CARD_HEIGHT,
  PARTNER_OPP_CARD_WIDTH,
  PARTNER_OPP_VISIBLE_RATIO,
  SIDE_OPP_CARD_HEIGHT,
  SIDE_OPP_CARD_WIDTH,
  SIDE_OPP_VISIBLE_RATIO,
  TIMING,
} from '../motion/params'
import { CaptureLayer, type CaptureState } from './CaptureLayer'
import { EmojiAnimation } from './EmojiAnimation'
import { FlyingCardLayer } from './FlyingCardLayer'
import {
  createFlyingCardFromThrow,
  createOpponentFlyingCard,
  type FlyingCardState,
  type LandingResult,
} from './flyingCard'
import { GameOver } from './GameOver'
import type { ReactionPick } from './Hud'
import { OpponentArea } from './OpponentArea'
import { PlayerHand } from './PlayerHand'
import { SeatHud } from './SeatHud'
import { ScorePopLayer, type ScorePop } from './ScorePopLayer'
import { TablePile, type PileVisuals } from './TablePile'
import { TeamScoreHud } from './TeamScoreHud'
import type { EmojiReaction } from '../multiplayer/types'

const CAPTURE_TOTAL_MS =
  (TIMING.capturePause + TIMING.captureCompress + TIMING.captureMove) * 1000 + 80

const LOCAL_UID = 'local-2v2'

/** Auto-play on turn timer expiry: rank-match > jack > random. */
function pickAutoPlayCard(hand: CardType[], pile: CardType[]): CardType {
  if (hand.length === 0) throw new Error('Empty hand')
  const top = pile.length > 0 ? pile[pile.length - 1] : null
  if (top) {
    const match = hand.find((c) => c.rank === top.rank)
    if (match) return match
    const jack = hand.find((c) => c.rank === 'J')
    if (jack) return jack
  }
  return hand[Math.floor(Math.random() * hand.length)]
}

function capturePoints(result: PlayResult2v2): number {
  const cards = result.capturedCards.reduce((sum, c) => sum + cardPoints(c), 0)
  const bonus = result.doublePisti ? DOUBLE_PISTI_BONUS : result.pisti ? PISTI_BONUS : 0
  return cards + bonus
}

function teamWinnerVisual(seat: Seat): 'player' | 'opponent' {
  return teamOf(seat) === 'biz' ? 'player' : 'opponent'
}

function poolTeamCards(
  collected: [CardType[], CardType[], CardType[], CardType[]],
  team: 'biz' | 'onlar',
): CardType[] {
  const seats = team === 'biz' ? ([0, 2] as const) : ([1, 3] as const)
  return [...collected[seats[0]], ...collected[seats[1]]]
}

function toLegacyScoreboard(sb: TeamScoreboard) {
  return {
    player: sb.biz,
    opponent: sb.onlar,
    winner:
      sb.winner === 'biz' ? ('player' as const) : sb.winner === 'onlar' ? ('opponent' as const) : ('tie' as const),
  }
}

interface TwoVsTwoGameProps {
  botId: string
  playerName: string
  onLeave: () => void
}

export function TwoVsTwoGame({ botId, playerName, onLeave }: TwoVsTwoGameProps) {
  const {
    state,
    canPlayerAct,
    liveScore,
    nextGame,
    reorderPlayerHand,
    playLocalCard,
    playBotSeat,
    resolvePlay,
  } = useGame2v2({ botId })

  const pileRef = useRef<HTMLDivElement>(null)
  const sideHudRef = useRef<HTMLDivElement>(null)
  const partnerHandRef = useRef<HTMLDivElement>(null)
  const leftHandRef = useRef<HTMLDivElement>(null)
  const rightHandRef = useRef<HTMLDivElement>(null)
  const avatar0Ref = useRef<HTMLSpanElement>(null)
  const avatar1Ref = useRef<HTMLSpanElement>(null)
  const avatar2Ref = useRef<HTMLSpanElement>(null)
  const avatar3Ref = useRef<HTMLSpanElement>(null)
  const avatarRefFor = useCallback((seat: Seat) => {
    if (seat === 0) return avatar0Ref
    if (seat === 1) return avatar1Ref
    if (seat === 2) return avatar2Ref
    return avatar3Ref
  }, [])

  const [flying, setFlying] = useState<FlyingCardState | null>(null)
  const [capture, setCapture] = useState<CaptureState | null>(null)
  const [scorePop, setScorePop] = useState<ScorePop | null>(null)
  const [pileVisuals, setPileVisuals] = useState<PileVisuals>({})
  const [pileHighlight, setPileHighlight] = useState(false)
  const [dealing, setDealing] = useState(true)
  const [shaking, setShaking] = useState<false | 'soft' | 'hard'>(false)
  const [localReactions, setLocalReactions] = useState<EmojiReaction[]>([])
  const [turnDeadline, setTurnDeadline] = useState(0)
  const autoPlayedDeadlineRef = useRef(0)

  const flyingRef = useRef(flying)
  flyingRef.current = flying
  const captureRef = useRef(capture)
  captureRef.current = capture
  const canActRef = useRef(canPlayerAct)
  canActRef.current = canPlayerAct

  const landTimerRef = useRef<number | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const scorePopTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)
  const captureResultRef = useRef<PlayResult2v2 | null>(null)
  const dealSerialRef = useRef(state.dealSerial)

  useEffect(() => {
    if (state.dealSerial === dealSerialRef.current && !dealing) return
    dealSerialRef.current = state.dealSerial
    setDealing(true)
    const t = window.setTimeout(() => setDealing(false), 900)
    return () => window.clearTimeout(t)
  }, [state.dealSerial, dealing])

  const getPileTarget = useCallback(() => pileRef.current?.getBoundingClientRect() ?? null, [])

  const recordLanding = useCallback((card: CardType, land: LandingResult) => {
    setPileVisuals((prev) => ({
      ...prev,
      [card.id]: { offsetX: land.offsetX, offsetY: land.offsetY, rotation: land.rotation },
    }))
  }, [])

  const finishCapture = useCallback(() => {
    const result = captureResultRef.current
    captureResultRef.current = null
    setCapture(null)
    setPileHighlight(false)
    setPileVisuals({})
    if (result) resolvePlay(result)
  }, [resolvePlay])

  const applyLanding = useCallback(
    (result: PlayResult2v2, land: LandingResult) => {
      setFlying(null)
      recordLanding(result.playedCard, land)

      if (result.captured) {
        captureResultRef.current = result
        setPileHighlight(true)
        if (result.pisti) {
          if (result.pistiStreak >= 5) vibrate(EXTREME_PISTI)
          else if (result.pistiStreak === 4) vibrate(QUAD_PISTI)
          else if (result.pistiStreak === 3) vibrate(TRIPLE_PISTI)
          else if (result.pistiStreak === 2) vibrate(DOUBLE_PISTI)
          else vibrate(PISTI)
        } else {
          vibrate(CAPTURE)
        }
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
          winner: teamWinnerVisual(result.who),
          pisti: result.pisti,
          doublePisti: result.doublePisti,
          pistiStreak: result.pistiStreak,
          originX,
          originY,
        })

        const earned = capturePoints(result)
        if (earned > 0) {
          if (scorePopTimerRef.current !== null) window.clearTimeout(scorePopTimerRef.current)
          scorePopTimerRef.current = window.setTimeout(() => {
            scorePopTimerRef.current = null
            const avatarEl = avatarRefFor(result.who).current
            const avatarRect = avatarEl?.getBoundingClientRect()
            const toX = avatarRect ? avatarRect.left + avatarRect.width / 2 : originX
            const toY = avatarRect ? avatarRect.top + avatarRect.height / 2 : originY
            setScorePop({
              id: `pop-${Date.now()}`,
              amount: earned,
              winner: teamWinnerVisual(result.who),
              fromX: originX,
              fromY: originY,
              toX,
              toY,
            })
            scorePopTimerRef.current = window.setTimeout(() => {
              scorePopTimerRef.current = null
              setScorePop(null)
            }, 1250)
          }, TIMING.capturePause * 1000)
        }
        if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
        captureTimerRef.current = window.setTimeout(() => {
          captureTimerRef.current = null
          finishCapture()
        }, CAPTURE_TOTAL_MS)
        return
      }

      resolvePlay(result)
    },
    [recordLanding, resolvePlay, finishCapture, getPileTarget, avatarRefFor],
  )

  const launchFlight = useCallback(
    (result: PlayResult2v2, fly: FlyingCardState) => {
      if (landTimerRef.current !== null) window.clearTimeout(landTimerRef.current)
      setFlying(fly)
      landTimerRef.current = window.setTimeout(() => {
        landTimerRef.current = null
        applyLanding(result, fly.landing)
      }, fly.totalMs + 30)
    },
    [applyLanding],
  )

  const seatHandRef = useCallback((seat: Seat) => {
    if (seat === 2) return partnerHandRef
    if (seat === 3) return leftHandRef
    if (seat === 1) return rightHandRef
    return null
  }, [])

  const handlePlayerThrow = useCallback(
    (card: CardType, info: PanInfo, element: HTMLElement) => {
      if (!canActRef.current || flyingRef.current || captureRef.current) return
      const target = getPileTarget()
      if (!target) return
      const result = playLocalCard(card.id)
      if (!result) return
      vibrate(TAP)
      launchFlight(
        result,
        createFlyingCardFromThrow(card, element, target, info.velocity, info.offset, result.pisti),
      )
    },
    [getPileTarget, playLocalCard, launchFlight],
  )

  const triggerBotThrow = useCallback(() => {
    if (flyingRef.current || captureRef.current) return
    const result = playBotSeat()
    if (!result) return
    const target = getPileTarget()
    const wrap = seatHandRef(result.who)?.current
    const cardEl = wrap?.querySelector('.opponent-area__card')
    const fromRect = cardEl?.getBoundingClientRect()
    if (!target || !fromRect) {
      applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
    } else {
      launchFlight(result, createOpponentFlyingCard(result.playedCard, fromRect, target, result.pisti))
    }
  }, [playBotSeat, getPileTarget, seatHandRef, applyLanding, launchFlight])

  useEffect(() => {
    if (state.gameOver || dealing) {
      setTurnDeadline(0)
      return
    }
    if (state.turn === 0 && state.phase === 'idle') {
      const deadline = Date.now() + TURN_MS
      setTurnDeadline(deadline)
      return
    }
    setTurnDeadline(0)
  }, [state.turn, state.phase, state.gameOver, dealing, state.gameNumber, state.dealSerial])

  const handleTurnExpire = useCallback(() => {
    if (!canActRef.current || flyingRef.current || captureRef.current) return
    if (state.turn !== 0 || state.phase !== 'idle' || state.gameOver) return
    if (state.hands[0].length === 0) return
    if (turnDeadline && autoPlayedDeadlineRef.current === turnDeadline) return

    const card = pickAutoPlayCard(state.hands[0], state.pile)
    const result = playLocalCard(card.id)
    if (!result) return

    if (turnDeadline) autoPlayedDeadlineRef.current = turnDeadline
    track('turn_timeout_autoplay', {
      mode: 'solo',
      cards_in_hand: state.hands[0].length,
    })

    const target = getPileTarget()
    const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)
    if (target && cardEl) {
      launchFlight(
        result,
        createFlyingCardFromThrow(card, cardEl, target, { x: 0, y: 0 }, { x: 0, y: 0 }, result.pisti),
      )
    } else if (target) {
      applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
    }
  }, [
    state.turn,
    state.phase,
    state.gameOver,
    state.hands,
    state.pile,
    turnDeadline,
    playLocalCard,
    getPileTarget,
    launchFlight,
    applyLanding,
  ])

  useEffect(() => {
    if (!turnDeadline || state.turn !== 0) return
    if (autoPlayedDeadlineRef.current === turnDeadline) return

    const delay = Math.max(0, turnDeadline - Date.now())
    const t = window.setTimeout(() => handleTurnExpire(), delay)
    return () => window.clearTimeout(t)
  }, [turnDeadline, state.turn, handleTurnExpire, flying, capture, dealing])

  useEffect(() => {
    if (state.turn === 0 || state.phase !== 'idle' || state.gameOver || flying || capture || dealing) {
      return
    }
    const timer = window.setTimeout(triggerBotThrow, 650)
    return () => window.clearTimeout(timer)
  }, [state.turn, state.phase, state.gameOver, flying, capture, dealing, triggerBotThrow, state.hands])

  useEffect(() => {
    if (!state.gameOver || !state.scoreboard) return
    if (state.scoreboard.winner === 'biz') vibrate(WIN)
  }, [state.gameOver, state.scoreboard])

  const handleReaction = useCallback((pick: ReactionPick) => {
    const reaction: EmojiReaction = {
      from: LOCAL_UID,
      timestamp: Date.now(),
      ...(pick.kind === 'emoji' ? { emoji: pick.value } : { text: pick.value }),
    }
    setLocalReactions((prev) => [...prev.slice(-8), reaction])
  }, [])

  const partnerName = getBot(state.seatBots[2]).name
  const rightName = getBot(state.seatBots[1]).name
  const leftName = getBot(state.seatBots[3]).name

  const matchRank = useMemo(() => {
    if (state.pile.length === 0) return null
    return state.pile[state.pile.length - 1].rank
  }, [state.pile])

  const busy = !!flying || !!capture || dealing

  return (
    <div
      className={`two-v-two${
        shaking === 'hard' ? ' game-shell--shake-hard' : shaking === 'soft' ? ' game-shell--shake' : ''
      }`}
    >
      <TeamScoreHud
        ref={sideHudRef}
        biz={state.games.biz}
        onlar={state.games.onlar}
        bizHandTotal={liveScore.biz.total}
        onlarHandTotal={liveScore.onlar.total}
        gameNumber={state.gameNumber}
        deckCount={state.deck.length}
        onLeave={onLeave}
      />

      <div
        className={`seat-wrap seat-wrap--partner${dealing ? ' seat-wrap--dealing' : ''}`}
        ref={partnerHandRef}
      >
        <SeatHud
          side="top"
          seatNumber={seatNumberOf(2, state.firstSeat)}
          name={partnerName}
          cards={state.collected[2].length}
          active={state.turn === 2}
          thinking={state.turn === 2 && state.phase === 'idle' && !busy}
          avatarRef={avatar2Ref}
          avatarUrl={avatarUrl(state.seatBots[2])}
        />
        <OpponentArea
          handCount={state.hands[2].length}
          dealFromRef={sideHudRef}
          orientation="top"
          cardWidth={PARTNER_OPP_CARD_WIDTH}
          cardHeight={PARTNER_OPP_CARD_HEIGHT}
          visibleRatio={PARTNER_OPP_VISIBLE_RATIO}
        />
      </div>

      <div className="table-band">
        <div className={`seat-wrap seat-wrap--left${dealing ? ' seat-wrap--dealing' : ''}`} ref={leftHandRef}>
          <SeatHud
            side="left"
            seatNumber={seatNumberOf(3, state.firstSeat)}
            name={leftName}
            cards={state.collected[3].length}
            active={state.turn === 3}
            thinking={state.turn === 3 && state.phase === 'idle' && !busy}
            avatarRef={avatar3Ref}
            avatarUrl={avatarUrl(state.seatBots[3])}
          />
          <OpponentArea
            handCount={state.hands[3].length}
            dealFromRef={sideHudRef}
            orientation="left"
            cardWidth={SIDE_OPP_CARD_WIDTH}
            cardHeight={SIDE_OPP_CARD_HEIGHT}
            visibleRatio={SIDE_OPP_VISIBLE_RATIO}
          />
        </div>

        <div className="table-area table-area--2v2">
          <TablePile
            ref={pileRef}
            cards={state.pile}
            visuals={pileVisuals}
            highlight={pileHighlight}
            showPlayPrompt={canPlayerAct && !busy}
            dealFromRef={sideHudRef}
            capturing={!!capture}
          />
        </div>

        <div className={`seat-wrap seat-wrap--right${dealing ? ' seat-wrap--dealing' : ''}`} ref={rightHandRef}>
          <OpponentArea
            handCount={state.hands[1].length}
            dealFromRef={sideHudRef}
            orientation="right"
            cardWidth={SIDE_OPP_CARD_WIDTH}
            cardHeight={SIDE_OPP_CARD_HEIGHT}
            visibleRatio={SIDE_OPP_VISIBLE_RATIO}
          />
          <SeatHud
            side="right"
            seatNumber={seatNumberOf(1, state.firstSeat)}
            name={rightName}
            cards={state.collected[1].length}
            active={state.turn === 1}
            thinking={state.turn === 1 && state.phase === 'idle' && !busy}
            avatarRef={avatar1Ref}
            avatarUrl={avatarUrl(state.seatBots[1])}
          />
        </div>
      </div>

      <div className="player-area">
        <PlayerHand
          cards={state.hands[0]}
          disabled={!canPlayerAct || busy}
          matchRank={matchRank}
          dealFromRef={sideHudRef}
          onReorder={reorderPlayerHand}
          onThrow={handlePlayerThrow}
        />
        <SeatHud
          side="bottom"
          seatNumber={seatNumberOf(0, state.firstSeat)}
          allowReactions
          name={playerName}
          cards={state.collected[0].length}
          active={state.turn === 0}
          avatarRef={avatar0Ref}
          onReaction={handleReaction}
          avatarUrl={avatarUrl(playerName || 'sen')}
          turnDeadline={turnDeadline}
          onTurnExpire={handleTurnExpire}
        />
      </div>

      <FlyingCardLayer flying={flying} />
      <CaptureLayer capture={capture} visuals={pileVisuals} />
      <ScorePopLayer pop={scorePop} />
      <EmojiAnimation reactions={localReactions} localUid={LOCAL_UID} />

      {state.gameOver && state.scoreboard && (
        <GameOver
          scoreboard={toLegacyScoreboard(state.scoreboard)}
          games={{ player: state.games.biz, opponent: state.games.onlar }}
          playerName="Biz"
          opponentName="Onlar"
          playerCards={poolTeamCards(state.collected, 'biz')}
          opponentCards={poolTeamCards(state.collected, 'onlar')}
          onNewGame={() => {
            track('rematch_request', { mode: 'solo', source: 'end_screen_2v2' })
            nextGame()
          }}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}
