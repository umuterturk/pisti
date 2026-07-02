import { motion } from 'framer-motion'
import { SUIT_COLOR, SUIT_SYMBOL, type Card as CardType } from '../game/cards'
import { CARD_HEIGHT, CARD_WIDTH } from '../motion/params'

interface CardProps {
  card?: CardType
  faceDown?: boolean
  width?: number
  height?: number
  style?: React.CSSProperties
  className?: string
}

export function Card({
  card,
  faceDown = false,
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  style,
  className = '',
}: CardProps) {
  const radius = Math.round(width * 0.13)
  const pad = Math.round(width * 0.09)
  const rankFont = Math.round(height * 0.15)
  const cornerSuitFont = Math.round(rankFont * 0.82)
  const suitFont = Math.round(width * 0.46)

  if (faceDown || !card) {
    return (
      <motion.div
        className={`card card--back ${className}`}
        style={{ width, height, borderRadius: radius, ...style }}
      >
        <div className="card__back-pattern" />
      </motion.div>
    )
  }

  const color = SUIT_COLOR[card.suit]
  const symbol = SUIT_SYMBOL[card.suit]

  return (
    <motion.div
      className={`card card--face ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
    >
      <span
        className="card__index card__index--tl"
        style={{ color, top: pad, left: pad + 1 }}
      >
        <span className="card__rank" style={{ fontSize: rankFont }}>
          {card.rank}
        </span>
        <span className="card__index-suit" style={{ fontSize: cornerSuitFont }}>
          {symbol}
        </span>
      </span>
      <span
        className="card__suit card__suit--center"
        style={{ color, fontSize: suitFont }}
      >
        {symbol}
      </span>
      <span
        className="card__index card__index--br"
        style={{ color, bottom: pad, right: pad + 1 }}
      >
        <span className="card__rank" style={{ fontSize: rankFont }}>
          {card.rank}
        </span>
        <span className="card__index-suit" style={{ fontSize: cornerSuitFont }}>
          {symbol}
        </span>
      </span>
    </motion.div>
  )
}
