import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTurnTimer, type TimerUrgency } from '../app/TurnTimer'
import type { HudSide, ReactionPick } from './Hud'

const EMOJIS = ['😭', '😂', '🫨', '🤓', '😒', '🫣'] as const
const TEXTS = [
  'Gibi Gibi!',
  'Şans!',
  'Tabiii!',
  'Yok Artık!',
  'İnsaf!',
  'Haydaaa!',
] as const
const REACT_COOLDOWN_MS = 3_000
const REACT_PICK_MS = 3_000

/** Avatar chronometer ring (fits around 48px avatar). */
const AVATAR_DIAL = 58
const AVATAR_STROKE = 4
const AVATAR_RADIUS = (AVATAR_DIAL - AVATAR_STROKE) / 2 - 0.5
const AVATAR_CIRCUMFERENCE = 2 * Math.PI * AVATAR_RADIUS

export type SeatNumber = 1 | 2 | 3 | 4

interface SeatHudProps {
  side: HudSide
  name: string
  seatNumber: SeatNumber
  /** Collected pile size (not hand size). */
  cards: number
  active: boolean
  thinking?: boolean
  avatarUrl?: string
  /** Landing target for flying score popups. */
  avatarRef?: RefObject<HTMLSpanElement | null>
  allowReactions?: boolean
  onReaction?: (reaction: ReactionPick) => void
  /** Epoch ms deadline for this seat's turn; 0 = no timer. */
  turnDeadline?: number
  onTurnExpire?: () => void
}

type PickerKind = 'emoji' | 'text'

function dialStroke(urgency: TimerUrgency): string {
  if (urgency === 'danger') return '#ff5252'
  if (urgency === 'warn') return '#ffd54f'
  return '#7CFF9A'
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

function SeatHudComponent({
  side,
  name,
  seatNumber,
  cards,
  active,
  thinking,
  avatarUrl,
  avatarRef,
  allowReactions = false,
  onReaction,
  turnDeadline = 0,
  onTurnExpire,
}: SeatHudProps) {
  const initial = name.charAt(0).toUpperCase()
  const showReact = allowReactions && side === 'bottom'
  const timer = useTurnTimer(turnDeadline, onTurnExpire)
  const showTimer = timer.active
  const timerDash = showTimer ? AVATAR_CIRCUMFERENCE * (1 - timer.fraction) : 0

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
    <div
      className={`seat-hud seat-hud--${side} seat-hud--seat-${seatNumber}${
        active ? ' seat-hud--active' : ''
      }${showTimer && timer.urgency ? ` seat-hud--timer-${timer.urgency}` : ''}`}
    >
      <div className="seat-hud__avatar-wrap">
        {showTimer && (
          <svg
            className="seat-hud__timer-ring"
            width={AVATAR_DIAL}
            height={AVATAR_DIAL}
            viewBox={`0 0 ${AVATAR_DIAL} ${AVATAR_DIAL}`}
            aria-hidden
          >
            <circle
              cx={AVATAR_DIAL / 2}
              cy={AVATAR_DIAL / 2}
              r={AVATAR_RADIUS}
              fill="none"
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={AVATAR_STROKE + 2}
            />
            <circle
              cx={AVATAR_DIAL / 2}
              cy={AVATAR_DIAL / 2}
              r={AVATAR_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={AVATAR_STROKE}
            />
            <circle
              className="seat-hud__timer-arc"
              cx={AVATAR_DIAL / 2}
              cy={AVATAR_DIAL / 2}
              r={AVATAR_RADIUS}
              fill="none"
              stroke={dialStroke(timer.urgency)}
              strokeWidth={AVATAR_STROKE}
              strokeLinecap="round"
              strokeDasharray={AVATAR_CIRCUMFERENCE}
              strokeDashoffset={timerDash}
            />
          </svg>
        )}
        <span
          ref={avatarRef}
          className={`seat-hud__avatar${avatarUrl ? ' seat-hud__avatar--photo' : ''}${
            showTimer ? ' seat-hud__avatar--timed' : ''
          }${showTimer && timer.urgency ? ` seat-hud__avatar--${timer.urgency}` : ''}`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="seat-hud__avatar-img" draggable={false} />
          ) : (
            initial
          )}
        </span>
        <span className="seat-hud__badge" aria-hidden>
          {seatNumber}
        </span>
        {showTimer && (
          <span className="seat-hud__timer-secs" aria-live="polite">
            {timer.seconds}
          </span>
        )}
      </div>

      <div className="seat-hud__meta">
        <div className="seat-hud__name-pill">
          <span className="seat-hud__name">{name}</span>
          <span
            className={`seat-hud__dot${thinking ? ' seat-hud__dot--thinking' : ''}`}
            aria-hidden
          />
        </div>
        <div className="seat-hud__cards">
          {cards} <span className="seat-hud__cards-label">KART</span>
        </div>
        {thinking && <span className="seat-hud__thinking">Düşünüyor…</span>}
      </div>

      {showReact && (
        <div className="seat-hud__reacts hud__reacts">
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
    </div>
  )
}

export const SeatHud = memo(SeatHudComponent)
