interface HudProps {
  name: string
  score: number
  pisti: number
  cards: number
  active: boolean
  side: 'top' | 'bottom'
}

export function Hud({ name, score, pisti, cards, active, side }: HudProps) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div className={`hud hud--${side} ${active ? 'hud--active' : ''}`}>
      <div className="hud__id">
        <div className="hud__avatar">{initial}</div>
        <div className="hud__name">
          {name}
          {active && <span className="hud__turn-dot" />}
        </div>
      </div>
      <div className="hud__stats">
        <div className="hud__stat">
          <span className="hud__stat-val">{score}</span>
          <span className="hud__stat-label">Puan</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-val">{pisti}</span>
          <span className="hud__stat-label">Pişti</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-val">{cards}</span>
          <span className="hud__stat-label">Kart</span>
        </div>
      </div>
    </div>
  )
}
