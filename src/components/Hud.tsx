import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { HudTimerRing, useTurnTimer } from '../app/TurnTimer'
import { RollingScore } from './RollingScore'

const EMOJIS = ['😭', '😂', '🫨', '🤓', '😒', '🫣'] as const
const TEXTS = [
  'Gibi Gibi!',
  'Şans!',
  'Tabiii!',
  'Yok Artıkk!',
  'Hoppaa!',
  'Haydaaa!',
] as const
const REACT_COOLDOWN_MS = 3_000
const REACT_PICK_MS = 3_000

export type ReactionPick =
  | { kind: 'emoji'; value: string }
  | { kind: 'text'; value: string }

type PickerKind = 'emoji' | 'text'

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
  /** Callback when user picks an emoji or taunt text. */
  onReaction?: (reaction: ReactionPick) => void
}

interface ReactionPickerProps {
  kind: PickerKind
  open: boolean
  onCooldown: boolean
  cooldownLeft: number
  pickLeftMs: number
  triggerLabel: ReactNode
  triggerClassName?: string
  onTrigger: () => void
  onPick: (value: string) => void
  options: readonly string[]
  optionClassName?: string
}

function ReactionPicker({
  kind,
  open,
  onCooldown,
  cooldownLeft,
  pickLeftMs,
  triggerLabel,
  triggerClassName,
  onTrigger,
  onPick,
  options,
  optionClassName,
}: ReactionPickerProps) {
  const pickFraction = open ? pickLeftMs / REACT_PICK_MS : 0
  const cooldownFraction = onCooldown ? 1 - cooldownLeft / REACT_COOLDOWN_MS : 1

  return (
    <div
      className={`hud__react hud__react--${kind}${open ? ' hud__react--open' : ''}${
        onCooldown ? ' hud__react--cooldown' : ''
      }`}
    >
      <div className="hud__react-rail" aria-hidden={!open}>
        {options.map((value, i) => (
          <button
            key={value}
            type="button"
            className={`hud__react-option${optionClassName ? ` ${optionClassName}` : ''}`}
            style={{ '--react-i': options.length - 1 - i } as CSSProperties}
            tabIndex={open ? 0 : -1}
            disabled={!open}
            onClick={() => onPick(value)}
            aria-label={`Send ${value}`}
          >
            <span>{value}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`hud__react-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        onClick={onTrigger}
        disabled={onCooldown && !open}
        aria-expanded={open}
        aria-label={
          onCooldown
            ? `Wait ${Math.ceil(cooldownLeft / 1000)}s`
            : open
              ? `Close ${kind} reactions`
              : `Send a ${kind} reaction`
        }
        style={
          {
            '--pick-fraction': pickFraction,
            '--cooldown-fraction': cooldownFraction,
          } as CSSProperties
        }
      >
        <span
          className={
            kind === 'text' ? 'hud__react-trigger-text' : 'hud__react-trigger-emoji'
          }
          aria-hidden
        >
          {triggerLabel}
        </span>
        {open && <span className="hud__react-pick-ring" aria-hidden />}
        {onCooldown && !open && <span className="hud__react-cool-fill" aria-hidden />}
      </button>
    </div>
  )
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
  onReaction,
}: HudProps) {
  const initial = name.charAt(0).toUpperCase()
  const timer = useTurnTimer(turnDeadline, onTurnExpire)
  const urgencyClass = timer.urgency ? ` hud__badge--timer hud__badge--${timer.urgency}` : ''

  const showReact = isMultiplayer && side === 'bottom'

  const [openKind, setOpenKind] = useState<PickerKind | null>(null)
  const [lastEmoji, setLastEmoji] = useState<string>(EMOJIS[0])
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [pickLeftMs, setPickLeftMs] = useState(REACT_PICK_MS)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const pickStartedAtRef = useRef(0)
  const closingRef = useRef(false)

  const onCooldown = nowTick < cooldownUntil
  const cooldownLeft = Math.max(0, cooldownUntil - nowTick)
  const open = openKind !== null

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
    setOpenKind(null)
    setPickLeftMs(REACT_PICK_MS)
    window.setTimeout(() => {
      closingRef.current = false
    }, 280)
  }, [])

  // Auto-close after the pick window.
  useEffect(() => {
    if (!openKind) return
    pickStartedAtRef.current = Date.now()
    setPickLeftMs(REACT_PICK_MS)

    const tick = window.setInterval(() => {
      const left = Math.max(0, REACT_PICK_MS - (Date.now() - pickStartedAtRef.current))
      setPickLeftMs(left)
    }, 40)

    const done = window.setTimeout(() => {
      closePicker()
    }, REACT_PICK_MS)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(done)
    }
  }, [openKind, closePicker])

  const handleTrigger = useCallback(
    (kind: PickerKind) => {
      if (openKind === kind) {
        closePicker()
        return
      }
      if (onCooldown || closingRef.current) return
      setOpenKind(kind)
    },
    [openKind, onCooldown, closePicker],
  )

  const handlePick = useCallback(
    (pick: ReactionPick) => {
      if (!openKind || openKind !== pick.kind || onCooldown) return
      if (pick.kind === 'emoji') setLastEmoji(pick.value)
      setCooldownUntil(Date.now() + REACT_COOLDOWN_MS)
      setNowTick(Date.now())
      onReaction?.(pick)
      closePicker()
    },
    [openKind, onCooldown, onReaction, closePicker],
  )

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
        <div className="hud__reacts">
          <ReactionPicker
            kind="text"
            open={openKind === 'text'}
            onCooldown={onCooldown}
            cooldownLeft={cooldownLeft}
            pickLeftMs={pickLeftMs}
            triggerLabel="Aa"
            triggerClassName="hud__react-trigger--text"
            optionClassName="hud__react-option--text"
            options={TEXTS}
            onTrigger={() => handleTrigger('text')}
            onPick={(value) => handlePick({ kind: 'text', value })}
          />
          <ReactionPicker
            kind="emoji"
            open={openKind === 'emoji'}
            onCooldown={onCooldown}
            cooldownLeft={cooldownLeft}
            pickLeftMs={pickLeftMs}
            triggerLabel={lastEmoji}
            options={EMOJIS}
            onTrigger={() => handleTrigger('emoji')}
            onPick={(value) => handlePick({ kind: 'emoji', value })}
          />
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
