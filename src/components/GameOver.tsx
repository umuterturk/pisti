import { motion } from 'framer-motion'
import type { Scoreboard, SideScore } from '../game/rules'
import type { MatchScore } from '../game/useGame'

interface GameOverProps {
  scoreboard: Scoreboard
  games: MatchScore
  playerName: string
  opponentName: string
  onNewGame: () => void
}

function ScoreRow({ label, side }: { label: string; side: SideScore }) {
  return (
    <div className="game-over__col">
      <div className="game-over__name">{label}</div>
      <div className="game-over__total">{side.total}</div>
      <ul className="game-over__lines">
        <li>
          <span>Kartlar</span>
          <span>{side.cardPoints}</span>
        </li>
        <li>
          <span>Çoğunluk</span>
          <span>{side.majorityBonus}</span>
        </li>
        <li>
          <span>Pişti ×{side.pistiCount}</span>
          <span>{side.pistiPoints}</span>
        </li>
        <li className="game-over__lines-sub">
          <span>Toplanan kart</span>
          <span>{side.cardCount}</span>
        </li>
      </ul>
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
  const title =
    scoreboard.winner === 'tie'
      ? 'Berabere'
      : scoreboard.winner === 'player'
        ? 'Kazandın!'
        : 'Rakip kazandı'

  return (
    <motion.div
      className="game-over"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="game-over__panel"
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      >
        <div className="game-over__title">{title}</div>
        <div className="game-over__match">
          Maç: {playerName} {games.player} – {games.opponent} {opponentName}
        </div>
        <div className="game-over__scores">
          <ScoreRow label={playerName} side={scoreboard.player} />
          <div className="game-over__divider" />
          <ScoreRow label={opponentName} side={scoreboard.opponent} />
        </div>
        <button className="game-over__btn" onClick={onNewGame}>
          Sonraki El
        </button>
      </motion.div>
    </motion.div>
  )
}
