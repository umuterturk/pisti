import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  query,
  where,
  limit,
  Timestamp,
  type Timestamp as TimestampType,
} from 'firebase/firestore'
import {
  ensureAnonymousAuth,
  getFirebaseDb,
  FRIEND_RIVALS_COLLECTION,
  GAME_REQUESTS_COLLECTION,
  GAME_REQUEST_TTL_MS,
  USERS_COLLECTION,
} from '../firebase/config'
import { friendRivalPairId, orderedUids } from '../friends/pairId'
import type {
  FriendEntry,
  FriendsPort,
  GameRequest,
  GameRequestStatus,
  PlayerEntry,
  RivalryStats,
  UserLifetimeStats,
} from '../ports'

/** Consider online if lastSeen within this window (heartbeat is 30s). */
const ONLINE_MS = 90_000

function isLocalhostClient(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

function effectiveInMatch(profile: UserDoc, online: boolean): boolean {
  // inMatch can stick after a tab-kill; only trust it while the client is still heartbeating.
  return profile.inMatch === true && online
}

interface UserDoc {
  displayName?: string
  handsWon?: number
  handsPlayed?: number
  updatedAt?: unknown
  lastSeenAt?: TimestampType | number | null
  inMatch?: boolean
  currentMatchId?: string | null
  /** Set when the account has played from localhost; sticky once true. */
  isTest?: boolean
}

interface FriendDoc {
  name: string
  addedAt: number
  lastPlayedAt?: number | TimestampType | null
}

interface FriendRivalDoc {
  uids: [string, string]
  wins: Record<string, number>
  ties: number
  lastMatchAt?: unknown
  lastMatchId?: string
  /** Winner of the latest recorded game; null when it was a tie. */
  lastWinnerUid?: string | null
  /** Who led (played first in) the latest recorded game. */
  lastStarterUid?: string | null
}

interface GameRequestDoc {
  fromUid: string
  fromName: string
  toUid: string
  matchId: string
  inviteCode: string
  status: GameRequestStatus
  createdAt: unknown
  expiresAt: unknown
}

function timestampToMs(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    return (value as TimestampType).toMillis()
  }
  return undefined
}

function parseGameRequest(id: string, data: GameRequestDoc): GameRequest | null {
  const createdAt = timestampToMs(data.createdAt) ?? 0
  const expiresAt = timestampToMs(data.expiresAt) ?? createdAt + GAME_REQUEST_TTL_MS
  if (Date.now() > expiresAt) return null
  if (data.status !== 'pending') return null

  return {
    id,
    fromUid: data.fromUid,
    fromName: data.fromName,
    toUid: data.toUid,
    matchId: data.matchId,
    inviteCode: data.inviteCode,
    status: data.status,
    createdAt,
  }
}

export class FirebaseFriendsAdapter implements FriendsPort {
  private localUid: string | null = null
  private displayName = ''
  private requestUnsubscribe: (() => void) | null = null
  /** Cached: whether the local account is a test player (localhost or sticky flag). */
  private localIsTest: boolean | null = null

  private async getUid(): Promise<string> {
    if (!this.localUid) {
      this.localUid = await ensureAnonymousAuth()
    }
    return this.localUid
  }

  /** Real players must not see test accounts; test players see everyone. */
  private async amITest(): Promise<boolean> {
    if (isLocalhostClient()) {
      this.localIsTest = true
      return true
    }
    if (this.localIsTest != null) return this.localIsTest
    try {
      const uid = await this.getUid()
      const snap = await getDoc(this.userRef(uid))
      this.localIsTest = snap.exists() && (snap.data() as UserDoc).isTest === true
    } catch {
      this.localIsTest = false
    }
    return this.localIsTest
  }

  private userRef(uid: string) {
    return doc(getFirebaseDb(), USERS_COLLECTION, uid)
  }

  private friendRef(uid: string, friendUid: string) {
    return doc(getFirebaseDb(), USERS_COLLECTION, uid, 'friends', friendUid)
  }

  private rivalRef(uidA: string, uidB: string) {
    return doc(getFirebaseDb(), FRIEND_RIVALS_COLLECTION, friendRivalPairId(uidA, uidB))
  }

  private async resolveDisplayName(uid: string, fallback?: string): Promise<string> {
    try {
      const profileSnap = await getDoc(this.userRef(uid))
      if (profileSnap.exists()) {
        const profileName = (profileSnap.data() as UserDoc).displayName?.trim()
        if (profileName) return profileName
      }
    } catch {
      // Use fallback
    }
    const trimmed = fallback?.trim()
    if (trimmed) return trimmed
    return `Oyuncu ${uid.slice(-4).toUpperCase()}`
  }

  async syncProfile(displayName: string): Promise<void> {
    const uid = await this.getUid()
    this.displayName = displayName.trim()
    const patch: Record<string, unknown> = {
      displayName: this.displayName || `Oyuncu ${uid.slice(-4).toUpperCase()}`,
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      // Do not touch inMatch here — useUserPresence owns that field
    }
    // Sticky: once you've played from localhost you're marked test forever.
    if (isLocalhostClient()) {
      patch.isTest = true
      this.localIsTest = true
    }
    await setDoc(this.userRef(uid), patch, { merge: true })
  }

  async setPresence(inMatch: boolean, matchId?: string): Promise<void> {
    const uid = await this.getUid()
    await setDoc(
      this.userRef(uid),
      {
        lastSeenAt: serverTimestamp(),
        inMatch,
        currentMatchId: inMatch && matchId ? matchId : null,
      },
      { merge: true },
    )
  }

  async syncLifetimeStats(stats: UserLifetimeStats): Promise<void> {
    const uid = await this.getUid()
    await setDoc(
      this.userRef(uid),
      {
        handsWon: stats.handsWon,
        handsPlayed: stats.handsPlayed,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  async getUserStats(uid: string): Promise<UserLifetimeStats | null> {
    try {
      const snap = await getDoc(this.userRef(uid))
      if (!snap.exists()) return null
      const data = snap.data() as UserDoc
      return {
        handsWon: data.handsWon ?? 0,
        handsPlayed: data.handsPlayed ?? 0,
      }
    } catch {
      return null
    }
  }

  async getRivalry(opponentUid: string): Promise<RivalryStats | null> {
    const uid = await this.getUid()
    if (uid === opponentUid) return null
    try {
      const snap = await getDoc(this.rivalRef(uid, opponentUid))
      if (!snap.exists()) return null
      const rival = snap.data() as FriendRivalDoc
      return {
        wins: rival.wins[uid] ?? 0,
        losses: rival.wins[opponentUid] ?? 0,
        ties: rival.ties ?? 0,
      }
    } catch {
      return null
    }
  }

  async addFriend(uid: string, name: string): Promise<void> {
    const myUid = await this.getUid()
    if (myUid === uid) return

    const resolvedName = await this.resolveDisplayName(uid, name)

    await setDoc(this.friendRef(myUid, uid), {
      name: resolvedName,
      addedAt: Date.now(),
    } satisfies FriendDoc)
  }

  async removeFriend(uid: string): Promise<void> {
    const myUid = await this.getUid()
    if (myUid === uid) return
    // Delete both directions so neither side keeps a one-way friendship.
    await Promise.all([
      deleteDoc(this.friendRef(myUid, uid)),
      deleteDoc(this.friendRef(uid, myUid)),
    ])
  }

  async isFriend(uid: string): Promise<boolean> {
    const myUid = await this.getUid()
    try {
      const snap = await getDoc(this.friendRef(myUid, uid))
      return snap.exists()
    } catch {
      return false
    }
  }

  async listFriends(): Promise<FriendEntry[]> {
    const myUid = await this.getUid()
    const hideTest = !(await this.amITest())
    const snap = await getDocs(collection(getFirebaseDb(), USERS_COLLECTION, myUid, 'friends'))
    const now = Date.now()

    const entries = (
      await Promise.all(
        snap.docs.map(async (d): Promise<FriendEntry | null> => {
          const friendUid = d.id
          const data = d.data() as FriendDoc

          let name = data.name?.trim() || `Oyuncu ${friendUid.slice(-4).toUpperCase()}`
          let online = false
          let inMatch = false
          let isTest = false
          let wins = 0
          let losses = 0
          let ties = 0

          // Profile + rival reads are best-effort — don't blank the whole list on one denial
          try {
            const profileSnap = await getDoc(this.userRef(friendUid))
            if (profileSnap.exists()) {
              const profile = profileSnap.data() as UserDoc
              const profileName = profile.displayName?.trim()
              if (profileName) name = profileName
              const lastSeen = timestampToMs(profile.lastSeenAt)
              online = lastSeen != null && now - lastSeen < ONLINE_MS
              inMatch = effectiveInMatch(profile, online)
              isTest = profile.isTest === true
            }
          } catch {
            // Keep cached friend name / offline defaults
          }

          if (hideTest && isTest) return null

          if (name !== data.name) {
            void setDoc(this.friendRef(myUid, friendUid), { name }, { merge: true })
          }

          try {
            const rivalSnap = await getDoc(this.rivalRef(myUid, friendUid))
            if (rivalSnap.exists()) {
              const rival = rivalSnap.data() as FriendRivalDoc
              wins = rival.wins[myUid] ?? 0
              losses = rival.wins[friendUid] ?? 0
              ties = rival.ties ?? 0
            }
          } catch {
            // Rivals collection may be unavailable until rules are deployed
          }

          const entry: FriendEntry = {
            uid: friendUid,
            name,
            addedAt: data.addedAt ?? 0,
            wins,
            losses,
            ties,
            online,
            inMatch,
            lastPlayedAt: timestampToMs(data.lastPlayedAt),
          }
          return entry
        }),
      )
    ).filter((entry): entry is FriendEntry => entry !== null)

    entries.sort((a, b) => {
      const rank = (f: FriendEntry) => (f.inMatch ? 2 : f.online ? 1 : 0)
      const rankDiff = rank(b) - rank(a)
      if (rankDiff !== 0) return rankDiff
      const timeDiff = (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)
      if (timeDiff !== 0) return timeDiff
      return a.name.localeCompare(b.name, 'tr')
    })

    return entries
  }

  async listOtherPlayers(): Promise<PlayerEntry[]> {
    const myUid = await this.getUid()
    const hideTest = !(await this.amITest())
    const [usersSnap, friendsSnap] = await Promise.all([
      getDocs(collection(getFirebaseDb(), USERS_COLLECTION)),
      getDocs(collection(getFirebaseDb(), USERS_COLLECTION, myUid, 'friends')),
    ])
    const friendUids = new Set(friendsSnap.docs.map((friend) => friend.id))
    const now = Date.now()

    return usersSnap.docs
      .filter((user) => {
        if (user.id === myUid || friendUids.has(user.id)) return false
        if (hideTest && (user.data() as UserDoc).isTest === true) return false
        return true
      })
      .map((user) => {
        const profile = user.data() as UserDoc
        const lastSeen = timestampToMs(profile.lastSeenAt)
        const online = lastSeen != null && now - lastSeen < ONLINE_MS
        return {
          uid: user.id,
          name: profile.displayName?.trim() || `Oyuncu ${user.id.slice(-4).toUpperCase()}`,
          online,
          inMatch: effectiveInMatch(profile, online),
        }
      })
      .sort((a, b) => {
        const rank = (player: PlayerEntry) => (player.inMatch ? 2 : player.online ? 1 : 0)
        return rank(b) - rank(a) || a.name.localeCompare(b.name, 'tr')
      })
  }

  async recordMatchResult(
    opponentUid: string,
    opponentName: string,
    result: 'win' | 'lose' | 'tie',
    resultId?: string,
    starterUid?: string | null,
  ): Promise<void> {
    const uid = await this.getUid()
    if (uid === opponentUid) return

    const alreadyFriend = await this.isFriend(opponentUid)
    if (!alreadyFriend) return

    const resolvedName = await this.resolveDisplayName(opponentUid, opponentName)
    const [uidA, uidB] = orderedUids(uid, opponentUid)
    const rivalRef = this.rivalRef(uid, opponentUid)
    const now = serverTimestamp()

    await runTransaction(getFirebaseDb(), async (tx) => {
      const snap = await tx.get(rivalRef)
      if (resultId && snap.exists()) {
        const existing = snap.data() as FriendRivalDoc
        if (existing.lastMatchId === resultId) return
      }

      const wins: Record<string, number> = snap.exists()
        ? { ...(snap.data() as FriendRivalDoc).wins }
        : { [uidA]: 0, [uidB]: 0 }
      let ties = snap.exists() ? ((snap.data() as FriendRivalDoc).ties ?? 0) : 0

      if (result === 'tie') {
        ties += 1
      } else if (result === 'win') {
        wins[uid] = (wins[uid] ?? 0) + 1
      } else {
        wins[opponentUid] = (wins[opponentUid] ?? 0) + 1
      }

      // Both clients compute identical values here (winner side writes its own
      // uid, loser side writes opponentUid — same player), and the lastMatchId
      // dedupe above means only the first writer lands, so the "latest game"
      // fields can never diverge between the two clients.
      const lastWinnerUid =
        result === 'tie' ? null : result === 'win' ? uid : opponentUid

      tx.set(
        rivalRef,
        {
          uids: [uidA, uidB],
          wins,
          ties,
          lastMatchAt: now,
          lastWinnerUid,
          ...(starterUid !== undefined ? { lastStarterUid: starterUid } : {}),
          ...(resultId ? { lastMatchId: resultId } : {}),
        },
        { merge: true },
      )

      tx.set(
        this.friendRef(uid, opponentUid),
        { name: resolvedName, lastPlayedAt: Date.now() },
        { merge: true },
      )
    }).catch((err) => {
      console.warn('[Friends] recordMatchResult failed:', err)
    })
  }

  async sendGameRequest(
    toUid: string,
    matchId: string,
    inviteCode: string,
  ): Promise<GameRequest> {
    const fromUid = await this.getUid()
    const fromName =
      this.displayName.trim() || `Oyuncu ${fromUid.slice(-4).toUpperCase()}`
    const expiresAt = Timestamp.fromMillis(Date.now() + GAME_REQUEST_TTL_MS)

    const ref = doc(collection(getFirebaseDb(), GAME_REQUESTS_COLLECTION))
    await setDoc(ref, {
      fromUid,
      fromName,
      toUid,
      matchId,
      inviteCode,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
      expiresAt,
    })

    return {
      id: ref.id,
      fromUid,
      fromName,
      toUid,
      matchId,
      inviteCode,
      status: 'pending',
      createdAt: Date.now(),
    }
  }

  subscribeIncomingRequests(handler: (request: GameRequest | null) => void): () => void {
    let active = true

    void this.getUid().then((uid) => {
      if (!active) return

      const q = query(
        collection(getFirebaseDb(), GAME_REQUESTS_COLLECTION),
        where('toUid', '==', uid),
        where('status', '==', 'pending'),
        limit(10),
      )

      this.requestUnsubscribe = onSnapshot(
        q,
        (snap) => {
          if (snap.empty) {
            handler(null)
            return
          }
          const pending = snap.docs
            .map((docSnap) => parseGameRequest(docSnap.id, docSnap.data() as GameRequestDoc))
            .filter((req): req is GameRequest => req !== null)
            .sort((a, b) => b.createdAt - a.createdAt)
          handler(pending[0] ?? null)
        },
        (err) => {
          console.warn('[Friends] incoming request listener:', err)
          handler(null)
        },
      )
    })

    return () => {
      active = false
      this.requestUnsubscribe?.()
      this.requestUnsubscribe = null
    }
  }

  async acceptGameRequest(requestId: string): Promise<void> {
    await updateDoc(doc(getFirebaseDb(), GAME_REQUESTS_COLLECTION, requestId), {
      status: 'accepted',
    })
  }

  async declineGameRequest(requestId: string): Promise<void> {
    await updateDoc(doc(getFirebaseDb(), GAME_REQUESTS_COLLECTION, requestId), {
      status: 'declined',
    })
  }

  async cancelOutgoingRequest(requestId: string): Promise<void> {
    try {
      await updateDoc(doc(getFirebaseDb(), GAME_REQUESTS_COLLECTION, requestId), {
        status: 'expired',
      })
    } catch {
      // Best-effort — request may already be gone / accepted
    }
  }
}
