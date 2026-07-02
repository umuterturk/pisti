import { animate, motion, useMotionValue } from 'framer-motion'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Card } from './Card'
import {
  OPP_CARD_HEIGHT,
  OPP_CARD_WIDTH,
  OPP_VISIBLE_RATIO,
} from '../motion/params'

interface OpponentAreaProps {
  handCount: number
  dealFromRef?: RefObject<HTMLDivElement | null>
}

// A single face-down opponent card that flies in from the centre HUD.
function OpponentCard({
  index,
  dealFromRef,
}: {
  index: number
  dealFromRef?: RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const opacity = useMotionValue(0)

  useLayoutEffect(() => {
    const hudEl = dealFromRef?.current
    const el = ref.current
    if (!hudEl || !el) {
      opacity.set(1)
      return
    }
    const hud = hudEl.getBoundingClientRect()
    const rect = el.getBoundingClientRect() // currently at rest
    const originX = hud.left + hud.width / 2 - OPP_CARD_WIDTH / 2
    const originY = hud.top + hud.height / 2 - OPP_CARD_HEIGHT / 2
    x.set(originX - rect.left)
    y.set(originY - rect.top)
    opacity.set(1)
    const enter = { type: 'spring' as const, stiffness: 340, damping: 30, delay: index * 0.08 }
    animate(x, 0, enter)
    animate(y, 0, enter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div ref={ref} style={{ x, y, opacity }}>
      <Card faceDown width={OPP_CARD_WIDTH} height={OPP_CARD_HEIGHT} />
    </motion.div>
  )
}

// Opponent's hand: bigger backs, fanned and cropped at the top edge. New cards
// are dealt in from the centre HUD.
export function OpponentArea({ handCount, dealFromRef }: OpponentAreaProps) {
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
          <div
            key={i}
            className="opponent-area__card"
            style={{
              left: i * overlap,
              transform: `rotate(${-5 + (i / Math.max(1, handCount - 1)) * 10}deg)`,
              zIndex: i,
            }}
          >
            <OpponentCard index={i} dealFromRef={dealFromRef} />
          </div>
        ))}
      </div>
    </div>
  )
}
