import { memo, type RefObject } from 'react'
import { HudTimerRing, useTurnTimer } from '../app/TurnTimer'
import { RollingScore } from './RollingScore'

interface HudProps {
  name: string
  score: number
  cards: number
  active: boolean
  side: 'top' | 'bottom'
  /** Shows a "thinking…" hint while this side is deciding on its move. */
  thinking?: boolean
  /** Attached to the score value so flying score popups know where to land. */
  scoreRef?: RefObject<HTMLSpanElement | null>
  /** Opens the scoring legend popup. */
  onScoreClick?: () => void
  /** Multiplayer turn deadline (epoch ms). 0 = no timer. */
  turnDeadline?: number
  /** Fired once when this side's timer hits zero. */
  onTurnExpire?: () => void
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
}: HudProps) {
  const initial = name.charAt(0).toUpperCase()
  const timer = useTurnTimer(turnDeadline, onTurnExpire)
  const urgencyClass = timer.urgency ? ` hud__badge--timer hud__badge--${timer.urgency}` : ''

  return (
    <div className={`hud hud--${side} ${active ? 'hud--active' : ''}`}>
      <div className="hud__id">
        <div className="hud__avatar">{initial}</div>
        <div className="hud__name">
          {name}
          {timer.active ? (
            <span className={`hud__clock hud__clock--${timer.urgency ?? 'ok'}`}>
              {timer.seconds}s
            </span>
          ) : thinking ? (
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
