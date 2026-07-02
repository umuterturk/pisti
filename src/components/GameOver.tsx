import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Scoreboard, SideScore } from '../game/rules'
import type { MatchScore } from '../game/useGame'

interface GameOverProps {
  scoreboard: Scoreboard
  games: MatchScore
  playerName: string
  opponentName: string
  onNewGame: () => void
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.45 } },
}

const lineVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0 },
}

// Counts up from 0 to `value` with an ease-out curve for a game-like tally.
function CountUp({ value, duration = 1 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000))
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(value * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{display}</>
}

function ScoreColumn({
  label,
  side,
  isWinner,
  accent,
}: {
  label: string
  side: SideScore
  isWinner: boolean
  accent: 'me' | 'foe'
}) {
  return (
    <div className={`game-over__col game-over__col--${accent}${isWinner ? ' game-over__col--winner' : ''}`}>
      <div className="game-over__crown">{isWinner ? '👑' : ''}</div>
      <div className="game-over__name">{label}</div>
      <div className="game-over__total">
        <CountUp value={side.total} />
      </div>
      <motion.ul
        className="game-over__lines"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        <motion.li variants={lineVariants}>
          <span>Kartlar</span>
          <span>{side.cardPoints}</span>
        </motion.li>
        <motion.li variants={lineVariants}>
          <span>Çoğunluk</span>
          <span>{side.majorityBonus}</span>
        </motion.li>
        <motion.li variants={lineVariants}>
          <span>
            Pişti ×{side.pistiCount}
            {side.doublePistiCount > 0 ? ` · Çift ×${side.doublePistiCount}` : ''}
          </span>
          <span>{side.pistiPoints}</span>
        </motion.li>
        <motion.li className="game-over__lines-sub" variants={lineVariants}>
          <span>Toplanan kart</span>
          <span>{side.cardCount}</span>
        </motion.li>
      </motion.ul>
    </div>
  )
}

const CONFETTI_COLORS = ['#ffd54f', '#ff8a1f', '#7be7a0', '#66d3ff', '#ff5db1', '#ffffff']

function Confetti() {
  return (
    <div className="game-over__confetti" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => {
        const left = (i / 26) * 100 + (i % 3) * 4
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const delay = (i % 7) * 0.12
        const drift = (i % 2 === 0 ? 1 : -1) * (20 + (i % 5) * 14)
        return (
          <motion.span
            key={i}
            className="game-over__confetti-piece"
            style={{ left: `${left}%`, background: color }}
            initial={{ y: -40, x: 0, rotate: 0, opacity: 0 }}
            animate={{
              y: ['-8vh', '96vh'],
              x: [0, drift, 0],
              rotate: [0, 360 + (i % 4) * 120],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 2.4 + (i % 5) * 0.35,
              delay,
              ease: 'easeIn',
              times: [0, 0.1, 0.85, 1],
            }}
          />
        )
      })}
    </div>
  )
}

export function GameOver({
  scoreboard,
  games,
  playerName,
  opponentName,
  onNewGame,
}: GameOverProps) {
  const result =
    scoreboard.winner === 'tie'
      ? 'tie'
      : scoreboard.winner === 'player'
        ? 'win'
        : 'lose'

  const { title, icon } =
    result === 'tie'
      ? { title: 'Berabere!', icon: '🤝' }
      : result === 'win'
        ? { title: 'Kazandın!', icon: '🏆' }
        : { title: 'Kaybettin', icon: '💔' }

  return (
    <motion.div
      className={`game-over game-over--${result}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {result === 'win' && <Confetti />}

      <motion.div
        className={`game-over__panel game-over__panel--${result}`}
        initial={{ scale: 0.8, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
        <motion.div
          className="game-over__icon"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: [0, 1.35, 1], rotate: [-30, 8, 0] }}
          transition={{ delay: 0.15, duration: 0.6, times: [0, 0.6, 1], ease: 'easeOut' }}
        >
          {icon}
        </motion.div>

        <motion.div
          className="game-over__title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
        >
          {title}
        </motion.div>

        <motion.div
          className="game-over__match"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.36 }}
        >
          <span className="game-over__match-name">{playerName}</span>
          <span className="game-over__match-score">
            {games.player} <span className="game-over__match-sep">–</span> {games.opponent}
          </span>
          <span className="game-over__match-name">{opponentName}</span>
        </motion.div>

        <div className="game-over__scores">
          <ScoreColumn
            label={playerName}
            side={scoreboard.player}
            isWinner={result === 'win'}
            accent="me"
          />
          <div className="game-over__vs">VS</div>
          <ScoreColumn
            label={opponentName}
            side={scoreboard.opponent}
            isWinner={result === 'lose'}
            accent="foe"
          />
        </div>

        <motion.button
          className="game-over__btn"
          onClick={onNewGame}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          whileTap={{ scale: 0.97 }}
        >
          Sonraki El
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
