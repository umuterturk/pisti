// A tiny seedable PRNG (mulberry32). Deterministic given a seed, so bot
// behavior and the self-play harness are reproducible. Production callers seed
// from Math.random(); tests/harness pass a fixed seed.
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A production-seeded RNG (fresh randomness each call site). */
export function randomRng(): Rng {
  return mulberry32((Math.random() * 0xffffffff) >>> 0)
}

/** Fisher–Yates shuffle driven by a supplied RNG (pure; returns a new array). */
export function shuffleWith<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Pick a uniformly random element (caller guarantees non-empty). */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}
