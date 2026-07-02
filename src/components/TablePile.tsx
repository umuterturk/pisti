import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import type { Card as CardType } from '../game/cards'
import { CARD_HEIGHT, CARD_WIDTH, LANDING } from '../motion/params'
import { Card } from './Card'

function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 1000) / 1000
}

export function scatterFor(card: CardType) {
  const rx = seededRandom(card.id + 'x') * 2 - 1
  const ry = seededRandom(card.id + 'y') * 2 - 1
  const rr = seededRandom(card.id + 'r') * 2 - 1
  return {
    offsetX: rx * LANDING.offsetX,
    offsetY: ry * LANDING.offsetY,
    rotation: rr * LANDING.rotation,
  }
}

export interface PileCardVisual {
  offsetX: number
  offsetY: number
  rotation: number
}

export type PileVisuals = Record<string, PileCardVisual>

interface TablePileProps {
  cards: CardType[]
  visuals?: PileVisuals
  highlight?: boolean
  /** While a capture animation is playing, the pile is drawn by CaptureLayer
   * instead, so we hide the real cards here to avoid a duplicate ghost image. */
  capturing?: boolean
}

export const TablePile = forwardRef<HTMLDivElement, TablePileProps>(
  function TablePile({ cards, visuals, highlight = false, capturing = false }, ref) {
    const shown = capturing ? [] : cards
    return (
      <div className={`table-pile ${highlight ? 'table-pile--highlight' : ''}`} ref={ref}>
        <div className="table-pile__stack">
          {!capturing && cards.length === 0 && <div className="table-pile__empty">Oyna</div>}
          {shown.map((card, globalIndex) => {
            // Each card keeps a stable position for its whole life on the table:
            // its recorded landing if it flew in, otherwise a seeded scatter.
            // This never depends on pile size, so adding a card cannot move or
            // rotate the cards already down.
            const placement = visuals?.[card.id] ?? scatterFor(card)

            return (
              <motion.div
                key={card.id}
                className="table-pile__card"
                style={{
                  zIndex: globalIndex + 1,
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  marginLeft: -CARD_WIDTH / 2,
                  marginTop: -CARD_HEIGHT / 2,
                }}
                initial={false}
                animate={{
                  x: placement.offsetX,
                  y: placement.offsetY,
                  rotate: placement.rotation,
                  scale: 1,
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                <Card card={card} />
              </motion.div>
            )
          })}
        </div>
      </div>
    )
  },
)
