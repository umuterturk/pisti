import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Card } from '../components/Card'

const ICON_CARD = { id: 'name-icon', suit: 'hearts' as const, rank: 'A' as const }

interface Props {
  open: boolean
  /** Prefills the input when opening to edit an existing name */
  initialName?: string
  onSave: (name: string) => void
}

export function NamePromptModal({ open, initialName = '', onSave }: Props) {
  const [draft, setDraft] = useState(initialName)
  const trimmed = draft.trim()

  useEffect(() => {
    if (open) setDraft(initialName)
  }, [open, initialName])

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
            <div className="name-modal__icon" aria-hidden="true">
              <Card card={ICON_CARD} width={44} height={62} />
            </div>
            <h2 className="name-modal__title">Adın nedir?</h2>
            <p className="name-modal__sub">Masada seni böyle tanıyacaklar</p>
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
                Tamam
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
