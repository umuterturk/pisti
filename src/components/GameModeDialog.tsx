import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { track } from '../analytics'
import type { GameMode } from '../game/engine'

interface ModeOption {
  id: GameMode
  name: string
  tag: string
  blurb: string
}

const MODES: ModeOption[] = [
  {
    id: 'classic',
    name: 'Klasik Pişti',
    tag: 'KLASİK',
    blurb: 'Kartlar biter bitmez elinize yeniden 4\'er kart dağıtılır.',
  },
  {
    id: 'pisti4',
    name: 'Pişti4',
    tag: 'YENİ',
    blurb: 'Oynadığın her kartın yerine desteden anında yeni bir kart gelir. Elin hep 4 kart!',
  },
]

interface GameModeDialogProps {
  open: boolean
  onConfirm: (mode: GameMode) => void
  onClose: () => void
}

export function GameModeDialog({ open, onConfirm, onClose }: GameModeDialogProps) {
  const [selected, setSelected] = useState<GameMode>('classic')
  const selectedMode = MODES.find((m) => m.id === selected) ?? MODES[0]

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
            <div className="dialog__title">Oyun modu seç</div>
            <div className="dialog__message dialog__message--blurb">{selectedMode.blurb}</div>
            <div className="picker__list">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`picker__item${mode.id === selected ? ' picker__item--active' : ''}`}
                  onClick={() => {
                    setSelected(mode.id)
                    track('mode_select', { mode: mode.id, source: 'dialog' })
                  }}
                >
                  <span className="picker__name">{mode.name}</span>
                  <span className="picker__diff">{mode.tag}</span>
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
                onClick={() => onConfirm(selected)}
              >
                Devam
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
