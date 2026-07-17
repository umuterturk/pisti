import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { ensureAnonymousAuth, getFirebaseDb, MATCHES_COLLECTION } from '../firebase/config'
import type { PistiMatchDoc, PistiMatchSnapshot } from '../multiplayer/types'
import type { MultiplayerPort } from '../ports'
import { TURN_TIMER } from '../app/TurnTimer'

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Slower than before so heartbeats contend less with playMove transactions. */
const HEARTBEAT_INTERVAL_MS = 15_000
const ROOM_STALE_MS = 40_000
const CREATOR_GONE_MS = 30_000
const TURN_TIMEOUT_MS = TURN_TIMER.TURN_MS

function generateInviteCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]
  }
  return code
}

function generateSeed(): string {
  return String(Date.now()) + '-' + Math.floor(Math.random() * 1e9)
}

function fallbackName(uid: string): string {
  return `Oyuncu ${uid.slice(-4).toUpperCase()}`
}

function isWaitingRoomStale(data: PistiMatchDoc, now: number): boolean {
  if (data.status !== 'waiting') return false
  const players = Object.values(data.players)
  if (players.length === 0) return true
  return players.every((p) => (p.lastSeen ?? p.joinedAt) < now - ROOM_STALE_MS)
}

/** Creator must still be in the room and recently heartbeating. */
function creatorPresenceError(data: PistiMatchDoc, now: number): string | null {
  const creatorUid = data.createdBy
  if (!creatorUid) return 'Oda sahibi bulunamadı. Davet geçersiz.'
  const creator = data.players[creatorUid]
  if (!creator || creator.left) return 'Oda sahibi ayrıldı. Yeni bir davet iste.'
  const lastSeen = creator.lastSeen ?? creator.joinedAt ?? 0
  if (now - lastSeen > CREATOR_GONE_MS) {
    return 'Oda sahibi bağlantısını kaybetti. Yeni bir davet iste.'
  }
  return null
}

function parseSnapshot(
  matchId: string,
  data: PistiMatchDoc,
  localUid: string,
): PistiMatchSnapshot | null {
  const playerUids = Object.keys(data.players)
  if (!playerUids.includes(localUid)) return null

  const opponentUid = playerUids.find((uid) => uid !== localUid) ?? ''
  const opponent = data.players[opponentUid]

  // Determine seat from seats map — null until seats are assigned (waiting room)
  let localSeat: 0 | 1 | null = null
  if (data.seats) {
    const seatEntries = Object.entries(data.seats) as [string, string][]
    const found = seatEntries.find(([, uid]) => uid === localUid)
    if (found) localSeat = Number(found[0]) as 0 | 1
  }

  return {
    matchId,
    inviteCode: data.inviteCode,
    seed: data.seed,
    status: data.status,
    round: data.round ?? 1,
    localSeat,
    firstSeat: data.firstSeat ?? null,
    seats: data.seats ?? null,
    moves: data.moves ?? [],
    turnDeadline: data.turnDeadline ?? 0,
    opponentUid,
    opponentName: opponent?.name ?? fallbackName(opponentUid),
    opponentLastSeen: opponent?.lastSeen ?? opponent?.joinedAt ?? 0,
    opponentResigned: Boolean(opponent?.resigned),
    opponentLeft: Boolean(opponent?.left),
    localWantsRematch: Boolean(data.rematchReady?.[localUid]),
    opponentWantsRematch: Boolean(data.rematchReady?.[opponentUid]),
    endedReason: data.endedReason,
    winnerUid: data.winnerUid,
    reactions: data.reactions ?? [],
  }
}

export class FirebaseMultiplayerAdapter implements MultiplayerPort {
  private matchId: string | null = null
  private localUid: string | null = null
  private displayName = ''
  private unsubscribe: (() => void) | null = null
  private handler: ((snap: PistiMatchSnapshot | null) => void) | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  setDisplayName(name: string): void {
    this.displayName = name.trim()
  }

  private playerName(uid: string): string {
    return this.displayName || fallbackName(uid)
  }

  private async getUid(): Promise<string> {
    if (!this.localUid) {
      this.localUid = await ensureAnonymousAuth()
    }
    return this.localUid
  }

  getLocalUid(): string | null {
    return this.localUid
  }

  private get matchRef() {
    if (!this.matchId) throw new Error('No active match.')
    return doc(getFirebaseDb(), MATCHES_COLLECTION, this.matchId)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    if (!this.matchId || !this.localUid) return
    const ping = () => void this.heartbeat()
    ping()
    this.heartbeatTimer = setInterval(ping, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.matchId || !this.localUid) return
    try {
      await updateDoc(this.matchRef, {
        [`players.${this.localUid}.lastSeen`]: Date.now(),
      })
    } catch {
      // Doc may be gone — snapshot handler will react
    }
  }

  private startListening(): void {
    this.stopListening()
    if (!this.matchId || !this.localUid) return

    this.startHeartbeat()
    if (!this.handler) return

    const matchId = this.matchId
    const localUid = this.localUid
    const handler = this.handler

    this.unsubscribe = onSnapshot(this.matchRef, (snap) => {
      if (!snap.exists()) {
        handler(null)
        return
      }
      const parsed = parseSnapshot(matchId, snap.data() as PistiMatchDoc, localUid)
      if (!parsed) return // stale; our uid not in players yet
      handler(parsed)
    })
  }

  private stopListening(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.stopHeartbeat()
  }

  subscribe(handler: (snap: PistiMatchSnapshot | null) => void): () => void {
    this.handler = handler
    this.startListening()
    return () => {
      this.handler = null
      this.stopListening()
    }
  }

  async createRoom(): Promise<string> {
    const uid = await this.getUid()
    const db = getFirebaseDb()
    const newRef = doc(collection(db, MATCHES_COLLECTION))
    const inviteCode = generateInviteCode()
    const now = Date.now()

    const docData: Omit<PistiMatchDoc, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
      status: 'waiting',
      inviteCode,
      seed: generateSeed(),
      round: 1,
      createdBy: uid,
      createdAt: serverTimestamp(),
      seats: null,
      firstSeat: null,
      moves: [],
      moveSeq: 0,
      turnDeadline: 0,
      players: {
        [uid]: {
          name: this.playerName(uid),
          joinedAt: now,
          lastSeen: now,
        },
      },
    }

    await setDoc(newRef, docData)
    this.matchId = newRef.id
    this.startListening()
    return inviteCode
  }

  async joinRoom(code: string): Promise<void> {
    const uid = await this.getUid()
    const db = getFirebaseDb()
    // Accept dirty values like "4UF8WLSeninle..." — take the room id only.
    const normalized =
      code.trim().toUpperCase().match(/^([A-HJ-NP-Z2-9]{6})/)?.[1] ??
      code.trim().toUpperCase()

    // Already attached to this invite (e.g. Strict Mode double-effect) — just listen
    if (this.matchId) {
      const existing = await getDoc(doc(db, MATCHES_COLLECTION, this.matchId))
      if (existing.exists()) {
        const data = existing.data() as PistiMatchDoc
        if (
          data.inviteCode?.toUpperCase() === normalized &&
          data.players?.[uid]
        ) {
          this.startListening()
          return
        }
      }
    }

    const roomQuery = query(
      collection(db, MATCHES_COLLECTION),
      where('inviteCode', '==', normalized),
      where('status', '==', 'waiting'),
      limit(1),
    )
    const rooms = await getDocs(roomQuery)

    // Room may already be ready from a concurrent join attempt — rejoin if we're in it
    if (rooms.empty) {
      const anyStatus = query(
        collection(db, MATCHES_COLLECTION),
        where('inviteCode', '==', normalized),
        limit(1),
      )
      const found = await getDocs(anyStatus)
      if (!found.empty) {
        const data = found.docs[0].data() as PistiMatchDoc
        if (data.players?.[uid]) {
          this.matchId = found.docs[0].id
          this.startListening()
          return
        }
      }
      throw new Error('Oda bulunamadı veya zaten başladı.')
    }

    const roomRef = rooms.docs[0].ref

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef)
      if (!snap.exists()) throw new Error('Oda bulunamadı.')

      const data = snap.data() as PistiMatchDoc
      const now = Date.now()
      const playerUids = Object.keys(data.players)

      // Idempotent: already seated (double-join / refresh during waiting→ready)
      if (data.players[uid]) return

      if (data.status !== 'waiting' || playerUids.length >= 2) {
        throw new Error('Oda dolu veya zaten başladı.')
      }

      const creatorErr = creatorPresenceError(data, now)
      if (creatorErr) {
        transaction.delete(roomRef)
        throw new Error(creatorErr)
      }
      if (isWaitingRoomStale(data, now)) {
        transaction.delete(roomRef)
        throw new Error('Oda zaman aşımına uğradı. Yeni bir davet iste.')
      }

      const creatorUid = data.createdBy
      // Stable seats: creator always seat 0, joiner always seat 1.
      // firstSeat is chosen independently so either side can lead.
      const firstSeat: 0 | 1 = Math.random() < 0.5 ? 0 : 1
      const seats: Record<string, string> = { '0': creatorUid, '1': uid }

      transaction.update(roomRef, {
        [`players.${uid}`]: {
          name: this.playerName(uid),
          joinedAt: now,
          lastSeen: now,
        },
        status: 'ready',
        seats,
        firstSeat,
        turnDeadline: now + TURN_TIMEOUT_MS,
      })
    })

    this.matchId = roomRef.id
    this.startListening()
  }

  async rejoinMatch(matchId: string): Promise<void> {
    await this.getUid()
    this.matchId = matchId
    this.startListening()
  }

  async playMove(cardId: string, moveSeq: number, nextDeadline: number): Promise<void> {
    if (!this.matchId || !this.localUid) return
    const db = getFirebaseDb()
    const ref = this.matchRef
    const uid = this.localUid

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) throw new Error('Match not found.')
      const data = snap.data() as PistiMatchDoc
      // Never revive an ended match (e.g. opponent resigned while our autoplay fired)
      if (data.status === 'ended') throw new Error('Match ended.')
      if (data.moveSeq !== moveSeq) throw new Error('Stale move; retry.')

      const newMoves = [...(data.moves ?? []), cardId]
      // Refresh lastSeen in the same write so active play doesn't need a
      // separate heartbeat updateDoc (those contend with this transaction).
      transaction.update(ref, {
        moves: newMoves,
        moveSeq: moveSeq + 1,
        turnDeadline: nextDeadline,
        status: 'playing',
        [`players.${uid}.lastSeen`]: Date.now(),
      })
    })
  }

  async requestRematch(): Promise<void> {
    if (!this.matchId || !this.localUid) return
    const uid = this.localUid
    const ref = this.matchRef
    const db = getFirebaseDb()

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) throw new Error('Match gone.')

      const data = snap.data() as PistiMatchDoc
      const playerUids = Object.keys(data.players)
      const rematchReady = { ...(data.rematchReady ?? {}), [uid]: true }
      const bothReady = playerUids.length === 2 && playerUids.every((p) => rematchReady[p])

      if (bothReady) {
        // Winner of the previous round leads the next one.
        // 1. Completed game: winnerSeat was written when the round ended.
        // 2. Resign / forfeit: derive from winnerUid + seats.
        // 3. Tie or unknown: keep the same firstSeat (mirrors solo tie behaviour).
        let newFirstSeat: 0 | 1
        if (data.winnerSeat !== null && data.winnerSeat !== undefined) {
          newFirstSeat = data.winnerSeat
        } else if (data.winnerUid && data.seats) {
          const entry = Object.entries(data.seats).find(([, seatUid]) => seatUid === data.winnerUid)
          newFirstSeat = entry ? (Number(entry[0]) as 0 | 1) : (data.firstSeat ?? 0)
        } else {
          newFirstSeat = data.firstSeat ?? 0
        }
        const update: Record<string, unknown> = {
          seed: generateSeed(),
          status: 'ready',
          round: (data.round ?? 1) + 1,
          moves: [],
          moveSeq: 0,
          turnDeadline: Date.now() + TURN_TIMEOUT_MS,
          rematchReady: {},
          firstSeat: newFirstSeat,
          endedReason: null,
          winnerUid: null,
          winnerSeat: null,
        }
        for (const p of playerUids) {
          update[`players.${p}.resigned`] = false
          update[`players.${p}.left`] = false
        }
        transaction.update(ref, update)
      } else {
        transaction.update(ref, { rematchReady })
      }
    })
  }

  async forfeitForHeartbeat(): Promise<void> {
    if (!this.matchId || !this.localUid) return
    const opponentUid = await this.getOpponentUid()
    if (!opponentUid) return

    try {
      await runTransaction(getFirebaseDb(), async (transaction) => {
        const snap = await transaction.get(this.matchRef)
        if (!snap.exists()) return
        const data = snap.data() as PistiMatchDoc
        if (data.status === 'ended') return
        transaction.update(this.matchRef, {
          status: 'ended',
          endedReason: 'forfeit_heartbeat',
          winnerUid: this.localUid,
          [`players.${opponentUid}.resigned`]: true,
        })
      })
    } catch {
      // Best effort
    }
  }

  private async getOpponentUid(): Promise<string | null> {
    if (!this.matchId || !this.localUid) return null
    try {
      const snap = await getDoc(this.matchRef)
      if (!snap.exists()) return null
      const data = snap.data() as PistiMatchDoc
      return Object.keys(data.players).find((uid) => uid !== this.localUid) ?? null
    } catch {
      return null
    }
  }

  async leave(forfeit = false): Promise<void> {
    if (!this.matchId || !this.localUid) {
      this.stopListening()
      this.matchId = null
      return
    }

    const uid = this.localUid
    const ref = doc(getFirebaseDb(), MATCHES_COLLECTION, this.matchId)

    // Persist leave/forfeit before detaching so the write isn't racing a stopped client.
    try {
      await runTransaction(getFirebaseDb(), async (transaction) => {
        const snap = await transaction.get(ref)
        if (!snap.exists()) return

        const data = snap.data() as PistiMatchDoc
        const players = { ...data.players }
        if (!players[uid]) return

        const opponentUid = Object.keys(players).find((p) => p !== uid) ?? null
        const inProgress =
          data.status === 'playing' || data.status === 'ready' || data.status === 'waiting'
        const shouldForfeit =
          forfeit || data.status === 'playing' || data.status === 'ready'

        if (data.status === 'ended') {
          players[uid] = { ...players[uid], left: true }
          const allLeft = Object.values(players).every((p) => p.left)
          if (allLeft) transaction.delete(ref)
          else transaction.update(ref, { players })
          return
        }

        if (shouldForfeit && opponentUid) {
          players[uid] = { ...players[uid], resigned: true, left: true }
          transaction.update(ref, {
            players,
            status: 'ended',
            endedReason: 'resign',
            winnerUid: opponentUid,
          })
          return
        }

        // Waiting room, alone or host cancel — remove self
        delete players[uid]
        if (Object.keys(players).length === 0 || !inProgress) {
          transaction.delete(ref)
        } else {
          transaction.update(ref, { players, status: 'waiting' })
        }
      })
    } catch {
      // Best-effort
    }

    this.stopListening()
    this.matchId = null
  }

  getActiveMatchId(): string | null {
    return this.matchId
  }

  async sendEmoji(emoji: string): Promise<void> {
    if (!this.matchId || !this.localUid) return
    const ref = this.matchRef

    try {
      const snap = await getDoc(ref)
      if (!snap.exists()) return

      const data = snap.data() as PistiMatchDoc
      const reactions = data.reactions ?? []
      const newReaction = {
        emoji,
        from: this.localUid,
        timestamp: Date.now(),
      }

      // Keep only the last 20 reactions to prevent unbounded growth
      const updatedReactions = [...reactions, newReaction].slice(-20)

      await updateDoc(ref, {
        reactions: updatedReactions,
      })
    } catch {
      // Best effort
    }
  }
}
