import { animate, motion, useMotionValue } from 'framer-motion'
import { useLayoutEffect, useMemo, useRef, memo, type RefObject } from 'react'
import { Card } from './Card'
import {
  OPP_CARD_HEIGHT,
  OPP_CARD_WIDTH,
  OPP_VISIBLE_RATIO,
} from '../motion/params'

interface OpponentAreaProps {
  handCount: number
  dealFromRef?: RefObject<HTMLDivElement | null>
  /**
   * When set, the card at this index appears instantly (no HUD deal-in).
   * Used after a pisti4 draw flight has already delivered the card visually.
   */
  skipDealInIndex?: number | null
}

// A single face-down opponent card that flies in from the centre HUD.
const OpponentCard = memo(function OpponentCard({
  index,
  dealFromRef,
  skipDealIn,
}: {
  index: number
  dealFromRef?: RefObject<HTMLDivElement | null>
  skipDealIn?: boolean
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
})

// Opponent's hand: bigger backs, fanned and cropped at the top edge. New cards
// are dealt in from the centre HUD (batch deals) unless skipDealInIndex says otherwise.
// Slot ids prepend on growth so pisti4 draws sit leftmost (matching the player hand).
function OpponentAreaComponent({ handCount, dealFromRef, skipDealInIndex = null }: OpponentAreaProps) {
  const overlap = OPP_CARD_WIDTH * 0.46
  const totalWidth = OPP_CARD_WIDTH + overlap * Math.max(0, handCount - 1)
  const visibleHeight = Math.round(OPP_CARD_HEIGHT * OPP_VISIBLE_RATIO)

  const handStyle = useMemo(() => ({ width: totalWidth, height: visibleHeight }), [totalWidth, visibleHeight])

  const idsRef = useRef<number[]>([])
  const nextIdRef = useRef(0)
  const slotIds = useMemo(() => {
    let ids = idsRef.current
    if (ids.length < handCount) {
      const added = Array.from({ length: handCount - ids.length }, () => nextIdRef.current++)
      ids = [...added, ...ids]
    } else if (ids.length > handCount) {
      // Drop from the left (newest) so the throw origin (first DOM card) matches.
      ids = ids.slice(ids.length - handCount)
    }
    idsRef.current = ids
    return ids
  }, [handCount])

  const cards = useMemo(
    () =>
      slotIds.map((id, i) => ({
        id,
        index: i,
        style: {
          left: i * overlap,
          transform: `rotate(${5 - (i / Math.max(1, handCount - 1)) * 10}deg)`,
          zIndex: handCount - 1 - i,
        },
      })),
    [slotIds, handCount, overlap],
  )

  return (
    <div className="opponent-area">
      <div className="opponent-area__hand" style={handStyle}>
        {cards.map(({ id, index, style }) => (
          <div key={id} className="opponent-area__card" style={style}>
            <OpponentCard
              index={index}
              dealFromRef={dealFromRef}
              skipDealIn={skipDealInIndex === index}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const OpponentArea = memo(OpponentAreaComponent)
