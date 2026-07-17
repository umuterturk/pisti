import { motion, AnimatePresence } from 'framer-motion'
import { useMemo } from 'react'
import { CountUp } from '../components/GameOver'
import { scoreBreakdown } from '../game/rules'
import type { GameState } from '../game/useGame'
import type { RivalryStats } from '../ports'
import type { MultiplayerState } from './useMultiplayer'

interface Props {
  open: boolean
  gameState: GameState
  mpState: MultiplayerState
  playerName: string
  opponentName: string
  /** Head-to-head record between these two players (null while loading / none yet). */
  rivalry: RivalryStats | null
  onRematch: () => void
  onLeave: () => void
}

type Result = 'win' | 'lose' | 'tie'

function SuitBurst({ result }: { result: Result }) {
  const suits = ['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣']
  return (
    <div className="mp-end__burst" aria-hidden="true">
      {suits.map((s, i) => (
        <motion.span
          key={i}
          className={`mp-end__suit mp-end__suit--${i % 2 === 0 ? 'dark' : 'red'}`}
          initial={{ opacity: 0, scale: 0, y: 20 }}
          animate={{
            opacity: [0, 0.85, 0],
            scale: [0.4, 1.1, 0.8],
            y: [20, -40 - (i % 4) * 18, -90 - (i % 3) * 24],
            x: (i % 2 === 0 ? 1 : -1) * (18 + (i % 5) * 14),
            rotate: [i % 2 === 0 ? -20 : 20, i % 2 === 0 ? 15 : -25],
          }}
          transition={{
            duration: result === 'win' ? 1.8 : 1.2,
            delay: 0.15 + i * 0.06,
            ease: 'easeOut',
          }}
        >
          {s}
        </motion.span>
      ))}
    </div>
  )
}

function RoundColumn({
  name,
  accent,
  hot,
  side,
  cards,
}: {
  name: string
  accent: 'me' | 'opp'
  hot: boolean
  side: NonNullable<GameState['scoreboard']>['player']
  cards: GameState['playerCollected']
}) {
  const detail = useMemo(() => {
    const { items } = scoreBreakdown(cards, side.pistiCount, side.doublePistiCount)
    const pistiPts = items
      .filter((i) => i.kind === 'pisti' || i.kind === 'doublePisti')
      .reduce((sum, i) => sum + i.points, 0)
    const pistiCount = side.pistiCount + side.doublePistiCount
    return {
      pistiPts,
      pistiCount,
      ten: items.find((i) => i.kind === 'tenDiamonds')?.points ?? 0,
      two: items.find((i) => i.kind === 'twoClubs')?.points ?? 0,
      other: items.find((i) => i.kind === 'other')?.points ?? 0,
    }
  }, [cards, side])

  return (
    <div className={`mp-end__col mp-end__col--${accent}${hot ? ' mp-end__col--hot' : ''}`}>
      <span className={`mp-end__avatar${accent === 'opp' ? ' mp-end__avatar--opp' : ''}`}>
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="mp-end__pname">{name}</span>
      <span className="mp-end__pts">
        <CountUp value={side.total} duration={1.1} />
      </span>
      <span className="mp-end__pts-label">el puanı</span>
      <ul className="mp-end__detail">
        <li>
          <span>{detail.pistiCount > 0 ? `Pişti ×${detail.pistiCount}` : 'Pişti'}</span>
          <span>{detail.pistiPts}</span>
        </li>
        <li className="mp-end__detail-row mp-end__detail-row--ten">
          <span className="mp-end__card-badge">10♦</span>
          <span>{detail.ten}</span>
        </li>
        <li className="mp-end__detail-row mp-end__detail-row--two">
          <span className="mp-end__card-badge">2♣</span>
          <span>{detail.two}</span>
        </li>
        <li>
          <span>Diğer</span>
          <span>{detail.other}</span>
        </li>
        <li>
          <span>Çoğunluk</span>
          <span>{side.majorityBonus}</span>
        </li>
        <li className="mp-end__detail-sub">
          <span>Kart</span>
          <span>{side.cardCount}</span>
        </li>
      </ul>
    </div>
  )
}

export function MultiplayerEndOverlay({
  open,
  gameState,
  mpState,
  playerName,
  opponentName,
  rivalry,
  onRematch,
  onLeave,
}: Props) {
  const { scoreboard, games } = gameState
  const { endedReason, opponentResigned, opponentLeft, localWantsRematch, opponentWantsRematch } = mpState

  let result: Result = 'tie'
  const isForfeit =
    opponentResigned || opponentLeft || endedReason === 'forfeit_heartbeat'
  if (isForfeit) {
    result = 'win'
  } else if (scoreboard) {
    result = scoreboard.winner === 'player' ? 'win' : scoreboard.winner === 'opponent' ? 'lose' : 'tie'
  } else {
    return null
  }

  const titleMap: Record<Result, string> = {
    win: 'Kazandın',
    lose: 'Kaybettin',
    tie: 'Berabere',
  }

  const reasonLabel = opponentLeft
    ? 'Rakip masadan kalktı'
    : opponentResigned
      ? 'Rakip eli bıraktı'
      : endedReason === 'forfeit_heartbeat'
        ? 'Rakip bağlantısını kaybetti'
        : null

  const myPts = scoreboard?.player.total ?? 0
  const oppPts = scoreboard?.opponent.total ?? 0

  const rematchDisabled = isForfeit || localWantsRematch
  const rematchLabel = isForfeit
    ? 'Rakip ayrıldı'
    : localWantsRematch
      ? opponentWantsRematch
        ? 'Kartlar dağılıyor…'
        : 'Rakip bekleniyor…'
      : opponentWantsRematch
        ? 'Rakip rövanş istiyor!'
        : 'Rövanş'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`mp-end mp-end--${result}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="mp-end__felt" aria-hidden="true" />
          <SuitBurst result={result} />

          <motion.div
            className="mp-end__board"
            initial={{ scale: 0.88, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.05 }}
          >
            <motion.div
              className={`mp-end__stamp mp-end__stamp--${result}`}
              initial={{ scale: 2.4, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: result === 'lose' ? -3 : 2 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.18 }}
            >
              {titleMap[result]}
            </motion.div>

            {reasonLabel && (
              <motion.p
                className="mp-end__reason"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                {reasonLabel}
              </motion.p>
            )}

            {/* 1. Current round — big + full breakdown */}
            {scoreboard && (
              <motion.section
                className="mp-end__section"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 }}
              >
                <div className="mp-end__round">
                  <RoundColumn
                    name={playerName}
                    accent="me"
                    hot={result !== 'tie' && myPts >= oppPts}
                    side={scoreboard.player}
                    cards={gameState.playerCollected}
                  />
                  <div className="mp-end__vs" aria-hidden="true">
                    <span>VS</span>
                  </div>
                  <RoundColumn
                    name={opponentName}
                    accent="opp"
                    hot={result !== 'tie' && oppPts > myPts}
                    side={scoreboard.opponent}
                    cards={gameState.opponentCollected}
                  />
                </div>
              </motion.section>
            )}

            <motion.section
              className="mp-end__section mp-end__section--room"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <div className="mp-end__room">
                <span className="mp-end__room-name">{playerName}</span>
                <span className="mp-end__room-score">
                  {games.player}
                  <span className="mp-end__room-sep">–</span>
                  {games.opponent}
                </span>
                <span className="mp-end__room-name">{opponentName}</span>
              </div>
              <p className="mp-end__room-hint">Oda skoru</p>
            </motion.section>

            <motion.section
              className="mp-end__section mp-end__section--life"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="mp-end__life">
                <span>
                  {playerName} <strong>{rivalry?.wins ?? '—'}</strong>
                </span>
                <span className="mp-end__life-sep">·</span>
                <span>
                  Berabere <strong>{rivalry?.ties ?? '—'}</strong>
                </span>
                <span className="mp-end__life-sep">·</span>
                <span>
                  {opponentName} <strong>{rivalry?.losses ?? '—'}</strong>
                </span>
              </div>
              <p className="mp-end__room-hint">Aranızdaki skor</p>
            </motion.section>

            <motion.div
              className="mp-end__actions"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 }}
            >
              <button
                type="button"
                className={`mp-end__rematch${rematchDisabled ? ' mp-end__rematch--waiting' : ''}${
                  !isForfeit && opponentWantsRematch && !localWantsRematch ? ' mp-end__rematch--nudge' : ''
                }`}
                onClick={onRematch}
                disabled={rematchDisabled}
              >
                <span className="mp-end__rematch-glow" aria-hidden="true" />
                {rematchLabel}
              </button>
              <button type="button" className="mp-end__leave" onClick={onLeave}>
                Masadan kalk
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
