import type { Card as CardType } from '../game/cards'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  HAND_CARD_HEIGHT,
  HAND_CARD_WIDTH,
} from '../motion/params'
import {
  computeOpponentThrow,
  computeThrow,
  type ThrowOutput,
} from '../motion/throwPhysics'

export interface LandingResult {
  offsetX: number
  offsetY: number
  rotation: number
}

export interface FlyingCardState {
  id: string
  card: CardType
  startX: number
  startY: number
  targetX: number
  targetY: number
  faceDown?: boolean
  /** Start face-down and flip to face-up mid-flight (opponent plays). */
  flip?: boolean
  width: number
  height: number
  landScale: number
  physics: ThrowOutput
  /** Total time (ms) from launch until the card has fully settled. */
  totalMs: number
  /** Final resting offset/rotation relative to the pile centre. */
  landing: LandingResult
}

const SETTLE_SEC = 0.12

function landingFrom(physics: ThrowOutput): LandingResult {
  const slideAngle = (physics.landRotation * Math.PI) / 180
  const slideX = Math.cos(slideAngle) * physics.slideDistance
  const slideY = Math.sin(slideAngle) * physics.slideDistance
  return {
    offsetX: physics.landOffsetX + slideX,
    offsetY: physics.landOffsetY + slideY,
    rotation: physics.landRotation,
  }
}

export function createFlyingCardFromThrow(
  card: CardType,
  element: HTMLElement,
  targetRect: DOMRect,
  velocity: { x: number; y: number },
  offset: { x: number; y: number },
  pisti = false,
): FlyingCardState {
  const rect = element.getBoundingClientRect()
  const physics = computeThrow({
    velocityX: velocity.x,
    velocityY: velocity.y,
    distanceX: offset.x,
    distanceY: offset.y,
  })

  return {
    id: `fly-${card.id}-${Date.now()}`,
    card,
    startX: rect.left,
    startY: rect.top,
    targetX: targetRect.left + targetRect.width / 2 - HAND_CARD_WIDTH / 2,
    targetY: targetRect.top + targetRect.height / 2 - HAND_CARD_HEIGHT / 2,
    // A pişti card is played face-down (back on top) as a traditional marker.
    faceDown: pisti,
    width: HAND_CARD_WIDTH,
    height: HAND_CARD_HEIGHT,
    landScale: CARD_WIDTH / HAND_CARD_WIDTH,
    physics,
    totalMs: (physics.duration + SETTLE_SEC) * 1000,
    landing: landingFrom(physics),
  }
}

export function createOpponentFlyingCard(
  card: CardType,
  fromRect: DOMRect,
  targetRect: DOMRect,
  pisti = false,
): FlyingCardState {
  const physics = computeOpponentThrow()

  return {
    id: `opp-fly-${card.id}-${Date.now()}`,
    card,
    startX: fromRect.left,
    startY: fromRect.top,
    targetX: targetRect.left + targetRect.width / 2 - CARD_WIDTH / 2,
    targetY: targetRect.top + targetRect.height / 2 - CARD_HEIGHT / 2,
    faceDown: true,
    // On a pişti the card stays face-down (marker); otherwise it flips to reveal.
    flip: !pisti,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    landScale: 1,
    physics,
    totalMs: (physics.duration + SETTLE_SEC) * 1000,
    landing: landingFrom(physics),
  }
}
