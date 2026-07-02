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
  doublePisti: boolean
  pistiStreak: number
  originX: number
  originY: number
}

// Escalating combo adjective for back-to-back piştis. 4+ tops out at "İmkansız!".
function streakLabel(streak: number): string | null {
  if (streak >= 4) return 'İMKANSIZ!'
  if (streak === 3) return 'İNANILMAZ!'
  if (streak === 2) return 'HARİKA!'
  return null
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
                className={`capture-layer__flash${capture.doublePisti ? ' capture-layer__flash--double' : ''}`}
                style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
                initial={{ scale: 0, opacity: capture.doublePisti ? 0.95 : 0.85 }}
                animate={{ scale: capture.doublePisti ? 11 : 7, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  delay: TIMING.capturePause,
                  duration: capture.doublePisti ? 0.9 : 0.7,
                  ease: 'easeOut',
                }}
              />
              {capture.doublePisti && (
                <>
                  <motion.div
                    className="capture-layer__flash capture-layer__flash--double"
                    style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
                    initial={{ scale: 0, opacity: 0.7 }}
                    animate={{ scale: 14, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: TIMING.capturePause + 0.14, duration: 0.9, ease: 'easeOut' }}
                  />
                  {Array.from({ length: 14 }, (_, i) => {
                    const angle = (i / 14) * Math.PI * 2
                    const dist = 150 + (i % 3) * 40
                    return (
                      <motion.div
                        key={i}
                        className="capture-layer__spark"
                        style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                        animate={{
                          x: Math.cos(angle) * dist,
                          y: Math.sin(angle) * dist,
                          scale: [0, 1.2, 0],
                          opacity: [0, 1, 0],
                        }}
                        transition={{
                          delay: TIMING.capturePause + 0.08,
                          duration: 0.85,
                          ease: 'easeOut',
                        }}
                      />
                    )
                  })}
                </>
              )}
              {streakLabel(capture.pistiStreak) && (
                <div
                  className="capture-layer__anchor"
                  style={{ position: 'fixed', left: capture.originX, top: capture.originY - 58 }}
                >
                  <motion.div
                    className={`capture-layer__combo capture-layer__combo--${
                      capture.pistiStreak >= 4 ? 'max' : capture.pistiStreak
                    }`}
                    initial={{ scale: 0.3, opacity: 0, y: -10 }}
                    animate={{
                      scale: [0.3, 1.35, 1],
                      opacity: [0, 1, 1],
                      y: [-10, 0, 0],
                    }}
                    exit={{ opacity: 0, y: -14 }}
                    transition={{
                      delay: TIMING.capturePause + 0.12,
                      duration: 0.6,
                      ease: 'easeOut',
                      times: [0, 0.5, 1],
                    }}
                  >
                    {streakLabel(capture.pistiStreak)}
                    <span className="capture-layer__combo-count">×{capture.pistiStreak}</span>
                  </motion.div>
                </div>
              )}
              <div
                className="capture-layer__anchor"
                style={{ position: 'fixed', left: capture.originX, top: capture.originY }}
              >
              <motion.div
                className={`capture-layer__pisti${capture.doublePisti ? ' capture-layer__pisti--double' : ''}`}
                initial={{ scale: 0.2, opacity: 0, rotate: -14 }}
                animate={{
                  scale: capture.doublePisti
                    ? [0.2, 1.9, 1.05, 1.28, 1.15]
                    : [0.2, 1.55, 0.9, 1.12, 1],
                  opacity: [0, 1, 1, 1, 1],
                  rotate: capture.doublePisti ? [-18, 11, -6, 4, 0] : [-14, 9, -5, 3, 0],
                }}
                exit={{ opacity: 0, scale: 1.7 }}
                transition={{
                  delay: TIMING.capturePause,
                  duration: capture.doublePisti ? 0.95 : 0.75,
                  ease: 'easeOut',
                  times: [0, 0.28, 0.52, 0.78, 1],
                }}
              >
                {capture.doublePisti ? (
                  <>
                    <span className="capture-layer__pisti-main">Çift Pişti!</span>
                    <span className="capture-layer__pisti-sub">Jandan jana · +20</span>
                  </>
                ) : (
                  'Pişti!'
                )}
              </motion.div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
