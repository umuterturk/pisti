import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getLifetimeStats } from '../game/lifetimeStats'
import type { RefreshFriendsOpts } from '../app/useFriends'
import type { FriendEntry, PlayerEntry } from '../ports'
import { Card } from './Card'
import { FriendsPage } from './FriendsPage'
import { NewGameDialog } from './NewGameDialog'

const FRIENDS_TAB_STALE_MS = 60_000

interface StartScreenProps {
  open: boolean
  defaultBotId: string
  username: string
  friends: FriendEntry[]
  otherPlayers: PlayerEntry[]
  friendsLoading: boolean
  invitingUid: string | null
  onStart: (botId: string) => void
  onPlayWithFriend: () => void
  onInviteFriend: (friend: FriendEntry) => void
  onRemoveFriend: (uid: string) => void
  onAddFriend: (player: PlayerEntry) => Promise<void>
  onEditName: () => void
  onRefreshFriends: (opts?: RefreshFriendsOpts) => void | Promise<void>
}

type HomePage = 'home' | 'friends'

function NavIconHome() {
  return (
    <svg className="home-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function NavIconFriends() {
  return (
    <svg className="home-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 19a4 4 0 0 1 8 0H3Zm10 0h8a3 3 0 0 0-6 0Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function StartScreen({
  open,
  defaultBotId,
  username,
  friends,
  otherPlayers,
  friendsLoading,
  invitingUid,
  onStart,
  onPlayWithFriend,
  onInviteFriend,
  onRemoveFriend,
  onAddFriend,
  onEditName,
  onRefreshFriends,
}: StartScreenProps) {
  const [stats, setStats] = useState(getLifetimeStats)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activePage, setActivePage] = useState<HomePage>('home')

  useEffect(() => {
    if (open) {
      setStats(getLifetimeStats())
      setActivePage('home')
    }
  }, [open])

  useEffect(() => {
    if (!open || activePage !== 'friends') return
    void onRefreshFriends({ silent: true, maxAgeMs: FRIENDS_TAB_STALE_MS })
  }, [open, activePage, onRefreshFriends])

  const winRate =
    stats.handsPlayed > 0 ? Math.round((stats.handsWon / stats.handsPlayed) * 100) : null

  const displayName = username.trim()
  const avatarLetter = displayName ? displayName.charAt(0).toUpperCase() : '?'

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="home-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="home-profile-btn"
            onClick={onEditName}
            aria-label="Profili düzenle"
          >
            <span className="home-profile-btn__avatar">{avatarLetter}</span>
            <span className="home-profile-btn__name">{displayName || 'Giriş yap'}</span>
            <span className="home-profile-btn__edit" aria-hidden="true">✎</span>
          </button>

          <div className={`home-page${activePage === 'home' ? ' home-page--home' : ''}`}>
            {activePage === 'home' ? (
              <div className="home-hub">
                <div className="home-hub__cards" aria-hidden="true">
                  <Card
                    card={{ id: 'home-1', suit: 'clubs', rank: '2' }}
                    className="home-hub__card home-hub__card--1"
                    width={72}
                    height={100}
                  />
                  <Card
                    card={{ id: 'home-2', suit: 'diamonds', rank: '10' }}
                    className="home-hub__card home-hub__card--2"
                    width={72}
                    height={100}
                  />
                  <Card
                    card={{ id: 'home-3', suit: 'spades', rank: 'J' }}
                    className="home-hub__card home-hub__card--3"
                    width={72}
                    height={100}
                  />
                </div>

                <header className="home-hub__header">
                  <div className="home-hub__title-wrap">
                    <h1 className="home-hub__title">Pişti</h1>
                    <div className="home-hub__title-glow" aria-hidden="true" />
                  </div>
                  <p className="home-hub__subtitle">Rakibini seç, kağıtları topla</p>
                </header>

                <div className="home-score-card">
                  <div className="home-score-card__avatar" aria-hidden="true">
                    🂡
                  </div>
                  <div className="home-score-card__main">
                    <span className="home-score-card__label">KAZANMA ORANI</span>
                    <span className="home-score-card__value">
                      {winRate !== null ? `%${winRate}` : '—'}
                    </span>
                  </div>
                  <div className="home-score-card__aside">
                    <span className="home-score-card__stat">
                      <strong>{stats.handsPlayed}</strong>
                      <em>EL</em>
                    </span>
                    <span className="home-score-card__stat">
                      <strong>{stats.bestWinStreak}</strong>
                      <em>EN İYİ SERİ</em>
                    </span>
                  </div>
                </div>

                <div className="home-play-zone">
                  <button
                    type="button"
                    className="home-play-btn home-play-btn--solo"
                    onClick={() => setPickerOpen(true)}
                  >
                    <span className="home-play-btn__shine" aria-hidden="true" />
                    <span className="home-play-btn__text">Yapay Zekayla Oyna</span>
                    <span className="home-play-btn__sub">Rakibini seç ve oyna</span>
                  </button>

                  <button
                    type="button"
                    className="home-play-btn home-play-btn--friend"
                    onClick={onPlayWithFriend}
                  >
                    <span className="home-play-btn__shine" aria-hidden="true" />
                    <span className="home-play-btn__text">Arkadaşınla Oyna</span>
                    <span className="home-play-btn__sub">Davet linki oluştur</span>
                  </button>
                </div>
              </div>
            ) : (
              <FriendsPage
                friends={friends}
                otherPlayers={otherPlayers}
                loading={friendsLoading}
                invitingUid={invitingUid}
                onInviteFriend={onInviteFriend}
                onRemoveFriend={onRemoveFriend}
                onAddFriend={onAddFriend}
                onPlayWithFriend={onPlayWithFriend}
                onRefresh={() => onRefreshFriends({ silent: true })}
              />
            )}
          </div>

          <nav className="home-nav" aria-label="Ana menü">
            <button
              type="button"
              className={`home-nav__item ${activePage === 'home' ? 'home-nav__item--active' : ''}`}
              aria-current={activePage === 'home' ? 'page' : undefined}
              onClick={() => setActivePage('home')}
            >
              <NavIconHome />
              <span className="home-nav__label">Ana Sayfa</span>
            </button>
            <button
              type="button"
              className={`home-nav__item ${activePage === 'friends' ? 'home-nav__item--active' : ''}`}
              aria-current={activePage === 'friends' ? 'page' : undefined}
              onClick={() => setActivePage('friends')}
            >
              <NavIconFriends />
              <span className="home-nav__label">Arkadaşlar</span>
            </button>
          </nav>

          <NewGameDialog
            open={pickerOpen}
            defaultBotId={defaultBotId}
            onStart={(botId) => {
              setPickerOpen(false)
              onStart(botId)
            }}
            onClose={() => setPickerOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
