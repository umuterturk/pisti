import {
  animate,
  motion,
  useMotionValue,
  type PanInfo,
} from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { Card as CardType } from '../game/cards'
import { classifyRelease } from '../motion/gesture'
import { type HandSlot } from '../motion/handLayout'
import { HAND_CARD_HEIGHT, HAND_CARD_WIDTH, SPRING, TIMING, TOUCH } from '../motion/params'
import { Card } from './Card'

interface HandCardProps {
  card: CardType
  slot: HandSlot
  disabled?: boolean
  /** Element (the centre HUD) the card is dealt from; new cards fly out of it. */
  dealFromRef?: RefObject<HTMLDivElement | null>
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
  dealFromRef,
  dealDelay = 0,
  onActiveChange,
  onDragMove,
  onReorderCommit,
  onThrow,
}: HandCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Cards initialise at their slot; a newly mounted card is then snapped to the
  // deal origin (the centre HUD) and animated back into its slot. They start
  // hidden so the first painted frame (still at the slot, before Framer flushes
  // the new position) does not flash before the deal-in begins.
  const x = useMotionValue(slot.x)
  const y = useMotionValue(slot.y)
  const rotate = useMotionValue(slot.rotate)
  const opacity = useMotionValue(0)
  const isDragging = useRef(false)
  // Guards against StrictMode running the deal-in twice (the second run would
  // re-measure the card at the origin it was just moved to, corrupting it).
  const didDeal = useRef(false)
  // Latest slot, so the deal-in can re-sync if the layout shifts mid-deal.
  const slotRef = useRef(slot)
  slotRef.current = slot
  // True while the staggered deal-in is playing; the slot-follow effect must not
  // interrupt it (e.g. when the hand's ResizeObserver corrects the width).
  const dealingRef = useRef(false)

  // Deal-in animation, runs once on mount. Runs before paint so there is no
  // flash of the card at its slot before it flies in from the HUD.
  useLayoutEffect(() => {
    if (didDeal.current) return
    didDeal.current = true
    const hudEl = dealFromRef?.current
    const el = ref.current
    if (!hudEl || !el) {
      opacity.set(1)
      return
    }
    const hud = hudEl.getBoundingClientRect()
    const cardRect = el.getBoundingClientRect() // currently at slot
    const originScreenX = hud.left + hud.width / 2 - HAND_CARD_WIDTH / 2
    const originScreenY = hud.top + hud.height / 2 - HAND_CARD_HEIGHT / 2
    const originX = slot.x + (originScreenX - cardRect.left)
    const originY = slot.y + (originScreenY - cardRect.top)
    x.set(originX)
    y.set(originY)
    rotate.set(0)
    opacity.set(1)
    // Framer only flushes motion-value changes on the next animation frame, so
    // the first painted frame would otherwise still show the slot position.
    // Write the origin to the DOM synchronously so there is no flash at the slot.
    el.style.transform = `translate3d(${originX}px, ${originY}px, 0)`
    el.style.opacity = '1'
    dealingRef.current = true
    const enter = { type: 'spring' as const, stiffness: 340, damping: 30, delay: dealDelay }
    animate(x, slot.x, enter)
    animate(rotate, slot.rotate, enter)
    animate(y, slot.y, {
      ...enter,
      onComplete: () => {
        dealingRef.current = false
        // Snap to the newest slot in case the layout changed while dealing.
        const s = slotRef.current
        if (!isDragging.current) {
          animate(x, s.x, SPRING.hand)
          animate(y, s.y, SPRING.hand)
          animate(rotate, s.rotate, SPRING.hand)
        }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Do not fight the deal-in animation while it is still playing.
    if (dealingRef.current) return
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
        opacity,
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
