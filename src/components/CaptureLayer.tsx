import { AnimatePresence, motion } from 'framer-motion'
import { CARD_HEIGHT, CARD_WIDTH, TIMING } from '../motion/params'
import type { Card as CardType } from '../game/cards'
import { Card } from './Card'
import { scatterFor, type PileVisuals } from './TablePile'

export interface CaptureState {
  id: string
  cards: CardType[]
  winner: 'player' | 'opponent'
  pisti: boolean
  originX: number
  originY: number
}

interface CaptureLayerProps {
  capture: CaptureState | null
  visuals?: PileVisuals
}

// Purely visual. Progression after a capture is owned by the parent timer.
// The whole captured pile is rendered at its real table positions and then
// flies to the winner as a single group, so every card moves together.
export function CaptureLayer({ capture, visuals }: CaptureLayerProps) {
  return (
    <AnimatePresence>
      {capture && (
        <motion.div
          key={capture.id}
          className="capture-layer"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`capture-layer__group capture-layer__group--${capture.winner}`}
            style={{
              position: 'fixed',
              left: capture.originX,
              top: capture.originY,
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: 0,
              y: capture.winner === 'player' ? 260 : -260,
              scale: 0.5,
              opacity: 0,
            }}
            transition={{
              delay: TIMING.capturePause,
              duration: TIMING.captureMove,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {capture.cards.map((card, index) => {
              const placement = visuals?.[card.id] ?? scatterFor(card)
              // The played card (last one) stays face-down when it made a pişti.
              const faceDown = capture.pisti && index === capture.cards.length - 1
              return (
                <div
                  key={card.id}
                  className="capture-layer__card"
                  style={{
                    position: 'absolute',
                    left: -CARD_WIDTH / 2,
                    top: -CARD_HEIGHT / 2,
                    transform: `translate(${placement.offsetX}px, ${placement.offsetY}px) rotate(${placement.rotation}deg)`,
                  }}
                >
                  <Card card={faceDown ? undefined : card} faceDown={faceDown} />
                </div>
              )
            })}
          </motion.div>

          {capture.pisti && (
            <>
              <motion.div
                className="capture-layer__flash"
                style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
                initial={{ scale: 0, opacity: 0.85 }}
                animate={{ scale: 7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: TIMING.capturePause, duration: 0.7, ease: 'easeOut' }}
              />
              <motion.div
                className="capture-layer__pisti"
                style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
                initial={{ scale: 0.2, opacity: 0, rotate: -14 }}
                animate={{
                  scale: [0.2, 1.55, 0.9, 1.12, 1],
                  opacity: [0, 1, 1, 1, 1],
                  rotate: [-14, 9, -5, 3, 0],
                }}
                exit={{ opacity: 0, scale: 1.7 }}
                transition={{
                  delay: TIMING.capturePause,
                  duration: 0.75,
                  ease: 'easeOut',
                  times: [0, 0.28, 0.52, 0.78, 1],
                }}
              >
                Pişti!
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
