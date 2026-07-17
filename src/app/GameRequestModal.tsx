import { motion, AnimatePresence } from 'framer-motion'
import type { GameRequest } from '../ports'

interface Props {
  request: GameRequest
  onAccept: () => void
  onDecline: () => void
}

export function GameRequestModal({ request, onAccept, onDecline }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        className="game-request__backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="presentation"
      >
        <motion.div
          className="game-request__panel"
          role="dialog"
          aria-labelledby="game-request-title"
          initial={{ scale: 0.9, y: 28, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="game-request__badge" aria-hidden="true">
            ♠
          </div>
          <h2 id="game-request-title" className="game-request__title">
            Oyun Daveti
          </h2>
          <p className="game-request__message">
            <strong>{request.fromName}</strong> seni Pişti oynamaya davet ediyor.
          </p>
          <div className="game-request__actions">
            <button type="button" className="game-request__decline" onClick={onDecline}>
              Reddet
            </button>
            <button type="button" className="game-request__accept" onClick={onAccept}>
              Katıl
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
