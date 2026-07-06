import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { animate, motion, useMotionValue } from 'framer-motion'
import type { Card as CardType } from '../game/cards'
import { CARD_HEIGHT, CARD_WIDTH, LANDING, SPRING } from '../motion/params'
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

// A double-click "peek": cards scatter much further apart than a normal landing
// spot so ones buried under the pile become visible, then settle back on their
// own after a moment.
const PEEK_SPREAD = { offsetX: 92, offsetY: 72, rotation: 32 } as const
const PEEK_DURATION_MS = 3000

function randomPeekPlacement(): PileCardVisual {
  return {
    offsetX: (Math.random() * 2 - 1) * PEEK_SPREAD.offsetX,
    offsetY: (Math.random() * 2 - 1) * PEEK_SPREAD.offsetY,
    rotation: (Math.random() * 2 - 1) * PEEK_SPREAD.rotation,
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
const TOP_CARD_SCALE = 1.1

function TableCard({
  card,
  placement,
  peekPlacement,
  zIndex,
  dealIn,
  dealFromRef,
  dealDelay,
  highlightRank = false,
  emphasize = false,
}: {
  card: CardType
  placement: PileCardVisual
  peekPlacement?: PileCardVisual | null
  zIndex: number
  dealIn: boolean
  dealFromRef?: RefObject<HTMLDivElement | null>
  dealDelay: number
  highlightRank?: boolean
  emphasize?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(placement.offsetX)
  const y = useMotionValue(placement.offsetY)
  const rotate = useMotionValue(placement.rotation)
  const opacity = useMotionValue(dealIn ? 0 : 1)
  const scale = useMotionValue(emphasize ? TOP_CARD_SCALE : 1)
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

  // As soon as a newer card lands on top, this card stops being emphasized:
  // quickly animate its scale down (and pop the new top card up).
  const didMountScale = useRef(false)
  useEffect(() => {
    if (!didMountScale.current) {
      didMountScale.current = true
      return
    }
    // Decelerating ease-out: shrinks fast at first, then eases into its size.
    animate(scale, emphasize ? TOP_CARD_SCALE : 1, {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1],
    })
  }, [emphasize, scale])

  // A double-click "peek" nudges every card to a widely scattered spot so the
  // player can glimpse ones buried underneath; releasing it settles the card
  // back onto its normal landing spot.
  const didMountPeek = useRef(false)
  useEffect(() => {
    if (!didMountPeek.current) {
      didMountPeek.current = true
      return
    }
    const target = peekPlacement ?? placement
    animate(x, target.offsetX, SPRING.pile)
    animate(y, target.offsetY, SPRING.pile)
    animate(rotate, target.rotation, SPRING.pile)
    // placement is stable for the card's lifetime; only peekPlacement toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekPlacement])

  return (
    <motion.div
      ref={ref}
      className="table-pile__card"
      style={{
        x,
        y,
        rotate,
        opacity,
        scale,
        zIndex,
        position: 'absolute',
        left: '50%',
        top: '50%',
        marginLeft: -CARD_WIDTH / 2,
        marginTop: -CARD_HEIGHT / 2,
      }}
    >
      <Card card={card} highlightRank={highlightRank} />
    </motion.div>
  )
}

interface TablePileProps {
  cards: CardType[]
  visuals?: PileVisuals
  highlight?: boolean
  /** Highlights the rank of the top (capturable) card when the player holds a match. */
  highlightTopRank?: boolean
  /** Shows the "Oyna" prompt only when it's the player's turn to play. */
  showPlayPrompt?: boolean
  dealFromRef?: RefObject<HTMLDivElement | null>
  /** While a capture animation is playing, the pile is drawn by CaptureLayer
   * instead, so we hide the real cards here to avoid a duplicate ghost image. */
  capturing?: boolean
}

export const TablePile = forwardRef<HTMLDivElement, TablePileProps>(
  function TablePile({ cards, visuals, highlight = false, highlightTopRank = false, showPlayPrompt = false, dealFromRef, capturing = false }, ref) {
    const shown = capturing ? [] : cards
    // Index among the freshly-dealt (no recorded visual) cards, for stagger.
    let dealIndex = 0

    const [peekPlacements, setPeekPlacements] = useState<PileVisuals | null>(null)
    const peekTimerRef = useRef<number | null>(null)

    useEffect(() => {
      return () => {
        if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
      }
    }, [])

    const handlePeek = () => {
      if (shown.length < 2) return
      const next: PileVisuals = {}
      for (const card of shown) next[card.id] = randomPeekPlacement()
      setPeekPlacements(next)
      if (peekTimerRef.current !== null) window.clearTimeout(peekTimerRef.current)
      peekTimerRef.current = window.setTimeout(() => {
        peekTimerRef.current = null
        setPeekPlacements(null)
      }, PEEK_DURATION_MS)
    }

    return (
      <div
        className={`table-pile ${highlight ? 'table-pile--highlight' : ''}`}
        ref={ref}
        onDoubleClick={handlePeek}
      >
        <div className="table-pile__stack">
          {!capturing && cards.length === 0 && showPlayPrompt && (
            <div className="table-pile__empty">Oyna</div>
          )}
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
                peekPlacement={peekPlacements?.[card.id] ?? null}
                zIndex={globalIndex + 1}
                dealIn={dealIn}
                dealFromRef={dealFromRef}
                dealDelay={dealDelay}
                highlightRank={highlightTopRank && globalIndex === shown.length - 1}
                emphasize={globalIndex === shown.length - 1}
              />
            )
          })}
        </div>
      </div>
    )
  },
)
