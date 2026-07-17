import { memo, useState, useEffect, type RefObject } from 'react'
import { HudTimerRing, useTurnTimer } from '../app/TurnTimer'
import { RollingScore } from './RollingScore'

const EMOJIS = ['🙄', '😂', '😮']
const EMOJI_COOLDOWN_MS = 10000 // 10 seconds

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
  /** Multiplayer mode: show emoji buttons instead of timer */
  isMultiplayer?: boolean
  /** Callback when user clicks an emoji */
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

  const showEmojis = isMultiplayer && side === 'bottom'

  // Track last sent time for each emoji
  const [emojiCooldowns, setEmojiCooldowns] = useState<Record<string, number>>({})

  // Update cooldowns every second
  useEffect(() => {
    if (!showEmojis) return
    const interval = setInterval(() => {
      setEmojiCooldowns((prev) => {
        const now = Date.now()
        const updated = { ...prev }
        let changed = false
        for (const [emoji, timestamp] of Object.entries(updated)) {
          if (now - timestamp >= EMOJI_COOLDOWN_MS) {
            delete updated[emoji]
            changed = true
          }
        }
        return changed ? updated : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [showEmojis])

  const handleEmojiClick = (emoji: string) => {
    const now = Date.now()
    const lastSent = emojiCooldowns[emoji] ?? 0
    if (now - lastSent < EMOJI_COOLDOWN_MS) return

    setEmojiCooldowns((prev) => ({ ...prev, [emoji]: now }))
    onEmojiClick?.(emoji)
  }

  const getEmojiCooldown = (emoji: string): number => {
    const lastSent = emojiCooldowns[emoji]
    if (!lastSent) return 0
    const elapsed = Date.now() - lastSent
    return Math.max(0, EMOJI_COOLDOWN_MS - elapsed)
  }

  return (
    <div className={`hud hud--${side} ${active ? 'hud--active' : ''}`}>
      <div className="hud__id">
        <div className="hud__avatar">{initial}</div>
        <div className="hud__name">
          {name}
          {!showEmojis && thinking ? (
            <span className="hud__thinking">
              Düşünüyor
              <span className="hud__thinking-dots">
                <span />
                <span />
                <span />
              </span>
            </span>
          ) : (
            !showEmojis && active && <span className="hud__turn-dot" />
          )}
        </div>
      </div>
      {showEmojis && (
        <div className="hud__emojis">
          {EMOJIS.map((emoji) => {
            const cooldown = getEmojiCooldown(emoji)
            const onCooldown = cooldown > 0
            const progress = onCooldown ? (EMOJI_COOLDOWN_MS - cooldown) / EMOJI_COOLDOWN_MS : 1
            return (
              <button
                key={emoji}
                type="button"
                className={`hud__emoji-btn ${onCooldown ? 'hud__emoji-btn--cooldown' : ''}`}
                onClick={() => handleEmojiClick(emoji)}
                disabled={onCooldown}
                aria-label={onCooldown ? `Wait ${Math.ceil(cooldown / 1000)}s` : `Send ${emoji}`}
                title={onCooldown ? `${Math.ceil(cooldown / 1000)}s` : ''}
                style={{
                  '--cooldown-progress': progress,
                } as React.CSSProperties}
              >
                <span className="hud__emoji-btn-icon">{emoji}</span>
                {onCooldown && <div className="hud__emoji-btn-fill" />}
              </button>
            )
          })}
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
