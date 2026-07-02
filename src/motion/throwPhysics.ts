import { LANDING, THROW, TIMING } from './params'

export interface ThrowInputs {
  velocityX: number
  velocityY: number
  distanceX: number
  distanceY: number
}

export interface ThrowOutput {
  duration: number
  spin: number
  overshootX: number
  overshootY: number
  landOffsetX: number
  landOffsetY: number
  landRotation: number
  slideDistance: number
  impactStrength: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomSigned(range: number): number {
  return (Math.random() * 2 - 1) * range
}

export function computeThrow(inputs: ThrowInputs): ThrowOutput {
  const speed = Math.hypot(inputs.velocityX, inputs.velocityY)
  const normalized = clamp(
    (speed - THROW.minSpeed) / (THROW.maxSpeed - THROW.minSpeed),
    0,
    1,
  )

  const duration =
    THROW.maxDuration - normalized * (THROW.maxDuration - THROW.minDuration)

  const spin = randomSigned(THROW.maxSpin * (0.3 + normalized * 0.7))
  const overshootScale = 0.4 + normalized * 0.6
  const overshootX = randomSigned(THROW.maxOvershoot * overshootScale)
  const overshootY = randomSigned(THROW.maxOvershoot * overshootScale * 0.6)

  const landOffsetX = randomSigned(LANDING.offsetX)
  const landOffsetY = randomSigned(LANDING.offsetY)
  const landRotation = randomSigned(LANDING.rotation)

  const slideDistance = randomInRange(
    LANDING.minSlide,
    LANDING.minSlide + (LANDING.maxSlide - LANDING.minSlide) * normalized,
  )

  return {
    duration,
    spin,
    overshootX,
    overshootY,
    landOffsetX,
    landOffsetY,
    landRotation,
    slideDistance,
    impactStrength: normalized,
  }
}

export function computeOpponentThrow(): ThrowOutput {
  const duration = randomInRange(TIMING.opponentThrowMin, TIMING.opponentThrowMax)
  return {
    duration,
    spin: randomSigned(18),
    overshootX: randomSigned(12),
    overshootY: randomSigned(8),
    landOffsetX: randomSigned(LANDING.offsetX),
    landOffsetY: randomSigned(LANDING.offsetY),
    landRotation: randomSigned(LANDING.rotation),
    slideDistance: randomInRange(LANDING.minSlide, LANDING.maxSlide * 0.7),
    impactStrength: 0.55,
  }
}
