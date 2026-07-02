import { AnimatePresence, motion } from 'framer-motion'

export interface ScorePop {
  id: string
  amount: number
  winner: 'player' | 'opponent'
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface ScorePopLayerProps {
  pop: ScorePop | null
}

// A "+N" score popup that spawns over the captured pile and floats toward the
// winner's score in the HUD, fading out as it arrives.
export function ScorePopLayer({ pop }: ScorePopLayerProps) {
  return (
    <AnimatePresence>
      {pop && (
        <div
          key={pop.id}
          className="score-pop__anchor"
          style={{ position: 'fixed', left: pop.fromX, top: pop.fromY }}
        >
          <motion.div
            className={`score-pop score-pop--${pop.winner}`}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
            animate={{
              x: [0, 0, pop.toX - pop.fromX],
              y: [0, -28, pop.toY - pop.fromY],
              scale: [0.3, 1.25, 0.7],
              opacity: [0, 1, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.15,
              ease: [0.22, 1, 0.36, 1],
              times: [0, 0.28, 1],
            }}
          >
            +{pop.amount}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
