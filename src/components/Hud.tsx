import type { RefObject } from 'react'
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
}

export function Hud({ name, score, cards, active, side, thinking, scoreRef, onScoreClick }: HudProps) {
  const initial = name.charAt(0).toUpperCase()
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
      <button
        type="button"
        className="hud__badge"
        onClick={onScoreClick}
        aria-label="Puanlamayı göster"
      >
        <RollingScore value={score} className="hud__score" innerRef={scoreRef} />
        <span className="hud__cards">
          {cards}
          <span className="hud__cards-label">kart</span>
        </span>
      </button>
    </div>
  )
}
