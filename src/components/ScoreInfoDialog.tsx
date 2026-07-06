import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Card } from '../game/cards'
import { scoreBreakdown, type ScoreBreakdownKind } from '../game/rules'
import { CountUp } from './GameOver'

interface ScoreInfoDialogProps {
  open: boolean
  name: string
  cards: Card[]
  pistiCount: number
  doublePistiCount: number
  onClose: () => void
}

const KIND_CLASS: Record<ScoreBreakdownKind, string> = {
  doublePisti: 'double-pisti',
  pisti: 'pisti',
  twoClubs: 'two-clubs',
  tenDiamonds: 'ten-diamonds',
  other: 'other',
}

const KIND_BADGE: Record<ScoreBreakdownKind, string> = {
  doublePisti: 'ÇP',
  pisti: 'P',
  twoClubs: '2♣',
  tenDiamonds: '10♦',
  other: '+',
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
}

export function ScoreInfoDialog({
  open,
  name,
  cards,
  pistiCount,
  doublePistiCount,
  onClose,
}: ScoreInfoDialogProps) {
  const { items, total } = useMemo(
    () => scoreBreakdown(cards, pistiCount, doublePistiCount),
    [cards, pistiCount, doublePistiCount],
  )
  const initial = name.charAt(0).toUpperCase()

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
            className="dialog score-info"
            initial={{ scale: 0.88, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="score-info__header">
              <div className="score-info__avatar">{initial}</div>
              <div className="score-info__name">{name}</div>
              <div className="score-info__total">
                <span className="score-info__total-value">
                  <CountUp value={total} />
                </span>
                <span className="score-info__total-label">puan</span>
              </div>
            </div>

            {items.length > 0 ? (
              <motion.ul
                className="score-info__list"
                variants={listVariants}
                initial="hidden"
                animate="show"
              >
                {items.map((item) => (
                  <motion.li
                    key={item.label}
                    className={`score-info__row score-info__row--${KIND_CLASS[item.kind]}`}
                    variants={rowVariants}
                  >
                    <span className="score-info__badge">{KIND_BADGE[item.kind]}</span>
                    <span className="score-info__label">{item.label}</span>
                    <span className="score-info__value">+{item.points}</span>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <div className="dialog__message">Henüz puan yok.</div>
            )}

            <div className="dialog__actions">
              <button className="dialog__btn dialog__btn--start" onClick={onClose}>
                Tamam
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
