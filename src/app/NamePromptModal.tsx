import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

interface Props {
  open: boolean
  /** If true a "skip" button is shown so the user can dismiss without entering a name */
  skippable?: boolean
  onSave: (name: string) => void
  onSkip?: () => void
}

export function NamePromptModal({ open, skippable, onSave, onSkip }: Props) {
  const [draft, setDraft] = useState('')
  const trimmed = draft.trim()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="name-modal__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="name-modal__panel"
            initial={{ scale: 0.88, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="name-modal__icon" aria-hidden="true">🂡</div>
            <h2 className="name-modal__title">Adın nedir?</h2>
            <p className="name-modal__sub">Rakiplerine göründüğü ad</p>
            <form className="name-modal__form" onSubmit={handleSubmit}>
              <input
                className="name-modal__input"
                type="text"
                maxLength={20}
                placeholder="Adını yaz…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="submit" className="name-modal__btn" disabled={!trimmed}>
                Oynamaya Başla
              </button>
              {skippable && onSkip && (
                <button type="button" className="name-modal__skip" onClick={onSkip}>
                  Şimdi değil
                </button>
              )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
