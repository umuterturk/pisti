export const CARD_WIDTH = 84
export const CARD_HEIGHT = 117

export const HAND_CARD_WIDTH = 168
export const HAND_CARD_HEIGHT = 236

export const HAND_VISIBLE_RATIO = 0.6

// Opponent hand: a bit bigger than the pile cards and only half visible.
export const OPP_CARD_WIDTH = 96
export const OPP_CARD_HEIGHT = 134
export const OPP_VISIBLE_RATIO = 0.5

export const TOUCH = {
  scale: 1.06,
  lift: -28,
  neighborPush: 16,
} as const

export const GESTURE = {
  throwDistance: 56,
  throwVelocity: 380,
  reorderDistance: 22,
  snapBackMax: 18,
} as const

export const THROW = {
  minDuration: 0.18,
  maxDuration: 0.48,
  minSpeed: 200,
  maxSpeed: 1400,
  maxSpin: 35,
  maxOvershoot: 28,
  maxSlide: 14,
} as const

export const LANDING = {
  offsetX: 34,
  offsetY: 30,
  rotation: 22,
  minSlide: 4,
  maxSlide: 20,
} as const

export const TIMING = {
  snapBack: 0.22,
  reorder: 0.2,
  capturePause: 0.1,
  captureCompress: 0.15,
  captureMove: 0.38,
  opponentThrowMin: 0.28,
  opponentThrowMax: 0.42,
} as const

export const SPRING = {
  hand: { type: 'spring' as const, stiffness: 420, damping: 32 },
  snapBack: { type: 'spring' as const, stiffness: 500, damping: 35 },
  pile: { type: 'spring' as const, stiffness: 380, damping: 28 },
}
