# Prompt: Build a Robust, Performant Turn-Based Multiplayer Game on Firestore

You are building the **multiplayer layer** for a real-time, turn-based game backed by
**Cloud Firestore**. This prompt specifies the architecture, data model, and protocols.
It is **client-agnostic**: the same contract must work for a web app, a native mobile
app, a game engine (Unity/Godot), or a bot — anything that can authenticate to Firebase
and read/write Firestore. Do not assume React, a specific UI framework, or a specific
language. Where a language is needed for illustration, use framework-neutral pseudocode.

Your job is to implement the **transport + coordination protocol** and expose it behind a
narrow **port interface** (defined in §12). The game's *rules* are pluggable and must not
leak into the multiplayer layer.

---

## 0. Fill in these game-specific parameters first

Before implementing, pin down the pluggable pieces. Everything else in this prompt is fixed.

| Parameter | Meaning | Example |
|---|---|---|
| `PLAYER_COUNT` | Players per match (2 for 1v1; N for multi-seat) | 2 |
| `Move` | Serializable representation of one turn's action | a card id, `{from,to}`, an index |
| `applyMove(state, move, seat)` | **Pure, deterministic** reducer: state + move → next state | — |
| `initialState(seed, seats)` | **Pure, deterministic** setup from a seed | shuffle/deal from `seed` |
| `legalMoves(state, seat)` | Which moves a seat may make now | — |
| `whoseTurn(state)` | Seat index whose turn it is, or `null` if none | — |
| `isTerminal(state)` | Whether the game has ended | — |
| `outcome(state)` | Winner seat / draw / scores when terminal | — |
| `autoMove(state, seat)` | Move to play automatically on timeout | "lowest card", "pass" |

**Hard requirement — determinism.** `initialState` and `applyMove` must be **pure and
deterministic**: same `seed` + same ordered `moves[]` ⇒ identical state on every client,
every time. No `Date.now()`, no `Math.random()` (except seeded), no locale/timezone, no
floating-point nondeterminism, no reads of external state inside the reducer. This is the
single most important invariant in the whole system — it is what lets the authoritative
document stay tiny (§2) and lets any client reconstruct the game from scratch (§8).

---

## 1. Core design principles

1. **The document is the authority; the client computes the view.** The server stores the
   *minimal* facts needed to reconstruct the game — a `seed` and an ordered list of
   `moves` — not the full board. Every client derives the visible game state locally by
   replaying `moves` through the pure engine. This keeps writes tiny, makes every client
   agree by construction, and makes "reconnect" equivalent to "replay from move 0".

2. **Optimistic concurrency, not locks.** A monotonically increasing `moveSeq`
   (== `moves.length`) is the compare-and-set token. A move write asserts "I saw seq N;
   append and advance to N+1." Two clients racing to write the same seq → exactly one wins;
   the loser retries or rolls back. No server-side locking, no Cloud Function required.

3. **Idempotency everywhere.** Every mutating operation (join, move, rematch, leave) must
   be safe to run twice. Networks retry; clients double-fire on reconnect, tab restore, and
   framework re-renders. Design each transaction so a duplicate is a no-op.

4. **Transactions gate every multi-field state transition.** Seating a player, advancing a
   move, ending a game, and resetting for a rematch each read-then-write atomically. **All
   reads precede all writes** inside a transaction (Firestore requirement); a retry re-reads
   fresh data, so guards stay correct.

5. **Two independent liveness layers** (§7). *Presence* answers "is this user online at all"
   (for lobbies/friend lists). *Match heartbeat* answers "is my opponent still in THIS
   game" (for forfeit/timeout). They use different collections, intervals, and thresholds.

6. **Never revive a finished game.** Once `status == 'ended'`, no transaction may move it
   back to `playing`. A late autoplay, a retried move, or a reconnect must all check this
   and bail.

7. **Bound everything that grows.** Chat/reactions/event logs are capped to the last K
   entries. `moves[]` is naturally bounded by the game length. No unbounded arrays.

8. **Client-trust with a thin rules floor.** Firestore Security Rules enforce
   *authentication* and *coarse ownership*; fine-grained legality (is it your turn? is this
   move legal?) is enforced by the deterministic engine + the `moveSeq` CAS, which any
   client can verify. If you need cheat-resistance beyond honest clients, add a Cloud
   Function validator (§11) — the data model already supports it without change.

---

## 2. Firestore data model

One document per match is the hub. Keep it small; it is written on every turn and every
client holds a live listener on it.

```
matches/{matchId}
```

```jsonc
{
  // ── Identity & lifecycle ──────────────────────────────────────────────
  "status": "waiting",          // "waiting" | "ready" | "playing" | "ended"
  "inviteCode": "7QF3KP",       // short, human-shareable; unique among *open* rooms
  "createdBy": "uid_host",      // room owner (seat assignment anchor)
  "createdAt": <serverTimestamp>,
  "round": 1,                   // increments on each rematch

  // ── Deterministic game authority ──────────────────────────────────────
  "seed": "1737490000000-482",  // drives initialState(); regenerated each round
  "seats": { "0": "uid_host", "1": "uid_join" },  // seat → uid; null until full
  "firstSeat": 0,               // who moves first this round; written ONCE (see §5)
  "moves": ["c12", "c07", ...], // ORDERED move tokens — the ground truth
  "moveSeq": 42,                // == moves.length; optimistic-concurrency token
  "turnDeadline": 1737490090000,// epoch ms; the active seat must move before this

  // ── Players & liveness ────────────────────────────────────────────────
  "players": {
    "uid_host": { "name": "Ada", "joinedAt": 1737490000000, "lastSeen": 1737490085000,
                  "resigned": false, "left": false },
    "uid_join": { "name": "Boran", "joinedAt": 1737490001000, "lastSeen": 1737490086000,
                  "resigned": false, "left": false }
  },

  // ── End & rematch ─────────────────────────────────────────────────────
  "endedReason": null,          // "completed" | "resign" | "forfeit_timeout" | null
  "winnerUid": null,            // uid | null (null = draw)
  "winnerSeat": null,           // 0 | 1 | null — cached so the next round can seat starter
  "rematchReady": {},           // { uid: true } — both true ⇒ new round

  // ── Bounded side-channel (optional) ───────────────────────────────────
  "reactions": [ { "emoji": "👏", "from": "uid_host", "ts": 1737490050000 } ] // last ≤20
}
```

### Field notes

- **`seed` + `moves[]` are the *only* game truth.** Do not store the board, hands, scores,
  or turn owner as authoritative fields — derive them by replay. (You *may* cache
  `winnerSeat`/`winnerUid` at end-of-game because the next round needs them without a full
  replay, but they are derived, not authored mid-game.)
- **`moveSeq` must equal `moves.length`** after every write. It exists as a separate field
  only so a writer can assert-and-advance in one atomic `update` (see §6).
- **`firstSeat` is written exactly once**, by the joining transaction, and both clients then
  *read* it from the doc. Never let each client roll its own "who starts" — they will
  disagree. One writer, one source.
- **`lastSeen` is epoch-ms wall clock**, written by the client. Absolute wall-clock skew
  between clients is tolerable for liveness thresholds measured in tens of seconds; do not
  use it for game logic. Use `serverTimestamp()` only for `createdAt` (audit/ordering).
- **`turnDeadline` is epoch ms**, written by whoever advances the turn, as
  `now + TURN_MS`. Every client counts down to the same absolute instant.

### Indexes & related collections

- Index `inviteCode` (+ `status`) for the join query (§5).
- `users/{uid}` — profile + **presence** (`lastSeenAt`, `online`, `inMatch`,
  `currentMatchId`). Separate from the match doc so lobby presence never contends with
  gameplay writes (§7).
- Optional `rivals/{pairId}` (or per-user history) for "who starts the next game" and
  head-to-head records; read *inside* the join transaction if you use it.

---

## 3. Match state machine

```
        createRoom                joinRoom (2nd player seated, txn)
  ─────────────────►  waiting  ──────────────────────────────────►  ready
                        │  ▲                                          │
             host leaves│  │opponent leaves while                     │ both clients
             / stale    │  │ 1 player remains                         │ ack countdown
                        ▼  │                                          ▼
                     (deleted)                                     playing
                                                                     │  ▲
                                                     each move (txn) │  │ (stays playing
                                                                     ▼  │  across turns)
                                                                  playing
                                                                     │
                        isTerminal / resign / forfeit_timeout        │
                                                                     ▼
                                                                   ended
                                                                     │ both rematchReady (txn)
                                                                     ▼
                                                            ready (round+1, new seed)
```

- **`waiting`** — room exists, seats not full. Host is alone (or filling an N-player room).
- **`ready`** — all seats filled; `seats`, `firstSeat`, first `turnDeadline` are set.
  Clients show a short countdown / "get ready", then transition themselves to `playing`.
  (Keeping `ready` distinct from `playing` gives a clean join→deal handoff and a natural
  place to sync animations.)
- **`playing`** — moves are being appended. The doc stays in `playing` across all turns.
- **`ended`** — terminal (completed, resign, or timeout forfeit). Immutable game-wise;
  only `players.*.left` and `rematchReady` may still change.

Clients map this to their own view/phase enum (e.g. `idle → creating → waiting → countdown
→ playing → ended`). The **doc `status` is authoritative**; the client phase is a
projection with a little hysteresis (don't bounce `playing → ready` just because a delayed
snapshot arrives).

---

## 4. Authentication & identity

- Use **Firebase Anonymous Auth** at minimum (upgradeable to real accounts later). Cache
  the uid; every operation needs it. Obtain it lazily and memoize.
- A player is identified by **uid**, positioned by **seat index** (0..N-1). Keep both:
  uid for identity/security, seat for game logic. `seats` maps one to the other.
- Never trust a uid from a document to be "you" — always compare against your *own*
  authenticated uid when deciding local perspective.

---

## 5. Matchmaking & join protocol

### Create room
`createRoom()`:
1. Ensure auth → uid.
2. Allocate a new doc ref (client-side id is fine).
3. `setDoc` with `status:"waiting"`, fresh `inviteCode`, fresh `seed`, `round:1`,
   `createdBy:uid`, `createdAt: serverTimestamp()`, `seats:null`, `firstSeat:null`,
   `moves:[]`, `moveSeq:0`, `turnDeadline:0`, and `players:{ [uid]: {name, joinedAt:now,
   lastSeen:now} }`.
4. Start listening (§8) + start match heartbeat (§7). Return the invite code.

Generate invite codes from an **unambiguous alphabet** (exclude `0/O`, `1/I/L`) and be
tolerant when parsing user-pasted codes (strip surrounding junk; take the first N valid
chars).

### Join room (the critical transaction)
`joinRoom(code)`:
1. Normalize the code. **Idempotency shortcut:** if already attached to a match whose
   `inviteCode` matches and whose `players` already contains you, just re-listen and return
   (handles double-invocation and restore).
2. Query `matches where inviteCode == code and status == "waiting" limit 1`.
   - If empty, probe `where inviteCode == code limit 1` (any status). If found and you're
     already in `players`, it's a **rejoin** — attach and return. Otherwise error
     ("room not found or already started").
3. Run a **transaction** on the found room:
   ```
   txn.get(room)                      // read
   txn.get(rival/history) if used     // read — ALL reads first
   guard: if players[uid] exists → return          // idempotent double-join
   guard: if status != "waiting" || seatCount >= PLAYER_COUNT → throw "full/started"
   guard: creator still present & recently seen? (see below) else txn.delete + throw
   guard: room not stale? (see below)              else txn.delete + throw
   decide firstSeat ONCE (random, or from history) // write this single source of truth
   assign seats (host → 0, joiner → 1, …)
   txn.update(room, {
     players.<uid> = {name, joinedAt:now, lastSeen:now},
     status: "ready",
     seats, firstSeat,
     turnDeadline: now + TURN_MS,
   })
   ```
4. Attach listener + heartbeat.

**Staleness / creator-presence guards** (numbers in §13):
- *Room stale*: `status=="waiting"` and every player's `lastSeen` (or `joinedAt`) is older
  than `ROOM_STALE_MS` → the room is abandoned; delete it and tell the joiner to get a
  fresh invite.
- *Creator gone*: the `createdBy` player is missing, `left`, or hasn't been seen within
  `CREATOR_GONE_MS` → delete and error. (Nobody wants to "join" a dead host.)

These guards run **inside** the join transaction so the check and the delete are atomic
against a racing second joiner.

### N-player note
For `PLAYER_COUNT > 2`: transition `waiting → ready` only when the last seat fills; assign
seats deterministically (e.g., by `joinedAt`); generalize the "opponent" concept to "other
seats". Everything else (moves, heartbeat, timeout) is seat-count-agnostic.

---

## 6. The move protocol (optimistic apply + authoritative append)

This is the hot path. Optimism keeps it feeling instant; the CAS + rollback keeps it
correct.

**On the client, when the local seat makes move `m` at observed `moveSeq == N`:**

1. **Apply optimistically to local state** (run the engine, animate). The UI updates
   immediately — do not wait for the server round-trip.
2. **Publish with retry** (`publishMoveWithRetry`, §6.1): run a transaction that
   ```
   snap = txn.get(match)                       // read
   if !snap.exists → throw "match gone"
   if snap.status == "ended" → throw "match ended"   // never revive (§1.6)
   if snap.moveSeq != N → throw "stale move"          // someone else advanced
   txn.update(match, {
     moves: snap.moves + [m],
     moveSeq: N + 1,
     turnDeadline: now + TURN_MS,               // arm the NEXT seat's clock
     status: "playing",
     players.<uid>.lastSeen: now,               // fold heartbeat into the move (§7)
   })
   ```
3. **Reconcile on outcome:**
   - `ok` → nothing to do; your optimistic state matches authority.
   - `match_ended` → opponent ended it (resign/forfeit) while you were moving. Stop; render
     the end state from the snapshot.
   - `failed` (non-retryable or out of retries) → **roll back local state to authority**:
     discard optimistic changes and recompute from `seed + moves[]` in the latest snapshot.
     This is essential: if you keep an optimistic move the server rejected, both players
     wait on each other forever (deadlock).

**On the receiving client:** the snapshot listener (§8) delivers the new `moves[]`; replay
it, animate the opponent's move, and it's now your turn.

### 6.1 Retry classification

Wrap the move transaction in a small retry helper. Classify errors:

- **Retryable** (transient contention / network): `aborted`, `failed-precondition`,
  `unavailable`, `resource-exhausted`, `deadline-exceeded`. Retry with a short backoff
  (e.g. `40ms * attempt`, up to ~5 attempts). Firestore sometimes surfaces the code only in
  the message string, so match both.
- **Terminal-success** — "match ended": stop, return `match_ended` (opponent legitimately
  ended it).
- **Non-retryable failure** — a **stale `moveSeq` observed on FRESH data**. Firestore
  already re-reads inside a transaction on contention, so if you *still* see a seq mismatch,
  the world genuinely moved past you; retrying the same seq can never succeed. **Fail fast**
  and roll back to authority. Do not burn retries on it.

Return a 3-way outcome: `ok | match_ended | failed`. The helper must **not** mutate game
state — the caller owns rollback so the concern stays separated.

---

## 7. Liveness: presence + match heartbeat + dead/alive checks

Two layers, deliberately separate.

### Layer A — Global presence (lobby / friends)
Lives on `users/{uid}`, not the match. Answers "is this person online right now."

- Heartbeat `lastSeenAt` (and `online`, `inMatch`, `currentMatchId`) every
  `PRESENCE_HEARTBEAT_MS` (~30s).
- **Pause on background:** when the app is hidden/backgrounded, start an idle timer; after
  `IDLE_PAUSE_MS` (~60s hidden) stop the heartbeat and write `online:false` immediately, so
  friend lists don't show a ghost for the full window. Resume on foreground.
- A viewer computes "online" as `now - lastSeenAt < ONLINE_MS` (~90s — i.e. a couple of
  missed beats of grace). Never rely on a boolean alone; always range-check the timestamp.
- On clean teardown, best-effort write `online:false` / `inMatch:false`.

### Layer B — In-match heartbeat (forfeit / timeout)
Lives on `matches/{id}.players.<uid>.lastSeen`. Answers "is my opponent still in THIS game."

- Beat every `MATCH_HEARTBEAT_MS` (~15s). Tune this **slower than your instinct**: each beat
  is a write that contends with move transactions on the same doc.
- **Fold the beat into active play:** the move transaction already writes
  `players.<uid>.lastSeen = now` (§6). During your turn you don't need a separate heartbeat
  write at all — one fewer contending write on the hot doc.
- **Dead-check → forfeit:** while `status == "playing"`, watch the *opponent's* `lastSeen`
  from each snapshot. If `now - opponentLastSeen > HEARTBEAT_FORFEIT_MS` (~45s, i.e. ≥2–3
  missed beats), run a transaction that (guarding `status != "ended"`) sets
  `status:"ended"`, `endedReason:"forfeit_timeout"`, `winnerUid: <me>`, and marks the
  opponent `resigned:true`. Best-effort; if it throws, the snapshot will re-trigger it.
  **Either side may declare the forfeit** — the transaction's `ended` guard makes it a
  single, idempotent transition regardless of who fires first.

### Why two layers
Presence is cheap, coarse, and app-wide; match heartbeat is precise, scoped to one game,
and drives real consequences (you lose if you vanish). Mixing them couples lobby cost to
gameplay and vice-versa. Keep them apart.

---

## 8. Snapshot listening & reconnect

### Listening
- Hold exactly **one** `onSnapshot` listener on `matches/{id}` while in a match. One doc,
  one listener, minimal reads.
- On each snapshot: if the doc is gone, surface "opponent left / match over"; else parse
  into a **local-perspective view** (resolve *my* seat, *the* opponent, my/opponent rematch
  flags, etc.) and hand it to the game layer, which replays `seed + moves[]`.
- Ignore snapshots where your uid isn't in `players` yet (a stale read during the
  waiting→ready race).
- **Deadline hysteresis:** prefer a *future* `turnDeadline` over a zero/past one when
  merging a snapshot, so a delayed or partial snapshot doesn't momentarily kill the
  countdown UI. (`incoming > now ? incoming : (prev > now ? prev : incoming)`.)

### Reconnect / restore (this is what makes it feel bulletproof)
Because state = `seed + moves[]`, reconnect is trivial by construction:

1. **Persist the session locally** — at minimum `{ matchId, inviteCode }` — as soon as you
   have it. Use durable storage (localStorage / preferences / a file).
2. **On app start / reload:** if a saved session exists, `rejoinMatch(matchId)` = just
   re-attach the listener (+ heartbeat). No special server call needed. The first snapshot
   replays the entire game to the exact current position, restoring hands, pile, scores, and
   whose turn it is.
3. **Reconcile against a deep-link:** if the app was opened with an invite code that differs
   from the saved session, the fresh invite wins (clear the stale session); if it's the
   *same* room, rejoin the saved match. Never let a saved session hijack a new invite.
4. **Reconnect mid-turn:** the autoplay watchdog (§9) re-arms on the restored `turnDeadline`
   — including a deadline already in the past — so a refresh that lands after your timer
   expired still auto-moves. Don't gate autoplay on "the timer fired while mounted."
5. **Clear the session** on clean exit/end so you don't try to rejoin a finished game
   (though rejoining an `ended` match is harmless — you just see the end screen).

Firestore's SDK already queues writes offline and re-syncs on reconnect; your job is to make
the *application* idempotent so those replays are safe.

---

## 9. Turn timer & autoplay

Every turn is bounded by `turnDeadline`. This guarantees forward progress even against an
AFK-but-technically-alive opponent (they're still heartbeating, so §7's forfeit won't fire,
but their *turn* still expires).

- **Countdown:** all clients render `turnDeadline - now`. The instant is absolute, so both
  sides agree without server round-trips.
- **Autoplay on expiry (active seat only):** when *your* deadline passes and it's your turn,
  automatically play `autoMove(state, seat)` and publish it like any other move (§6). Now
  the turn advances and the game keeps moving.
- **Re-arming watchdog, not a one-shot.** A single "fire once when the timer hits zero"
  callback is not enough: it can fire while the client is still dealing/hydrating after a
  reconnect, and get dropped. Instead, schedule an attempt for `max(0, deadline - now)` and
  **keep re-attempting** (guarded) until an autoplay actually succeeds for that deadline.
  Handle an already-past deadline by attempting immediately.
- **Idempotency guard:** remember the last deadline you auto-played
  (`autoPlayedForDeadline`) and never auto-play the same deadline twice. Reset it when a new
  deadline arrives, and also reset it after a *failed* publish so autoplay can re-arm.
- **Don't autoplay while animating/dealing/leaving** — gate on the local UI being idle, and
  bail if the player has chosen to leave.

Only the seat **whose turn it is** autoplays. Other seats just watch the clock.

---

## 10. End of game, rematch, leave & forfeit

### Natural end
When `isTerminal(state)` becomes true after a move, the mover's transaction (or a dedicated
end transaction) sets `status:"ended"`, `endedReason:"completed"`, and caches `winnerUid` /
`winnerSeat` from `outcome(state)`. Guard against ending an already-ended match.

### Rematch (transaction)
`requestRematch()`:
```
txn.get(match)
rematchReady = {...existing, [uid]: true}
if every seat's uid is ready:
   reset for next round:
     seed = fresh, round += 1, status = "ready",
     moves = [], moveSeq = 0, turnDeadline = now + TURN_MS,
     rematchReady = {}, reactions = [],
     firstSeat = winnerSeat ?? (derive from winnerUid+seats) ?? previous firstSeat,
     endedReason = null, winnerUid = null, winnerSeat = null,
     players.*.resigned = false, players.*.left = false
else:
   txn.update(match, { rematchReady })
```
"Winner starts next round; on a draw, the same starter leads again" is a good default —
that's why `winnerSeat` is cached at end-of-game.

### Leave / forfeit (transaction, covers every phase)
`leave(forfeit?)`:
```
txn.get(match); if !exists → return; if !players[uid] → return
if status == "ended":
    mark players[uid].left = true
    if all players left → txn.delete   else txn.update(players)
    return
if status in ("ready","playing") OR forfeit, and an opponent exists:
    players[uid] = { ...resigned:true, left:true }
    txn.update({ players, status:"ended", endedReason:"resign", winnerUid: opponent })
    return
// else: waiting room, alone or host-cancel
delete players[uid]
if no players left OR not in-progress → txn.delete
else → txn.update({ players, status:"waiting" })   // free the seat again
```
Do the leave **write before detaching** the listener, so the update isn't racing a
torn-down client. Wrap in try/catch — it's best-effort by nature (the tab may be closing).
Consider firing a best-effort leave/forfeit on `pagehide`/`visibilitychange:hidden` /
app-background as a backstop; the §7 heartbeat forfeit is the ultimate safety net if even
that doesn't land.

### Bounded side-channels
Emoji/reactions/quick-chat: append then **slice to the last K** (~20) on write so the array
can't grow without bound. These can be plain `updateDoc` (not transactions) — a lost race
just drops an emoji, which is fine.

---

## 11. Security rules

Start from a **client-trust** floor and tighten as needed.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // Matches: any authenticated user may read/write.
    // Seat/turn/move legality is enforced by the deterministic engine + moveSeq CAS.
    match /matches/{matchId} {
      allow read, write: if request.auth != null;
    }

    // Profiles/presence: anyone signed-in can read; only the owner writes their own.
    match /users/{uid} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // Pairwise history: only participants may read/update.
    match /rivals/{pairId} {
      allow read, update: if request.auth != null && request.auth.uid in resource.data.uids;
      allow create:       if request.auth != null && request.auth.uid in request.resource.data.uids;
      allow delete:       if false;
    }
  }
}
```

Hardening ladder (add only if your threat model needs it — an honest-client casual game
usually does not):
- Rule-level assertions: writer is a member; `moveSeq` only ever increments by 1;
  `status` transitions follow the allowed graph; `seats`/`firstSeat` immutable once set.
- A **Cloud Function** (or callable) as the sole move-writer that re-runs
  `legalMoves`/`applyMove` server-side. The data model doesn't change — you just move the
  transaction of §6 server-side and lock down direct client writes in rules. Reserve this
  for competitive/ranked or wagered games; it adds latency and cost.
- Rate-limit writes per uid (App Check + rules) to blunt abuse.

Enable **Firebase App Check** regardless — it keeps non-app clients off your database
cheaply.

---

## 12. The client-agnostic port (implement behind this interface)

Expose the whole layer behind a narrow interface so the game/UI never imports Firestore
directly. Provide a real Firestore implementation and a no-op/local implementation (for
solo play, tests, and offline). Any platform implements the same contract.

```ts
// A snapshot already projected to the LOCAL player's perspective.
interface MatchView {
  matchId: string
  status: "waiting" | "ready" | "playing" | "ended"
  round: number
  inviteCode: string
  seed: string
  seats: Record<number, string> | null
  firstSeat: number | null
  localSeat: number | null
  moves: string[]              // replay these through the engine
  moveSeq: number
  turnDeadline: number         // epoch ms
  opponents: Array<{ uid: string; name: string; lastSeen: number;
                     resigned: boolean; left: boolean }>
  localWantsRematch: boolean
  opponentsWantRematch: boolean
  endedReason: string | null
  winnerUid: string | null
  reactions: Array<{ emoji: string; from: string; ts: number }>
}

interface MultiplayerPort {
  // identity
  setDisplayName(name: string): void
  getLocalUid(): string | null

  // lifecycle
  createRoom(): Promise<string>            // resolves to invite code
  joinRoom(code: string): Promise<void>
  rejoinMatch(matchId: string): Promise<void>
  getActiveMatchId(): string | null

  // realtime
  subscribe(onView: (view: MatchView | null) => void): () => void  // returns unsubscribe

  // gameplay — CAS + retry live inside the implementation
  playMove(move: string, expectedSeq: number, nextDeadline: number): Promise<void>

  // endgame
  requestRematch(): Promise<void>
  leave(forfeit?: boolean): Promise<void>
  forfeitOpponentForTimeout(): Promise<void>   // dead-check → opponent forfeits

  // bounded side-channel
  sendReaction(emoji: string): Promise<void>
}
```

Keep **all** Firestore imports inside the Firestore implementation. The game engine, UI, and
tests depend only on `MultiplayerPort` + `MatchView`. This is what makes the whole thing
client-agnostic: swap the implementation, keep the game.

---

## 13. Tunable constants (battle-tested defaults)

Centralize these; do not scatter magic numbers. Starting values from a production 1v1 game:

| Constant | Default | Governs |
|---|---|---|
| `TURN_MS` | 15 000 | Per-turn time budget; also the autoplay deadline |
| `MATCH_HEARTBEAT_MS` | 15 000 | In-match `lastSeen` beat (kept slow to avoid write contention) |
| `HEARTBEAT_FORFEIT_MS` | 45 000 | Opponent silent this long → forfeit (≈3 missed beats) |
| `PRESENCE_HEARTBEAT_MS` | 30 000 | Global lobby presence beat |
| `ONLINE_MS` | 90 000 | Viewer treats a user as online within this window |
| `IDLE_PAUSE_MS` | 60 000 | Hidden this long → stop presence, mark offline |
| `ROOM_STALE_MS` | 40 000 | Waiting room with no recent `lastSeen` → abandoned |
| `CREATOR_GONE_MS` | 30 000 | Host not seen this long → invite invalid |
| retry backoff | `40ms × attempt`, ≤5 tries | Transient move-write contention |
| reactions cap | last 20 | Bounded side-channel |

Rule of thumb: **forfeit/stale thresholds ≥ 2–3× the corresponding heartbeat interval**, so
one dropped beat or GC pause never mis-declares a live player dead.

---

## 14. Cost & performance checklist

- **One doc, one listener per match.** Don't fan match state across many docs/subcollections
  that all need listeners.
- **Fold `lastSeen` into move writes**; skip the separate heartbeat during active turns.
- **Slow the heartbeat** to just fast enough for your forfeit threshold — every beat is a
  billed write on a hot, contended doc.
- **Pause presence when backgrounded**; don't heartbeat a hidden tab forever.
- **Keep the doc small** (seed + moves + a little metadata). Large docs = larger reads on
  every snapshot for every listener.
- **Bound arrays** (reactions, any log). Prune on write.
- **Index only what you query** (`inviteCode`, `status`).
- **Clean up ended rooms**: delete when all players have `left`; optionally a scheduled
  Cloud Function TTL-sweeps `ended`/abandoned matches older than a few hours.
- **Batch presence + profile writes** with `{merge:true}` rather than many field writes.

---

## 15. Edge cases your implementation MUST handle (test these)

1. **Simultaneous join** of the same invite by two devices → exactly one is seated; the
   other rejoins-if-in or gets a clean "full/started" error. No orphan third player.
2. **Double-join / re-invoke** (network retry, framework re-mount, session restore) →
   idempotent no-op, not a duplicate seat.
3. **Both players play "at once"** on the same `moveSeq` → one wins the CAS; the loser
   rolls back to authority (no deadlock, no divergence).
4. **Move published, app dies before the ack** → Firestore replays the queued write on
   reconnect; the seq guard makes a duplicate a no-op.
5. **Reconnect mid-game** → replay `seed + moves[]` restores the exact position; watchdog
   auto-plays if the restored deadline already passed.
6. **Opponent closes the tab / loses signal** → heartbeat stops → after
   `HEARTBEAT_FORFEIT_MS` the survivor's transaction ends the game; opponent forfeits.
7. **Opponent present but AFK** → their *turn* times out → you (or they) autoplay; game
   still progresses.
8. **Host abandons the waiting room** → stale/creator-gone guards delete it; a late joiner
   gets "get a fresh invite," not a dead room.
9. **Leave during `waiting` vs `playing` vs `ended`** → correct branch each time (free the
   seat / forfeit / mark-left-and-maybe-delete).
10. **Rematch race** — both tap rematch together → transaction resets exactly once; round
    increments by one, not two.
11. **Late snapshot after end** → never revives `playing`; UI shows the end state.
12. **Clock skew** between clients → liveness thresholds are generous multiples of the beat,
    so modest skew never mis-forfeits; game logic never depends on wall clock, only on
    `moves[]` order.
13. **Deep-link invite while a saved session exists** → fresh invite wins; stale session
    cleared; no hijack.

---

### Deliverables

1. The `MultiplayerPort` interface + a Firestore implementation + a no-op/local
   implementation.
2. The deterministic engine plug-points (`initialState`, `applyMove`, `legalMoves`,
   `whoseTurn`, `isTerminal`, `outcome`, `autoMove`) with unit tests proving determinism
   (same seed+moves ⇒ identical state).
3. Security rules (§11) + required indexes (§2).
4. A constants module (§13).
5. Tests covering every edge case in §15 (the move retry/rollback and the join transaction
   are the highest-value tests).

Build the coordination protocol exactly as specified; keep the game rules behind the
engine plug-points; keep Firestore behind the port. That combination is what makes it
robust, performant, and client-agnostic.
