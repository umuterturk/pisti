import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { vibrate, TAP } from '../game/haptics'

interface Props {
  open: boolean
  playerName: string
  opponentName: string
  games: { player: number; opponent: number }
  onComplete: () => void
}

type Beat = 3 | 2 | 1 | 'go'

const BEATS: { value: Beat; at: number }[] = [
  { value: 3, at: 0 },
  { value: 2, at: 850 },
  { value: 1, at: 1700 },
  { value: 'go', at: 2550 },
]

export function CountdownScreen({ open, playerName, opponentName, games, onComplete }: Props) {
  const [beat, setBeat] = useState<Beat>(3)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!open) {
      setBeat(3)
      return
    }

    setBeat(3)
    vibrate(TAP)

    const timers = [
      window.setTimeout(() => {
        setBeat(2)
        vibrate(TAP)
      }, BEATS[1].at),
      window.setTimeout(() => {
        setBeat(1)
        vibrate(TAP)
      }, BEATS[2].at),
      window.setTimeout(() => {
        setBeat('go')
        vibrate([40, 30, 50])
      }, BEATS[3].at),
      window.setTimeout(() => onCompleteRef.current(), 3400),
    ]

    return () => {
      for (const t of timers) window.clearTimeout(t)
    }
  }, [open])

  const youInitial = (playerName.trim().charAt(0) || '?').toUpperCase()
  const oppInitial = (opponentName.trim().charAt(0) || '?').toUpperCase()
  const isRematch = games.player > 0 || games.opponent > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="countdown"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.25 }}
        >
          <div className="countdown__felt" aria-hidden="true" />
          <div className="countdown__vignette" aria-hidden="true" />

          {/* Decorative floating cards */}
          <div className="countdown__cards" aria-hidden="true">
            <span className="countdown__card countdown__card--1">♠</span>
            <span className="countdown__card countdown__card--2">♥</span>
            <span className="countdown__card countdown__card--3">♦</span>
            <span className="countdown__card countdown__card--4">♣</span>
          </div>

          <div className="countdown__stage">
            <motion.p
              className="countdown__eyebrow"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {isRematch ? 'RÖVANŞ' : 'MAÇ BAŞLIYOR'}
            </motion.p>

            {/* VS fighters */}
            <div className="countdown__vs-row">
              <motion.div
                className="countdown__fighter countdown__fighter--you"
                initial={{ x: -80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
              >
                <div className="countdown__portrait countdown__portrait--you">
                  <span>{youInitial}</span>
                  <div className="countdown__portrait-ring" />
                </div>
                <div className="countdown__fighter-meta">
                  <span className="countdown__tag">SEN</span>
                  <span className="countdown__name">{playerName}</span>
                  <span className="countdown__wins">{games.player}</span>
                </div>
              </motion.div>

              <motion.div
                className="countdown__vs-badge"
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: -8 }}
                transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.2 }}
              >
                VS
              </motion.div>

              <motion.div
                className="countdown__fighter countdown__fighter--opp"
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
              >
                <div className="countdown__fighter-meta countdown__fighter-meta--opp">
                  <span className="countdown__tag">RAKİP</span>
                  <span className="countdown__name">{opponentName}</span>
                  <span className="countdown__wins">{games.opponent}</span>
                </div>
                <div className="countdown__portrait countdown__portrait--opp">
                  <span>{oppInitial}</span>
                  <div className="countdown__portrait-ring" />
                </div>
              </motion.div>
            </div>

            {/* Slam countdown */}
            <div className="countdown__slam">
              <AnimatePresence mode="wait">
                <motion.div
                  key={String(beat)}
                  className={`countdown__beat${beat === 'go' ? ' countdown__beat--go' : ''}`}
                  initial={{ scale: 2.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.55, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                >
                  {beat === 'go' ? 'BAŞLA!' : beat}
                </motion.div>
              </AnimatePresence>
              <div className="countdown__slam-glow" aria-hidden="true" />
            </div>

            <motion.p
              className="countdown__hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={{ delay: 0.35 }}
            >
              Kartlar dağılıyor…
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
