import {
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from 'framer-motion'
import { useEffect, useRef } from 'react'
import type { Card as CardType } from '../game/cards'
import { classifyRelease } from '../motion/gesture'
import { type HandSlot } from '../motion/handLayout'
import { HAND_CARD_HEIGHT, HAND_CARD_WIDTH, SPRING, TIMING, TOUCH } from '../motion/params'
import { Card } from './Card'

export interface DealOrigin {
  x: number
  y: number
  rotate: number
}

interface HandCardProps {
  card: CardType
  slot: HandSlot
  disabled?: boolean
  dealOrigin?: DealOrigin
  dealDelay?: number
  onActiveChange: (cardId: string | null) => void
  onDragMove: (cardId: string, dragX: number) => void
  onReorderCommit: (cardId: string) => void
  onThrow: (card: CardType, info: PanInfo, element: HTMLElement) => void
}

export function HandCard({
  card,
  slot,
  disabled = false,
  dealOrigin,
  dealDelay = 0,
  onActiveChange,
  onDragMove,
  onReorderCommit,
  onThrow,
}: HandCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  // New cards start at the deck origin and fly into their slot; existing cards
  // (which never remount) initialise directly at their slot.
  const x = useMotionValue(dealOrigin ? dealOrigin.x : slot.x)
  const y = useMotionValue(dealOrigin ? dealOrigin.y : slot.y)
  const rotate = useMotionValue(dealOrigin ? dealOrigin.rotate : slot.rotate)
  const isDragging = useRef(false)
  const firstFollow = useRef(true)

  // Deal-in animation, runs once on mount.
  useEffect(() => {
    if (!dealOrigin) return
    const enter = { type: 'spring' as const, stiffness: 340, damping: 30, delay: dealDelay }
    animate(x, slot.x, enter)
    animate(y, slot.y, enter)
    animate(rotate, slot.rotate, enter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Skip the first run so it does not fight the deal-in animation.
    if (firstFollow.current) {
      firstFollow.current = false
      return
    }
    if (!isDragging.current) {
      animate(x, slot.x, SPRING.hand)
      animate(y, slot.y, SPRING.hand)
      animate(rotate, slot.rotate, SPRING.hand)
    }
  }, [slot.x, slot.y, slot.rotate, x, y, rotate])

  const handleDragStart = () => {
    if (disabled) return
    isDragging.current = true
    onActiveChange(card.id)
  }

  const handleDrag = (_: unknown, info: PanInfo) => {
    if (disabled) return
    onDragMove(card.id, slot.x + info.offset.x)
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (disabled) return
    isDragging.current = false
    onActiveChange(null)

    const gesture = classifyRelease(info.offset, info.velocity)

    if (gesture === 'THROW' && ref.current) {
      onThrow(card, info, ref.current)
      return
    }

    if (gesture === 'REORDER') {
      onReorderCommit(card.id)
    }

    animate(x, slot.x, { ...SPRING.snapBack, duration: TIMING.snapBack })
    animate(y, slot.y, { ...SPRING.snapBack, duration: TIMING.snapBack })
    animate(rotate, slot.rotate, { ...SPRING.snapBack, duration: TIMING.snapBack })
  }

  return (
    <motion.div
      ref={ref}
      className="hand-card"
      drag={!disabled}
      dragElastic={0.14}
      dragMomentum={false}
      style={{
        x,
        y,
        rotate,
        zIndex: slot.zIndex,
        position: 'absolute',
        top: 0,
        left: 0,
        touchAction: 'none',
      }}
      whileTap={
        disabled
          ? undefined
          : {
              scale: TOUCH.scale,
              transition: { duration: 0.1 },
            }
      }
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <Card card={card} width={HAND_CARD_WIDTH} height={HAND_CARD_HEIGHT} />
    </motion.div>
  )
}
