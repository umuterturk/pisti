import { AnimatePresence, motion } from 'framer-motion'
import { track } from '../analytics'
import { BOTS } from '../game/bots/registry'

interface OpponentPickerProps {
  open: boolean
  activeBotId: string
  onSelect: (botId: string) => void
  onClose: () => void
}

export function OpponentPicker({ open, activeBotId, onSelect, onClose }: OpponentPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="dialog picker"
            initial={{ scale: 0.88, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog__title">Rakip seç</div>
            <div className="dialog__message">Yeni bir maç bu rakibe karşı başlar.</div>
            <div className="picker__list">
              {BOTS.map((bot) => (
                <button
                  key={bot.id}
                  className={`picker__item${bot.id === activeBotId ? ' picker__item--active' : ''}`}
                  onClick={() => {
                    track('bot_select', {
                      bot_id: bot.id,
                      difficulty: bot.difficulty,
                      source: 'in_game',
                    })
                    onSelect(bot.id)
                  }}
                >
                  <span className="picker__name">{bot.name}</span>
                  <span className="picker__diff">{bot.difficulty}</span>
                </button>
              ))}
            </div>
            <div className="dialog__actions">
              <button className="dialog__btn dialog__btn--ghost" onClick={onClose}>
                Kapat
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
