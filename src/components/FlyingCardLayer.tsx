import { motion } from 'framer-motion'
import { Card } from './Card'
import type { FlyingCardState } from './flyingCard'

interface FlyingCardLayerProps {
  flying: FlyingCardState | null
}

// Purely visual: given a flying card, render its launch -> flight -> settle
// motion declaratively. Game progression is owned by the parent via a timer,
// so nothing here can stall the game if an animation event does not fire.
export function FlyingCardLayer({ flying }: FlyingCardLayerProps) {
  if (!flying) return null

  const { physics, startX, startY, targetX, targetY, landScale, landing } = flying

  const midX = (startX + targetX) / 2 + physics.overshootX * 0.3 - startX
  const midY = Math.min(startY, targetY) - 40 - Math.abs(physics.overshootY) - startY
  const finalX = targetX + landing.offsetX - startX
  const finalY = targetY + landing.offsetY - startY
  // Start at full (hand) size and shrink into the pile during flight, rather
  // than popping to pile size the instant the card leaves the hand.
  const launchScale = 1.06

  const flightDuration = physics.duration
  const settleDuration = 0.12
  const total = flightDuration + settleDuration
  const flightFraction = flightDuration / total

  const flightEase: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

  return (
    <motion.div
      key={flying.id}
      className="flying-card"
      style={{
        position: 'fixed',
        left: startX,
        top: startY,
        zIndex: 200,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))',
        perspective: 900,
      }}
      initial={{ x: 0, y: 0, rotate: 0, scale: launchScale }}
      animate={{
        x: [0, midX, targetX + physics.overshootX - startX, finalX],
        y: [0, midY, targetY + physics.overshootY - startY, finalY],
        rotate: [0, physics.spin * 0.6, physics.landRotation, landing.rotation],
        scale: [launchScale, 1, landScale * 1.02, landScale],
      }}
      transition={{
        duration: total,
        times: [0, flightFraction * 0.55, flightFraction, 1],
        ease: [flightEase, flightEase, 'easeOut'] as const,
      }}
    >
      {flying.flip ? (
        <FlipCard flying={flying} flightDuration={flightDuration} />
      ) : (
        <Card
          card={flying.faceDown ? undefined : flying.card}
          faceDown={flying.faceDown}
          width={flying.width}
          height={flying.height}
        />
      )}
    </motion.div>
  )
}

// A two-sided card that begins face-down and rotates on the Y axis to reveal
// its face partway through the flight.
function FlipCard({
  flying,
  flightDuration,
}: {
  flying: FlyingCardState
  flightDuration: number
}) {
  return (
    <motion.div
      style={{
        position: 'relative',
        width: flying.width,
        height: flying.height,
        transformStyle: 'preserve-3d',
      }}
      initial={{ rotateY: 180 }}
      animate={{ rotateY: 0 }}
      transition={{
        duration: flightDuration * 0.7,
        delay: flightDuration * 0.1,
        ease: 'easeInOut',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
        <Card card={flying.card} width={flying.width} height={flying.height} />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
        }}
      >
        <Card faceDown width={flying.width} height={flying.height} />
      </div>
    </motion.div>
  )
}
