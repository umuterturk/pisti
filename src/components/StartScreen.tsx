import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BOTS } from '../game/bots/registry'

interface StartScreenProps {
  open: boolean
  defaultBotId: string
  onStart: (botId: string) => void
}

export function StartScreen({ open, defaultBotId, onStart }: StartScreenProps) {
  const [selected, setSelected] = useState(defaultBotId)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="dialog picker"
            initial={{ scale: 0.88, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          >
            <div className="dialog__title">Pişti</div>
            <div className="dialog__message">Rakibini seç ve oyuna başla.</div>
            <div className="picker__list">
              {BOTS.map((bot) => (
                <button
                  key={bot.id}
                  className={`picker__item${bot.id === selected ? ' picker__item--active' : ''}`}
                  onClick={() => setSelected(bot.id)}
                >
                  <span className="picker__name">{bot.name}</span>
                  <span className="picker__diff">{bot.difficulty}</span>
                </button>
              ))}
            </div>
            <div className="dialog__actions">
              <button
                className="dialog__btn dialog__btn--start"
                onClick={() => onStart(selected)}
              >
                Başla
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
