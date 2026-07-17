import { useState } from 'react'
import type { FriendEntry, PlayerEntry } from '../ports'

interface FriendsPageProps {
  friends: FriendEntry[]
  otherPlayers: PlayerEntry[]
  loading: boolean
  invitingUid: string | null
  onInviteFriend: (friend: FriendEntry) => void
  onRemoveFriend: (uid: string) => void
  onAddFriend: (player: PlayerEntry) => Promise<void>
  onPlayWithFriend: () => void
}

function statusLabel(player: Pick<PlayerEntry, 'inMatch' | 'online'>): string {
  if (player.inMatch) return 'Oyunda'
  if (player.online) return 'Çevrimiçi'
  return 'Çevrimdışı'
}

function statusClass(player: Pick<PlayerEntry, 'inMatch' | 'online'>): string {
  if (player.inMatch) return 'friends-row__status--match'
  if (player.online) return 'friends-row__status--online'
  return 'friends-row__status--offline'
}

export function FriendsPage({
  friends,
  otherPlayers,
  loading,
  invitingUid,
  onInviteFriend,
  onRemoveFriend,
  onAddFriend,
  onPlayWithFriend,
}: FriendsPageProps) {
  const [confirmingUid, setConfirmingUid] = useState<string | null>(null)
  const [addingUid, setAddingUid] = useState<string | null>(null)

  return (
    <div className="home-friends-page">
      <h2 className="home-page-title">Arkadaşlar</h2>
      <p className="friends-hint">
        Çevrimiçi arkadaşlarını gör, skoru takip et ve oyuna davet et.
      </p>

      {loading ? (
        <div className="friends-empty">
          <p className="friends-empty__text">…</p>
        </div>
      ) : (
        <>
          {friends.length === 0 ? (
            <p className="friends-empty__text">Henüz arkadaşın yok.</p>
          ) : (
            <ul className="friends-list">
              {friends.map((friend) => {
              const inviting = invitingUid === friend.uid
              const confirming = confirmingUid === friend.uid
              return (
                <li key={friend.uid} className="friends-row">
                  <div className="friends-row__avatar-wrap">
                    <div className="friends-row__avatar" aria-hidden="true">
                      {(friend.name.trim().charAt(0) || '?').toUpperCase()}
                    </div>
                    <span
                      className={`friends-row__dot ${
                        friend.inMatch
                          ? 'friends-row__dot--match'
                          : friend.online
                            ? 'friends-row__dot--online'
                            : 'friends-row__dot--offline'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="friends-row__info">
                    <span className="friends-row__name">{friend.name}</span>
                    <span className={`friends-row__status ${statusClass(friend)}`}>
                      {statusLabel(friend)}
                    </span>
                    <span className="friends-row__record">
                      {friend.wins}G · {friend.losses}M · {friend.ties}B
                    </span>
                  </div>
                  {confirming ? (
                    <div className="friends-row__confirm">
                      <span className="friends-row__confirm-text">Silinsin mi?</span>
                      <button
                        type="button"
                        className="friends-row__confirm-yes"
                        onClick={() => {
                          setConfirmingUid(null)
                          onRemoveFriend(friend.uid)
                        }}
                      >
                        Sil
                      </button>
                      <button
                        type="button"
                        className="friends-row__confirm-no"
                        onClick={() => setConfirmingUid(null)}
                      >
                        Vazgeç
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="friends-row__invite"
                        disabled={inviting || invitingUid !== null || friend.inMatch}
                        onClick={() => onInviteFriend(friend)}
                      >
                        {inviting
                          ? 'Davet…'
                          : friend.inMatch
                            ? 'Oyunda'
                            : friend.online
                              ? 'Davet Et'
                              : 'Link'}
                      </button>
                      <button
                        type="button"
                        className="friends-row__remove"
                        aria-label={`${friend.name} arkadaşını sil`}
                        disabled={invitingUid !== null}
                        onClick={() => setConfirmingUid(friend.uid)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </>
                  )}
                </li>
              )
              })}
            </ul>
          )}
          <button
            type="button"
            className="friends-new-invite"
            onClick={onPlayWithFriend}
            disabled={invitingUid !== null}
          >
            + Yeni davet linki
          </button>

          <h3 className="friends-section-title">Diğer Oyuncular</h3>
          {otherPlayers.length === 0 ? (
            <p className="friends-empty__text">Başka oyuncu bulunamadı.</p>
          ) : (
            <ul className="friends-list">
              {otherPlayers.map((player) => (
                <li key={player.uid} className="friends-row">
                  <div className="friends-row__avatar-wrap">
                    <div className="friends-row__avatar" aria-hidden="true">
                      {(player.name.trim().charAt(0) || '?').toUpperCase()}
                    </div>
                    <span
                      className={`friends-row__dot ${
                        player.inMatch
                          ? 'friends-row__dot--match'
                          : player.online
                            ? 'friends-row__dot--online'
                            : 'friends-row__dot--offline'
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="friends-row__info">
                    <span className="friends-row__name">{player.name}</span>
                    <span className={`friends-row__status ${statusClass(player)}`}>
                      {statusLabel(player)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="friends-row__add"
                    disabled={addingUid !== null}
                    onClick={async () => {
                      setAddingUid(player.uid)
                      try {
                        await onAddFriend(player)
                      } finally {
                        setAddingUid(null)
                      }
                    }}
                  >
                    {addingUid === player.uid ? 'Ekleniyor…' : 'Ekle'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
