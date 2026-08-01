import { animate, motion, useMotionValue } from 'framer-motion'
import { useLayoutEffect, useMemo, useRef, memo, type CSSProperties, type RefObject } from 'react'
import { Card } from './Card'
import {
  OPP_CARD_HEIGHT,
  OPP_CARD_WIDTH,
  OPP_VISIBLE_RATIO,
} from '../motion/params'

export type OpponentOrientation = 'top' | 'left' | 'right'

interface OpponentAreaProps {
  handCount: number
  dealFromRef?: RefObject<HTMLDivElement | null>
  /**
   * When set, the card at this index appears instantly (no HUD deal-in).
   * Used after a pisti4 draw flight has already delivered the card visually.
   */
  skipDealInIndex?: number | null
  cardWidth?: number
  cardHeight?: number
  visibleRatio?: number
  orientation?: OpponentOrientation
}

// A single face-down opponent card that flies in from the centre HUD.
const OpponentCard = memo(function OpponentCard({
  index,
  dealFromRef,
  skipDealIn,
  cardWidth,
  cardHeight,
}: {
  index: number
  dealFromRef?: RefObject<HTMLDivElement | null>
  skipDealIn?: boolean
  cardWidth: number
  cardHeight: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const opacity = useMotionValue(0)

  useLayoutEffect(() => {
    if (skipDealIn) {
      opacity.set(1)
      return
    }
    const hudEl = dealFromRef?.current
    const el = ref.current
    if (!hudEl || !el) {
      opacity.set(1)
      return
    }
    const hud = hudEl.getBoundingClientRect()
    const rect = el.getBoundingClientRect() // currently at rest
    const originX = hud.left + hud.width / 2 - cardWidth / 2
    const originY = hud.top + hud.height / 2 - cardHeight / 2
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
      <Card faceDown width={cardWidth} height={cardHeight} />
    </motion.div>
  )
})

// Opponent's hand: fanned and cropped toward the table edge. Side seats reuse
// the top fan layout, then rotate the whole hand ±90° so cards lie on their side.
function OpponentAreaComponent({
  handCount,
  dealFromRef,
  skipDealInIndex = null,
  cardWidth = OPP_CARD_WIDTH,
  cardHeight = OPP_CARD_HEIGHT,
  visibleRatio = OPP_VISIBLE_RATIO,
  orientation = 'top',
}: OpponentAreaProps) {
  const overlap = cardWidth * 0.46
  const isSide = orientation === 'left' || orientation === 'right'

  const fanWidth = cardWidth + overlap * Math.max(0, handCount - 1)
  const fanHeight = Math.round(cardHeight * visibleRatio)

  // After ±90° rotation, layout box swaps axes. Size the rotator to the
  // visible peek strip and pin it flush to the outer screen edge.
  const rotatorStyle = useMemo((): CSSProperties | undefined => {
    if (!isSide) return undefined
    return {
      width: fanHeight,
      height: fanWidth,
      position: 'relative',
    }
  }, [isSide, fanHeight, fanWidth])

  const handStyle = useMemo((): CSSProperties => {
    if (!isSide) {
      return { width: fanWidth, height: fanHeight }
    }
    // Sit in the rotator; CSS rotates and pins the outer edge to the screen.
    return {
      width: fanWidth,
      height: fanHeight,
      position: 'absolute',
      left: '50%',
      top: '50%',
      marginLeft: -fanWidth / 2,
      marginTop: -fanHeight / 2,
    }
  }, [isSide, fanWidth, fanHeight])

  const idsRef = useRef<number[]>([])
  const nextIdRef = useRef(0)
  const slotIds = useMemo(() => {
    let ids = idsRef.current
    if (ids.length < handCount) {
      const added = Array.from({ length: handCount - ids.length }, () => nextIdRef.current++)
      ids = [...added, ...ids]
    } else if (ids.length > handCount) {
      ids = ids.slice(ids.length - handCount)
    }
    idsRef.current = ids
    return ids
  }, [handCount])

  const cards = useMemo(
    () =>
      slotIds.map((id, i) => {
        const fan = 5 - (i / Math.max(1, handCount - 1)) * 10
        return {
          id,
          index: i,
          style: {
            left: i * overlap,
            transform: `rotate(${fan}deg)`,
            zIndex: handCount - 1 - i,
          } satisfies CSSProperties,
        }
      }),
    [slotIds, handCount, overlap],
  )

  const hand = (
    <div className="opponent-area__hand" style={handStyle}>
      {cards.map(({ id, index, style }) => (
        <div key={id} className="opponent-area__card" style={style}>
          <OpponentCard
            index={index}
            dealFromRef={dealFromRef}
            skipDealIn={skipDealInIndex === index}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        </div>
      ))}
    </div>
  )

  return (
    <div className={`opponent-area opponent-area--${orientation}`}>
      {isSide ? (
        <div className="opponent-area__rotator" style={rotatorStyle}>
          {hand}
        </div>
      ) : (
        hand
      )}
    </div>
  )
}

export const OpponentArea = memo(OpponentAreaComponent)
