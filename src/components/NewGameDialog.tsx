import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { track } from '../analytics'
import { BOTS } from '../game/bots/registry'

export type PlayFormat = '1v1' | '2v2'

interface NewGameDialogProps {
  open: boolean
  defaultBotId: string
  onStart: (botId: string, format: PlayFormat) => void
  onClose: () => void
}

export function NewGameDialog({ open, defaultBotId, onStart, onClose }: NewGameDialogProps) {
  const [selected, setSelected] = useState(defaultBotId)
  const [format, setFormat] = useState<PlayFormat>('1v1')
  const selectedBot = BOTS.find((bot) => bot.id === selected) ?? BOTS[0]

  useEffect(() => {
    if (!open) return
    setSelected(defaultBotId)
    setFormat('1v1')
  }, [open, defaultBotId])

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
            <div className="dialog__title">Yeni oyun</div>

            <div className="picker__format" role="group" aria-label="Oyun formatı">
              <button
                type="button"
                className={`picker__format-btn${format === '1v1' ? ' picker__format-btn--active' : ''}`}
                onClick={() => setFormat('1v1')}
              >
                1&#39;e 1
              </button>
              <button
                type="button"
                className={`picker__format-btn${format === '2v2' ? ' picker__format-btn--active' : ''}`}
                onClick={() => setFormat('2v2')}
              >
                2&#39;ye 2
              </button>
            </div>

            <div className="dialog__message dialog__message--blurb">
              {format === '2v2'
                ? 'Rakipler seçtiğin zorlukta; partnerin rastgele.'
                : selectedBot.blurb}
            </div>
            <div className="picker__list">
              {BOTS.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  className={`picker__item${bot.id === selected ? ' picker__item--active' : ''}`}
                  onClick={() => {
                    setSelected(bot.id)
                    track('bot_select', {
                      bot_id: bot.id,
                      difficulty: bot.difficulty,
                      source: 'home',
                      format,
                    })
                  }}
                >
                  <span className="picker__name">{bot.name}</span>
                  <span className="picker__diff">{bot.difficulty}</span>
                </button>
              ))}
            </div>
            <div className="dialog__actions">
              <button type="button" className="dialog__btn dialog__btn--ghost" onClick={onClose}>
                Vazgeç
              </button>
              <button
                type="button"
                className="dialog__btn dialog__btn--start"
                onClick={() => onStart(selected, format)}
              >
                Oyna
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
