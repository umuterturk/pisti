// Haptic feedback patterns for mobile devices using the Vibration API.
// No-op on devices that don't support vibration.

/** Light tap for subtle feedback */
export const TAP = 20

/** Medium tap for captures */
export const CAPTURE = 60

/** Double pulse for Pişti celebration */
export const PISTI = [30, 40, 30]

/** Triple pulse for double Pişti (consecutive) */
export const DOUBLE_PISTI = [40, 50, 40, 50, 40]

/** Quad pulse for triple Pişti (rare) */
export const TRIPLE_PISTI = [50, 60, 50, 60, 50, 60, 50]

/** 5-pulse for quad Pişti (very rare) */
export const QUAD_PISTI = [60, 50, 60, 50, 60, 50, 60, 50, 60]

/** Rapid fire for 5+ Pişti (extreme!) */
export const EXTREME_PISTI = [70, 30, 70, 30, 70, 30, 70, 30, 70, 30, 70]

/** Error/invalid action */
export const ERROR = [10, 20, 10]

/** Win celebration */
export const WIN = [50, 80, 50]

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern)
  }
}
