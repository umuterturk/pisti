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

// Detect iOS: Vibration API doesn't work on iOS Safari/PWAs
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return

  // Try Vibration API (works on Android, not iOS)
  if (navigator.vibrate) {
    navigator.vibrate(pattern)
    return
  }

  // iOS fallback: play a subtle sound as haptic alternative
  if (isIOS()) {
    playHapticSound()
  }
}

// Silent haptic feedback via Web Audio API (iOS fallback)
function playHapticSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    // Very short, quiet click/pop sound (80Hz sine wave, 20ms)
    osc.frequency.value = 80
    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.02)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.02)
  } catch {
    // Silently fail if audio context unavailable
  }
}
