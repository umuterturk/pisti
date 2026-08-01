import { memo, forwardRef } from 'react'

interface TeamScoreHudProps {
  biz: number
  onlar: number
  bizHandTotal?: number
  onlarHandTotal?: number
  /** Remaining cards in the deck. */
  deckCount?: number
  /** Current hand number within the match. */
  gameNumber?: number
  onLeave?: () => void
}

const TeamScoreHudComponent = forwardRef<HTMLDivElement, TeamScoreHudProps>(
  function TeamScoreHudComponent(
    { biz, onlar, bizHandTotal, onlarHandTotal, deckCount, gameNumber, onLeave },
    ref,
  ) {
    return (
      <div ref={ref} className="team-score-hud" aria-label="Takım skoru">
        <div className="team-score-hud__left">
          {gameNumber !== undefined && (
            <div className="team-score-hud__chip">
              <span className="team-score-hud__chip-label">El</span>
              <span className="team-score-hud__chip-value">{gameNumber}</span>
            </div>
          )}
          {deckCount !== undefined && (
            <div className="team-score-hud__chip team-score-hud__chip--deck">
              <span className="team-score-hud__chip-label">Deste</span>
              <span className="team-score-hud__chip-value">{deckCount}</span>
            </div>
          )}
        </div>

        <div className="team-score-hud__center">
          <div className="team-score-hud__match">
            <div className="team-score-hud__side team-score-hud__side--biz">
              <span className="team-score-hud__label">Biz</span>
              <span className="team-score-hud__games">{biz}</span>
              {bizHandTotal !== undefined && (
                <span className="team-score-hud__hand">{bizHandTotal}</span>
              )}
            </div>
            <span className="team-score-hud__sep" aria-hidden>
              –
            </span>
            <div className="team-score-hud__side team-score-hud__side--onlar">
              <span className="team-score-hud__label">Onlar</span>
              <span className="team-score-hud__games">{onlar}</span>
              {onlarHandTotal !== undefined && (
                <span className="team-score-hud__hand">{onlarHandTotal}</span>
              )}
            </div>
          </div>
        </div>

        <div className="team-score-hud__right">
          {onLeave && (
            <button
              type="button"
              className="team-score-hud__leave"
              onClick={onLeave}
              aria-label="Çekil"
            >
              Çekil
            </button>
          )}
        </div>
      </div>
    )
  },
)

export const TeamScoreHud = memo(TeamScoreHudComponent)
