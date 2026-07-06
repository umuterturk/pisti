import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getLifetimeStats } from '../game/lifetimeStats'
import { Card } from './Card'
import { NewGameDialog } from './NewGameDialog'

interface StartScreenProps {
  open: boolean
  defaultBotId: string
  onStart: (botId: string) => void
}

export function StartScreen({ open, defaultBotId, onStart }: StartScreenProps) {
  const [stats, setStats] = useState(getLifetimeStats)
  const [pickerOpen, setPickerOpen] = useState(false)

  // The screen never unmounts (it's just hidden while a hand is in progress),
  // so re-read stats each time it's shown again to reflect hands played since.
  useEffect(() => {
    if (open) setStats(getLifetimeStats())
  }, [open])
  const winRate =
    stats.handsPlayed > 0 ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="home-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="home-hub">
            <div className="home-hub__cards" aria-hidden="true">
              <Card
                card={{ id: 'home-1', suit: 'clubs', rank: 'A' }}
                className="home-hub__card home-hub__card--1"
                width={72}
                height={100}
              />
              <Card
                card={{ id: 'home-2', suit: 'hearts', rank: '7' }}
                className="home-hub__card home-hub__card--2"
                width={72}
                height={100}
              />
              <Card
                card={{ id: 'home-3', suit: 'spades', rank: 'J' }}
                className="home-hub__card home-hub__card--3"
                width={72}
                height={100}
              />
            </div>

            <header className="home-hub__header">
              <div className="home-hub__title-wrap">
                <h1 className="home-hub__title">Pişti</h1>
                <div className="home-hub__title-glow" aria-hidden="true" />
              </div>
              <p className="home-hub__subtitle">Rakibini seç, kağıtları topla</p>
            </header>

            <div className="home-score-card">
              <div className="home-score-card__avatar" aria-hidden="true">
                🂡
              </div>
              <div className="home-score-card__main">
                <span className="home-score-card__label">KAZANMA ORANI</span>
                <span className="home-score-card__value">
                  {winRate !== null ? `%${winRate}` : '—'}
                </span>
              </div>
              <div className="home-score-card__aside">
                <span className="home-score-card__stat">
                  <strong>{stats.handsPlayed}</strong>
                  <em>EL</em>
                </span>
                <span className="home-score-card__stat">
                  <strong>{stats.bestWinStreak}</strong>
                  <em>EN İYİ SERİ</em>
                </span>
              </div>
            </div>

            <div className="home-play-zone">
              <button
                type="button"
                className="home-play-btn home-play-btn--solo"
                onClick={() => setPickerOpen(true)}
              >
                <span className="home-play-btn__shine" aria-hidden="true" />
                <span className="home-play-btn__text">Başla</span>
                <span className="home-play-btn__sub">Rakibini seç ve oyna</span>
              </button>
            </div>
          </div>

          <NewGameDialog
            open={pickerOpen}
            defaultBotId={defaultBotId}
            onStart={(botId) => {
              setPickerOpen(false)
              onStart(botId)
            }}
            onClose={() => setPickerOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
