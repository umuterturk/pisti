import { motion } from 'framer-motion'
import { Card } from './Card'
import {
  OPP_CARD_HEIGHT,
  OPP_CARD_WIDTH,
  OPP_VISIBLE_RATIO,
} from '../motion/params'

interface OpponentAreaProps {
  handCount: number
}

// Opponent's hand: bigger backs, only the top half visible (clipped), fanned
// and dealt in from above.
export function OpponentArea({ handCount }: OpponentAreaProps) {
  const overlap = OPP_CARD_WIDTH * 0.46
  const totalWidth = OPP_CARD_WIDTH + overlap * Math.max(0, handCount - 1)
  const visibleHeight = Math.round(OPP_CARD_HEIGHT * OPP_VISIBLE_RATIO)

  return (
    <div className="opponent-area">
      <div
        className="opponent-area__hand"
        style={{ width: totalWidth, height: visibleHeight }}
      >
        {Array.from({ length: handCount }, (_, i) => (
          <motion.div
            key={i}
            className="opponent-area__card"
            style={{
              rotate: -5 + (i / Math.max(1, handCount - 1)) * 10,
              zIndex: i,
            }}
            initial={false}
            animate={{ left: i * overlap }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <motion.div
              initial={{ y: -260, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30, delay: i * 0.08 }}
            >
              <Card faceDown width={OPP_CARD_WIDTH} height={OPP_CARD_HEIGHT} />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
