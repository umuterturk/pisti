import { useEffect, useRef, useState } from 'react'

/** Seconds per multiplayer turn before auto-play. */
export const TURN_MS = 7_000
/** Outer diameter of the badge while the timer is running */
const SIZE = 68
const STROKE = 5
const RADIUS = (SIZE - STROKE) / 2 - 0.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export type TimerUrgency = 'ok' | 'warn' | 'danger' | null

/**
 * Drives the HUD badge chronometer. Returns remaining ms + urgency class
 * for the parent badge to style itself.
 */
export function useTurnTimer(deadline: number, onExpire?: () => void): {
  active: boolean
  remaining: number
  seconds: number
  fraction: number
  urgency: TimerUrgency
  dashOffset: number
} {
  const [now, setNow] = useState(() => Date.now())
  const rafRef = useRef<number | null>(null)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!deadline) {
      expiredRef.current = false
      setNow(Date.now())
      return
    }
    expiredRef.current = false

    const tick = () => {
      const t = Date.now()
      setNow(t)
      const left = Math.max(0, deadline - t)
      if (left === 0) {
        if (!expiredRef.current) {
          expiredRef.current = true
          onExpireRef.current?.()
        }
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    tick()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [deadline])

  const remaining = deadline > 0 ? Math.max(0, deadline - now) : 0
  const active = deadline > 0 && remaining > 0
  const fraction = deadline > 0 ? Math.min(1, remaining / TURN_MS) : 1
  const urgency: TimerUrgency = !active
    ? null
    : fraction <= 0.2
      ? 'danger'
      : fraction <= 0.5
        ? 'warn'
        : 'ok'

  return {
    active,
    remaining,
    seconds: Math.ceil(remaining / 1000),
    fraction,
    urgency,
    dashOffset: CIRCUMFERENCE * (1 - fraction),
  }
}

export const TURN_TIMER = { TURN_MS, SIZE, STROKE, RADIUS, CIRCUMFERENCE }

/** SVG chronometer ring — sits inside `.hud__badge`. */
export function HudTimerRing({
  dashOffset,
  urgency,
}: {
  dashOffset: number
  urgency: TimerUrgency
}) {
  if (!urgency) return null
  const stroke =
    urgency === 'danger' ? '#ff5252' : urgency === 'warn' ? '#ffd54f' : '#7CFF9A'

  return (
    <svg
      className="hud__timer-ring"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={STROKE + 2}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={STROKE}
      />
      <circle
        className="hud__timer-arc"
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
      />
    </svg>
  )
}
