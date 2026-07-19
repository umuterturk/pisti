import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { HudTimerRing, useTurnTimer } from '../app/TurnTimer'
import { RollingScore } from './RollingScore'

const EMOJIS = ['😭', '😂', '🫨', '🤓', '😒', '🫣'] as const
const EMOJI_COOLDOWN_MS = 3_000
const EMOJI_PICK_MS = 3_000

interface HudProps {
  name: string
  score: number
  cards: number
  active: boolean
  side: 'top' | 'bottom'
  /** Shows a "thinking…" hint while this side is deciding on a move. */
  thinking?: boolean
  /** Attached to the score value so flying score popups know where to land. */
  scoreRef?: RefObject<HTMLSpanElement | null>
  /** Opens the scoring legend popup. */
  onScoreClick?: () => void
  /** Multiplayer turn deadline (epoch ms). 0 = no timer. */
  turnDeadline?: number
  /** Fired once when this side's timer hits zero. */
  onTurnExpire?: () => void
  /** Multiplayer mode: show the reaction picker above the score badge. */
  isMultiplayer?: boolean
  /** Callback when user picks an emoji. */
  onEmojiClick?: (emoji: string) => void
}

function HudComponent({
  name,
  score,
  cards,
  active,
  side,
  thinking,
  scoreRef,
  onScoreClick,
  turnDeadline = 0,
  onTurnExpire,
  isMultiplayer = false,
  onEmojiClick,
}: HudProps) {
  const initial = name.charAt(0).toUpperCase()
  const timer = useTurnTimer(turnDeadline, onTurnExpire)
  const urgencyClass = timer.urgency ? ` hud__badge--timer hud__badge--${timer.urgency}` : ''

  const showReact = isMultiplayer && side === 'bottom'

  const [open, setOpen] = useState(false)
  const [lastEmoji, setLastEmoji] = useState<string>(EMOJIS[0])
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [pickLeftMs, setPickLeftMs] = useState(EMOJI_PICK_MS)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const pickStartedAtRef = useRef(0)
  const closingRef = useRef(false)

  const onCooldown = nowTick < cooldownUntil
  const cooldownLeft = Math.max(0, cooldownUntil - nowTick)

  // Tick while open (pick countdown) or cooling down (UI refresh).
  useEffect(() => {
    if (!showReact) return
    if (!open && cooldownUntil <= Date.now()) return
    const id = window.setInterval(() => setNowTick(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [showReact, open, cooldownUntil])

  const closePicker = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOpen(false)
    setPickLeftMs(EMOJI_PICK_MS)
    window.setTimeout(() => {
      closingRef.current = false
    }, 280)
  }, [])

  // Auto-close after the pick window.
  useEffect(() => {
    if (!open) return
    pickStartedAtRef.current = Date.now()
    setPickLeftMs(EMOJI_PICK_MS)

    const tick = window.setInterval(() => {
      const left = Math.max(0, EMOJI_PICK_MS - (Date.now() - pickStartedAtRef.current))
      setPickLeftMs(left)
    }, 40)

    const done = window.setTimeout(() => {
      closePicker()
    }, EMOJI_PICK_MS)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(done)
    }
  }, [open, closePicker])

  const openPicker = useCallback(() => {
    if (onCooldown || closingRef.current) return
    setOpen(true)
  }, [onCooldown])

  const handleTrigger = useCallback(() => {
    if (open) {
      closePicker()
      return
    }
    openPicker()
  }, [open, closePicker, openPicker])

  const handlePick = useCallback(
    (emoji: string) => {
      if (!open || onCooldown) return
      setLastEmoji(emoji)
      setCooldownUntil(Date.now() + EMOJI_COOLDOWN_MS)
      setNowTick(Date.now())
      onEmojiClick?.(emoji)
      closePicker()
    },
    [open, onCooldown, onEmojiClick, closePicker],
  )

  const pickFraction = open ? pickLeftMs / EMOJI_PICK_MS : 0
  const cooldownFraction = onCooldown ? 1 - cooldownLeft / EMOJI_COOLDOWN_MS : 1

  return (
    <div className={`hud hud--${side} ${active ? 'hud--active' : ''}`}>
      <div className="hud__id">
        <div className="hud__avatar">{initial}</div>
        <div className="hud__name">
          {name}
          {thinking ? (
            <span className="hud__thinking">
              Düşünüyor
              <span className="hud__thinking-dots">
                <span />
                <span />
                <span />
              </span>
            </span>
          ) : (
            active && <span className="hud__turn-dot" />
          )}
        </div>
      </div>

      {showReact && (
        <div
          className={`hud__react${open ? ' hud__react--open' : ''}${
            onCooldown ? ' hud__react--cooldown' : ''
          }`}
        >
          <div className="hud__react-rail" aria-hidden={!open}>
            {EMOJIS.map((emoji, i) => (
              <button
                key={emoji}
                type="button"
                className="hud__react-option"
                style={{ '--react-i': EMOJIS.length - 1 - i } as CSSProperties}
                tabIndex={open ? 0 : -1}
                disabled={!open}
                onClick={() => handlePick(emoji)}
                aria-label={`Send ${emoji}`}
              >
                <span>{emoji}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="hud__react-trigger"
            onClick={handleTrigger}
            disabled={onCooldown && !open}
            aria-expanded={open}
            aria-label={
              onCooldown
                ? `Wait ${Math.ceil(cooldownLeft / 1000)}s`
                : open
                  ? 'Close reactions'
                  : 'Send a reaction'
            }
            style={
              {
                '--pick-fraction': pickFraction,
                '--cooldown-fraction': cooldownFraction,
              } as CSSProperties
            }
          >
            <span className="hud__react-trigger-emoji" aria-hidden>
              {lastEmoji}
            </span>
            {open && <span className="hud__react-pick-ring" aria-hidden />}
            {onCooldown && !open && <span className="hud__react-cool-fill" aria-hidden />}
          </button>
        </div>
      )}

      <button
        type="button"
        className={`hud__badge${urgencyClass}`}
        onClick={onScoreClick}
        aria-label="Puanlamayı göster"
      >
        {timer.active && (
          <HudTimerRing dashOffset={timer.dashOffset} urgency={timer.urgency} />
        )}
        <RollingScore value={score} className="hud__score" innerRef={scoreRef} />
        <span className="hud__cards">
          {cards}
          <span className="hud__cards-label">kart</span>
        </span>
      </button>
    </div>
  )
}

export const Hud = memo(HudComponent)
