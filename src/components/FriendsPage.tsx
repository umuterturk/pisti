import type { FriendEntry } from '../ports'

interface FriendsPageProps {
  friends: FriendEntry[]
  loading: boolean
  invitingUid: string | null
  onInviteFriend: (friend: FriendEntry) => void
  onPlayWithFriend: () => void
}

function statusLabel(friend: FriendEntry): string {
  if (friend.inMatch) return 'Oyunda'
  if (friend.online) return 'Çevrimiçi'
  return 'Çevrimdışı'
}

function statusClass(friend: FriendEntry): string {
  if (friend.inMatch) return 'friends-row__status--match'
  if (friend.online) return 'friends-row__status--online'
  return 'friends-row__status--offline'
}

export function FriendsPage({
  friends,
  loading,
  invitingUid,
  onInviteFriend,
  onPlayWithFriend,
}: FriendsPageProps) {
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
      ) : friends.length === 0 ? (
        <div className="friends-empty">
          <p className="friends-empty__text">
            Henüz arkadaşın yok. Davet linki ile oyna — maçtan sonra burada görünür.
          </p>
          <button
            type="button"
            className="home-play-btn home-play-btn--friend friends-empty__cta"
            onClick={onPlayWithFriend}
          >
            <span className="home-play-btn__shine" aria-hidden="true" />
            <span className="home-play-btn__text">Arkadaşınla Oyna</span>
            <span className="home-play-btn__sub">Davet linki oluştur</span>
          </button>
        </div>
      ) : (
        <>
          <ul className="friends-list">
            {friends.map((friend) => {
              const inviting = invitingUid === friend.uid
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
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="friends-new-invite"
            onClick={onPlayWithFriend}
            disabled={invitingUid !== null}
          >
            + Yeni davet linki
          </button>
        </>
      )}
    </div>
  )
}
