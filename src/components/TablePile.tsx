import { forwardRef, useLayoutEffect, useRef, type RefObject } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
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

// A single table card. Cards placed by a play already have a recorded visual and
// simply appear at their landing spot; the initial table cards (dealt at the
// start of a hand, no recorded visual) fly in from the centre HUD.
function TableCard({
  card,
  placement,
  zIndex,
  dealIn,
  dealFromRef,
  dealDelay,
}: {
  card: CardType
  placement: PileCardVisual
  zIndex: number
  dealIn: boolean
  dealFromRef?: RefObject<HTMLDivElement | null>
  dealDelay: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(placement.offsetX)
  const y = useMotionValue(placement.offsetY)
  const rotate = useMotionValue(placement.rotation)
  const opacity = useMotionValue(dealIn ? 0 : 1)
  const didDeal = useRef(false)

  useLayoutEffect(() => {
    if (didDeal.current) return
    didDeal.current = true
    if (!dealIn) return
    const hudEl = dealFromRef?.current
    const el = ref.current
    if (!hudEl || !el) {
      opacity.set(1)
      return
    }
    const hud = hudEl.getBoundingClientRect()
    const cardRect = el.getBoundingClientRect() // currently at its placement
    const originScreenX = hud.left + hud.width / 2 - CARD_WIDTH / 2
    const originScreenY = hud.top + hud.height / 2 - CARD_HEIGHT / 2
    const originX = placement.offsetX + (originScreenX - cardRect.left)
    const originY = placement.offsetY + (originScreenY - cardRect.top)
    x.set(originX)
    y.set(originY)
    rotate.set(0)
    opacity.set(1)
    // Write the origin synchronously so the first painted frame is at the HUD
    // (Framer flushes motion-value changes only on the next animation frame).
    el.style.transform = `translate3d(${originX}px, ${originY}px, 0)`
    el.style.opacity = '1'
    const enter = { type: 'spring' as const, stiffness: 340, damping: 30, delay: dealDelay }
    animate(x, placement.offsetX, enter)
    animate(y, placement.offsetY, enter)
    animate(rotate, placement.rotation, enter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      ref={ref}
      className="table-pile__card"
      style={{
        x,
        y,
        rotate,
        opacity,
        zIndex,
        position: 'absolute',
        left: '50%',
        top: '50%',
        marginLeft: -CARD_WIDTH / 2,
        marginTop: -CARD_HEIGHT / 2,
      }}
    >
      <Card card={card} />
    </motion.div>
  )
}

interface TablePileProps {
  cards: CardType[]
  visuals?: PileVisuals
  highlight?: boolean
  dealFromRef?: RefObject<HTMLDivElement | null>
  /** While a capture animation is playing, the pile is drawn by CaptureLayer
   * instead, so we hide the real cards here to avoid a duplicate ghost image. */
  capturing?: boolean
}

export const TablePile = forwardRef<HTMLDivElement, TablePileProps>(
  function TablePile({ cards, visuals, highlight = false, dealFromRef, capturing = false }, ref) {
    const shown = capturing ? [] : cards
    // Index among the freshly-dealt (no recorded visual) cards, for stagger.
    let dealIndex = 0
    return (
      <div className={`table-pile ${highlight ? 'table-pile--highlight' : ''}`} ref={ref}>
        <div className="table-pile__stack">
          {!capturing && cards.length === 0 && <div className="table-pile__empty">Oyna</div>}
          {shown.map((card, globalIndex) => {
            // Each card keeps a stable position for its whole life on the table:
            // its recorded landing if it flew in, otherwise a seeded scatter.
            // This never depends on pile size, so adding a card cannot move or
            // rotate the cards already down.
            const recorded = visuals?.[card.id]
            const placement = recorded ?? scatterFor(card)
            const dealIn = !recorded
            const dealDelay = dealIn ? dealIndex++ * 0.08 : 0

            return (
              <TableCard
                key={card.id}
                card={card}
                placement={placement}
                zIndex={globalIndex + 1}
                dealIn={dealIn}
                dealFromRef={dealFromRef}
                dealDelay={dealDelay}
              />
            )
          })}
        </div>
      </div>
    )
  },
)
