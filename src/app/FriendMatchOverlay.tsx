import { motion, AnimatePresence } from 'framer-motion'

type OverlayPhase = 'creating' | 'sharing' | 'waiting' | 'joining' | 'error'

interface Props {
  open: boolean
  phase: OverlayPhase
  inviteCopied: boolean
  /** When set, waiting is an in-app challenge (no share-link UI). */
  challengedName: string | null
  error: string | null
  onCancel: () => void
}

export function FriendMatchOverlay({
  open,
  phase,
  inviteCopied,
  challengedName,
  error,
  onCancel,
}: Props) {
  const showError = phase === 'error' || Boolean(error)
  const isChallenge = Boolean(challengedName)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="friend-overlay__backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="friend-overlay__panel"
            initial={{ scale: 0.9, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          >
            {showError ? (
              <>
                <div className="friend-overlay__error-icon" aria-hidden="true">
                  ✕
                </div>
                <p className="friend-overlay__label friend-overlay__label--error">
                  Katılamadın
                </p>
                <p className="friend-overlay__error">
                  {error ?? 'Bir sorun oluştu. Tekrar dene.'}
                </p>
              </>
            ) : phase === 'creating' || phase === 'sharing' || phase === 'joining' ? (
              <>
                <div className="friend-overlay__spinner" aria-hidden="true" />
                <p className="friend-overlay__label">
                  {phase === 'joining'
                    ? 'Odaya katılıyor…'
                    : phase === 'sharing'
                      ? 'Paylaşım açılıyor…'
                      : 'Oda hazırlanıyor…'}
                </p>
              </>
            ) : (
              <>
                {isChallenge ? (
                  <p className="friend-overlay__hint">
                    Davet <strong>{challengedName}</strong> adlı arkadaşına gönderildi.
                    Kabul etmesini bekle…
                  </p>
                ) : (
                  inviteCopied && (
                    <>
                      <p className="friend-overlay__copied">✓ Link kopyalandı</p>
                      <p className="friend-overlay__hint">
                        Linki WhatsApp, mesaj veya sohbet uygulamanıza yapıştırarak arkadaşınızı davet edin.
                      </p>
                    </>
                  )
                )}
                <div className="friend-overlay__waiting-anim" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="friend-overlay__label">
                  {isChallenge ? 'Cevap bekleniyor…' : 'Rakip bekleniyor…'}
                </p>
              </>
            )}

            <button
              type="button"
              className="friend-overlay__cancel"
              onClick={onCancel}
            >
              {showError ? 'Ana menü' : 'İptal'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
