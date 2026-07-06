// Detects whether the device is likely too weak to run the full visual polish
// (backdrop blur, drop-shadow filters, dense confetti) at a smooth frame rate.
// When true, callers strip per-frame raster costs so animations stay fluid.
//
// The result is computed once and cached: hardware characteristics don't change
// during a session, and repeated matchMedia/navigator reads are wasteful.

let cached: boolean | null = null

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
  connection?: {
    effectiveType?: string
    saveData?: boolean
  }
}

// A `?perf=lite` / `?perf=full` query param forces a mode, so both visual paths
// can be verified on any device during testing. Returns null when unset.
function readOverride(): boolean | null {
  if (typeof location === 'undefined') return null
  const perf = new URLSearchParams(location.search).get('perf')
  if (perf === 'lite') return true
  if (perf === 'full') return false
  return null
}

function compute(): boolean {
  const override = readOverride()
  if (override !== null) return override

  if (typeof navigator === 'undefined') return false
  const nav = navigator as NavigatorWithHints

  // The user (or their OS) has explicitly asked to conserve data/resources.
  if (nav.connection?.saveData) return true

  // A slow connection strongly correlates with budget hardware.
  const effectiveType = nav.connection?.effectiveType
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    return true
  }

  // Low reported RAM (Chrome/Android; iOS Safari doesn't expose this).
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true

  // Few CPU cores on a touch device signals a budget phone (e.g. iPhone 7 and
  // older report <= 4). Gated to touch so 4-core desktops/laptops — which
  // render this game trivially — aren't misflagged as weak.
  const isTouch =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (isTouch && typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) {
    return true
  }

  return false
}

export function isWeakDevice(): boolean {
  if (cached === null) cached = compute()
  return cached
}
