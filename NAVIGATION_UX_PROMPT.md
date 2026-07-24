# Prompt: Menus, Screens & Navigation UX for a Multiplayer Turn-Based Game

You are building the **front-of-house navigation layer** for a turn-based game: every menu,
screen, overlay, and modal *outside* the core gameplay board, plus the rules that govern how
the player moves between them. This is a **reusable UX template** — apply it to any turn-based
game (card, board, word, puzzle) with solo (vs AI) and online (vs human) modes.

It is **client-agnostic**: describe surfaces as *states* and *transitions*, not as widgets of
any one framework. It maps cleanly onto React, SwiftUI, Jetpack Compose, Flutter, a game
engine's scene stack, or plain DOM. Where structure is needed, use framework-neutral terms
(surface, state, transition, slot, action).

This document is the **navigation companion** to the multiplayer protocol spec. The gameplay
board itself, the matchmaking transactions, presence/liveness, and reconnect *mechanics* live
in that spec — here we define the **screens that sit on top of them** and the flow between.

---

## 0. Parameters to fill in first

Pin these before implementing; everything else is fixed structure.

| Parameter | Meaning | Example |
|---|---|---|
| `GAME_NAME` | Display title on the home hub | "Pişti" |
| `SOLO_LABEL` | CTA text for single-player | "Play vs AI" |
| `ONLINE_LABEL` | CTA text for human multiplayer | "Play with a Friend" |
| `OPPONENTS` | Selectable AI opponents (id, name, difficulty, blurb) | bot roster |
| `PRIMARY_SECTIONS` | Bottom-nav tabs on the home surface | `[Home, Friends]` |
| `RESULT_SUMMARY` | What the end screen tallies | score breakdown, W/L record |
| `SESSION_SCORE` | The "room"/series score shown across rounds | best-of-N, running total |
| `IDENTITY_MODEL` | How players are named/authed | anonymous + display name |
| `SUPPORTS_CHALLENGE` | Direct in-app invite to an online friend? | yes/no |
| `SUPPORTS_DEEP_LINK` | Join via shared URL/code? | yes/no |
| `REACTION_EMOJIS` | Preset emoji set for in-match reactions (online) | e.g. 😭 😂 🫨 🤓 😒 🫣 |
| `REACTION_TEXTS` | Preset quick-taunt phrases for in-match reactions (online) | short localized lines |
| `REACT_COOLDOWN_MS` | Shared cooldown after sending any reaction | ~3000 |
| `REACT_PICK_MS` | How long a reaction picker stays open before auto-close | ~3000 |

---

## 1. Navigation design principles

1. **One authoritative "surface" at a time, with layered transients above it.** At any
   moment there is exactly one **base surface** (Home, Countdown, Game, End). On top of it,
   zero or more **transient layers** (modals, dialogs, process overlays, banners) may stack.
   Never let two base surfaces render at once; never lose the base surface behind a transient
   (the player must always know "where" they are).

2. **Gate identity once, then never block again.** The first networked action requires a
   display name. Prompt for it exactly once (first run or first online action), persist it,
   and provide an **auto-generated fallback** so solo play is never blocked. Re-editing the
   name is a deliberate, non-blocking action from the profile affordance.

3. **Every waiting/blocking state is cancelable.** Any surface that waits on the network or
   another human (creating a room, waiting for an opponent, hydrating a rejoin, sending a
   challenge) must show a visible **Cancel / Exit** that returns to a known safe surface
   (usually Home) and cleans up server state (leave the room).

4. **Confirm only what is destructive or irreversible.** Resigning/forfeiting, leaving a live
   match, removing a friend → confirm. Starting a game, switching a tab, opening a picker →
   no confirmation; make them instant and reversible.

5. **Reflect liveness in the UI, act on it in the CTA.** Show online / in-match / offline
   state wherever people are listed, and let it **change the action**: an online friend gets
   a direct in-app challenge; an offline one gets a shareable link. Never offer an action that
   can't succeed.

6. **Every list has three states: loading, empty, populated.** Design the empty state
   ("No friends yet", "No other players") and the loading state (skeleton/spinner) as
   first-class, not afterthoughts.

7. **Back/exit is always defined.** From every surface, the answer to "what does back/close
   do?" is explicit and safe — never a dead end, never an accidental forfeit without confirm.

8. **Instrument every transition.** Fire an analytics event on each navigation edge (menu
   view, tab switch, CTA click, picker open/cancel, invite sent, match start, end decision).
   Navigation is the funnel; measure it.

---

## 2. Surface taxonomy

Classify every screen into exactly one of these. The class dictates its layering,
dismissal, and back-behavior.

| Class | Definition | Dismissal | Examples |
|---|---|---|---|
| **Base surface** | Full-screen "you are here" state | Replaced by another base surface | Home, Countdown, Game board, End |
| **Process overlay** | Full-screen *temporary* state during an async op | Auto-dismisses on completion, or Cancel | Matchmaking/invite overlay, Reconnect/loading |
| **Modal** | Focus-stealing panel that demands a decision | Explicit accept/dismiss; may be non-cancelable if it's a gate | Identity/name gate, Incoming request, Opponent picker |
| **Dialog** | Small confirm/info popup | Confirm / cancel / close | Resign confirm, Score/help info |
| **Banner / Toast** | Non-blocking, edge-anchored notice | Auto-timeout or dismiss/act | "Update available", error toast, "link copied" |

Rules:
- A **gate modal** (identity) blocks everything beneath until satisfied — no outside dismiss.
- A **process overlay** must have a timeout/cancel so it can't trap the user forever.
- **Banners never block**; they inform or offer an optional action.

---

## 3. The navigation state model

Drive the whole layer from a small set of orthogonal state variables. Keep them independent so
combinations compose (e.g. "in game" + "resign dialog open" + "update banner").

```
identityReady   : bool          // display name known (or auto-assigned)
baseSurface     : Home | Countdown | Game | End
homeTab         : one of PRIMARY_SECTIONS      // only meaningful when baseSurface == Home
matchPhase      : idle | creating | waiting | ready | playing | ended   // mirrors the doc status
overlay         : none | matchmaking | reconnect                        // process overlays
matchmakingStep : creating | sharing | waiting | joining | error        // when overlay==matchmaking
modal           : none | identity | opponentPicker | incomingRequest
dialog          : none | confirmExit | info(section)
banner          : none | updateReady | error(msg) | toast(msg)
```

**Base-surface selection** (the core switch):

```
if !identityReady && needsIdentityNow → show identity gate (modal over Home)
else if matchPhase == countdown        → Countdown
else if matchPhase == ended            → End (solo or multiplayer variant)
else if inGame(matchPhase)             → Game board
else                                    → Home (with homeTab)
```

**State diagram (base surfaces + the transitions that move between them):**

```
                        ┌──────────────────────────── back / leave / resign(confirm) ─────────────┐
                        │                                                                          │
   [cold start] ──▶ Identity gate ──▶  HOME ──▶ (solo)   Opponent picker ─▶ Countdown ─▶ GAME ─▶ END
   [deep link]  ──▶ Identity gate ──▶ (auto-join) ─────────────────────────▶ Countdown ─▶ GAME ─▶ END
                                        │                                                    ▲   │
                                        ├▶ (online) Matchmaking overlay ─(opponent joins)────┘   │
                                        │     └─ Cancel ─▶ HOME                                   │
                                        │                                                        │
                     Incoming request ──┘  (Accept) ─▶ Matchmaking/Countdown                     │
                                                                                                 │
                             END ──(Rematch, both ready)──▶ Countdown ─▶ GAME                    │
                             END ──(Leave)──────────────────────────────▶ HOME ◀────────────────┘
```

The **base surface follows `matchPhase`**, which itself mirrors the authoritative match
document's `status` (see the protocol spec). The UI layer is a *projection* of that phase plus
a little hysteresis (don't bounce Game→Countdown on a late snapshot).

---

## 4. Screen-by-screen specification

Each screen lists: **purpose · slots (what it shows) · actions · entry · exit · states.**

### S1 — Identity gate (modal, first-run)
- **Purpose:** capture the display name before any networked action; establish "who you are".
- **Slots:** icon/mascot, title ("What's your name?"), one-line subtitle ("This is how others
  see you at the table"), single text input (length-capped, autofocus, no autocorrect),
  confirm button (disabled until non-empty after trim).
- **Actions:** Save (persist name, close, resume the pending action). No outside-dismiss — it's
  a gate.
- **Entry:** app start when profile loaded and no saved name; OR first time an online action is
  taken without a name (unless auto-fallback applies).
- **Exit:** name saved → closes to whatever base surface was underneath (Home, or a pending
  join continues automatically).
- **Auto-fallback rule:** for a *frictionless solo start* or a *deep-link join*, don't hard-gate —
  silently assign a fallback name ("Player-AB12" from the uid) so play proceeds; still let the
  player rename later from the profile affordance.
- **Reuse:** the same modal doubles as **Edit Name**, prefilled, dismissable, reached from the
  profile button.

### S2 — Home / Main menu (base surface)
The hub. Composed of a **persistent profile affordance**, a **content area that swaps per tab**,
and a **bottom tab bar**.

**S2.0 Profile / login affordance** (fixed corner, present on every home tab)
- Avatar (first initial or picture) + display name.
- When no name is set, this reads as the **"Sign in / Set name"** entry point (label like
  "Log in") — this *is* your login button; tapping it opens the identity modal.
- An explicit edit glyph; tapping anywhere on it opens Edit Name (or, later, a full account
  sheet if you add real auth).

**S2.1 Home tab** (default)
- **Slots:** game title + subtitle/tagline, decorative theme art, a **stats card** (a headline
  metric like win-rate + two supporting stats like games played / best streak), and the
  **primary play zone**.
- **Primary CTAs (the two core entry points):**
  1. `SOLO_LABEL` → opens the **Opponent picker** (S3).
  2. `ONLINE_LABEL` → starts the **online invite flow** (S4).
  Make these two visually dominant and distinct; everything else on Home is secondary.
- **On mount:** refresh stats; check for an app update (banner, see S12); fire a `home_view`
  analytics event.

**S2.2 Social / Friends tab**
- **Slots:**
  - **Pull-to-refresh** affordance (mobile) + manual refresh.
  - **Friends list** — each row: avatar, name, **liveness dot** (in-match / online / offline),
    head-to-head record (W/L/T), a context action, and a remove control.
  - The **context action adapts to liveness** (principle §1.5): online & free → "Challenge";
    in a match → disabled "In game"; offline → "Send link".
  - **Remove** uses an **inline confirm** (row morphs to "Remove? · Yes · Cancel"), not a
    separate dialog.
  - A **"New invite link"** button (same as the Home online CTA, for reach).
  - **Discovery section** ("Other players") — people not yet friends, each with an **Add**
    button. (Populate from a presence/recent-players source; keep it privacy-respecting.)
- **States:** loading (skeleton), empty ("No friends yet" / "No other players found"),
  populated. Auto-refresh on entering the tab if data is stale beyond a threshold.

**S2 tab bar**
- One item per `PRIMARY_SECTIONS`; icon + label; active item marked (`aria-current`).
- Switching tabs is instant, non-destructive, and re-checks for updates.

### S3 — Opponent / mode picker (modal)
- **Purpose:** choose the AI opponent (and by extension difficulty) before a solo game.
- **Slots:** title ("Choose opponent"), a selectable list of `OPPONENTS` (name + difficulty
  badge), a **blurb** describing the highlighted opponent, Cancel + Start.
- **Actions:** select (updates blurb + remembers as default), Start (closes, boots the solo
  game → Game surface directly, no countdown needed for solo), Cancel (close, `*_cancel` event).
- **Reuse:** the same picker is reachable **in-game** (a control in the game shell) to switch
  opponent / start a fresh solo game.

### S4 — Matchmaking / invite overlay (process overlay)
The online-entry funnel. One overlay, several steps, always cancelable.

- **Steps (`matchmakingStep`):**
  - `creating` — spinner, "Setting up the room…" (creating the match doc).
  - `sharing` — "Opening share…" (invoking the OS share sheet with the invite link/code).
  - `waiting` — the resting state: for a **link invite**, show "✓ Link copied" + guidance
    ("Paste it in WhatsApp/Messages to invite a friend") + a waiting animation + "Waiting for
    opponent…"; for a **direct challenge**, show "Invite sent to **{name}** — waiting for them
    to accept…".
  - `joining` — spinner, "Joining room…" (the invitee side, before the board hydrates).
  - `error` — ✕ icon, "Couldn't join", the specific reason, and the primary button becomes
    "Back to menu".
- **Actions:** Cancel (during waiting/creating → tear down the room via leave, return Home);
  on error → return Home. The button label flips between "Cancel" and "Back to menu" by step.
- **Exit (success):** opponent joins → match doc flips to `ready` → overlay auto-dismisses into
  **Countdown** (S6).
- **Two online sub-modes** feed this overlay:
  - **Link/share** (works for anyone, incl. offline friends and strangers): create room →
    share link → wait.
  - **Direct challenge** (online friend only, if `SUPPORTS_CHALLENGE`): create room → send an
    in-app request → wait for accept. On the *recipient's* device this raises S5.

### S5 — Incoming request / invite modal
- **Purpose:** let an online player accept/decline a direct challenge in-app.
- **Slots:** badge/icon, title ("Game invite"), "**{fromName}** invites you to play {GAME_NAME}",
  Decline + Accept.
- **Actions:** Accept → join the challenger's room → Countdown; Decline → dismiss, notify the
  sender (their overlay shows declined).
- **Gating:** suppress it while the recipient is already mid-countdown or mid-game — queue or
  auto-decline instead of interrupting a live match.

### S6 — Pre-match countdown / VS intro (base surface)
- **Purpose:** a short, synchronized "get ready" between room-ready and dealing; also the seam
  where both clients align before the first turn.
- **Slots:** "Match starting" / "Rematch" eyebrow, **VS layout** (you vs opponent: avatars,
  names, series wins), a slam **3 · 2 · 1 · GO** beat with haptics, "Dealing…" hint.
- **Actions:** none (auto-advances). Optional: allow backing out before GO (rare).
- **Entry:** `matchPhase == ready`. **Exit:** on completion → `matchPhase = playing` → Game.
- **Note:** solo games may skip this and go straight to the board; online games benefit from it
  as a synchronization + anticipation beat.

### S7 — In-game shell (base surface) — *chrome around the gameplay board*
The gameplay board itself is game-specific; this template defines the **shell** around it.

- **Opponent zone (top):** name, live score, captured/collected count, **active-turn
  indicator**, "thinking…"/typing indicator, and the **opponent's turn timer** when it's their
  move.
- **Board zone (center):** the game-specific play area (pile/board/rack) + play affordances.
- **Player zone (bottom):** the player's hand/controls, the player's score/collected count,
  the **local turn timer** (drives autoplay on expiry — see protocol spec), and — in **online
  mode only**, the **reaction controls** (see below). Solo has no reaction chrome.
- **Side/utility HUD:** the **series score** (e.g. "2 – 1"), round/hand number, resource
  counters (deck size, moves left), a **Resign/Leave** control (always present), and — in solo —
  a "Change opponent" control. Dev-only affordances stay behind a debug flag.
- **FX layers:** non-interactive overlays for animations (flying pieces, captures, score pops,
  incoming **emoji bursts** and **text/taunt bursts**). These never block input logically.
  Respect `prefers-reduced-motion` (suppress or instant-hide bursts).
- **Turn ownership:** clearly indicate whose turn it is on both sides; disable local input when
  it isn't the player's turn or while animating/dealing.

**S7.1 In-match reactions** (online / multiplayer chrome only; local player's bottom HUD)
A lightweight side-channel — not chat. Two sibling pickers share one cooldown so spam stays
bounded (protocol still caps the reactions array — see protocol spec).

- **Slots:** a stacked pair of trigger chips perched above the score/timer badge:
  1. **Text / taunt** — trigger label like "Aa"; opens an upward rail of `REACTION_TEXTS`
     (pill buttons, text sized to content).
  2. **Emoji** — trigger shows the last-sent emoji (default first of `REACTION_EMOJIS`);
     opens an upward rail of `REACTION_EMOJIS`.
- **Open behavior:** only one picker kind open at a time; tap the same trigger again to close.
  While open, a pick-window countdown (`REACT_PICK_MS`) auto-closes if nothing is chosen.
  Opening the other kind swaps which rail is open (still blocked while cooling down).
- **Pick → send:** emit a reaction of `{ kind: "emoji" | "text", value }` → protocol
  `sendEmoji` / `sendText` (or a unified `sendReaction`). Start the **shared** cooldown
  (`REACT_COOLDOWN_MS`); both triggers disable until it elapses (visible cool-fill).
- **FX:** remote and local reactions animate across the board — emoji as an emoji-burst,
  text as a text-burst — originating from the sender's HUD edge (top = opponent, bottom =
  local) and traveling toward the other player, then fading. Non-interactive; never steal
  focus or block plays.
- **Analytics:** `emoji_send` / `text_send` (include mode).
- **A11y:** each trigger has an expanded/cooldown label; options are labeled "Send {value}";
  rails are `aria-hidden` when closed and not tabbable until open.

### S8 — Resign / leave confirm (dialog)
- **Purpose:** guard the one destructive in-game action.
- **Slots:** title ("Leave game"), message **that differs by mode** — online: "You'll forfeit to
  your opponent. Continue?"; solo: "Return to menu? This match's score is lost." — Confirm +
  Cancel.
- **Actions:** Confirm → record the forfeit/result, leave the room (protocol spec), return Home;
  Cancel → close, resume.

### S9 — Info / help dialogs (dialog)
- **Purpose:** on-demand explanation without leaving the board (e.g. tap a score to see its
  breakdown; a rules/scoring reference).
- **Slots:** contextual title, the breakdown/explanation, Close.
- **Actions:** Close only. Non-destructive, dismiss-anywhere.

### S10 — End screens (base surface) — two variants
Shared purpose: present the outcome, the standings, and the **next-step choice**.

**S10a — Solo end**
- **Slots:** result (win/lose/tie), score breakdown per side, series score, celebratory FX.
- **Actions:** **Play again / Next game** (reboot solo, same opponent) and **Leave** (→ Home).

**S10b — Multiplayer end**
- **Slots:** result stamp (Win / Lose / Tie), and when the game ended by **forfeit/disconnect** a
  reason line ("Opponent left the table" / "Opponent lost connection" / "Opponent resigned");
  per-player score breakdown; **room/series score**; **head-to-head lifetime record**; FX
  keyed to the result.
- **Actions:**
  - **Rematch** — a *negotiated* action: tapping sets your "ready"; the button reflects the
    joint state → `Rematch` → (you tapped) `Waiting for opponent…` → (they also tapped)
    `Dealing…`; if the opponent asks first, show a **nudge** state ("Opponent wants a rematch!").
    Disable rematch when the game ended by forfeit/opponent-left (there's no one to rematch).
  - **Leave the table** → tear down, return Home.
- Both-ready rematch loops back to **Countdown** (round + 1, winner leads — protocol spec).

### S11 — Reconnect / loading (process overlay)
- **Purpose:** cover the gap while a rejoined match hydrates from `seed + moves` (protocol spec).
- **Slots:** spinner, "Loading match…", and — critically — an **Exit / Forfeit** escape hatch so
  a wedged hydrate never traps the player.
- **Entry:** app relaunch/refresh with a saved session; deep-link into an in-progress match.
- **Exit:** first authoritative snapshot arrives → Game or End; or user taps Exit → leave → Home.

### S12 — System banners (banner/toast)
- **Update available:** when a new app version is detected (check on menu engagement / tab
  switches, not on a tight timer), show a non-blocking banner offering reload. Never interrupt a
  live game to update.
- **Error toast:** transient failures (couldn't send challenge, network blip) surface as a
  dismissible toast; hard failures route to the matchmaking `error` step instead.
- **Ephemeral confirmations:** "Link copied", "Friend added" — brief, auto-dismissing.

---

## 5. End-to-end entry flows (author these as explicit sequences)

Each flow is a chain of surfaces + the state that drives it. Implement and test each.

1. **Cold start (new user):**
   `launch → (profile loads, no name) → Identity gate → save → HOME(Home tab)`.

2. **Cold start (returning user):** `launch → HOME` (name restored; no gate).

3. **Deep-link join** (`SUPPORTS_DEEP_LINK`):
   `open invite URL → (auto-fallback name if none) → Matchmaking(joining) → Countdown → GAME`.
   If a *different* saved session exists, the fresh invite wins (protocol spec §reconnect).

4. **Solo game:**
   `HOME → SOLO_LABEL → Opponent picker → Start → GAME → (game over) → Solo end →
   {Play again → GAME | Leave → HOME}`.

5. **Online via link/share:**
   `HOME/Friends → ONLINE_LABEL/New invite → Matchmaking(creating→sharing→waiting) →
   (opponent joins) → Countdown → GAME → MP end → {Rematch → Countdown | Leave → HOME}`.

6. **Online via direct challenge** (`SUPPORTS_CHALLENGE`, target online & free):
   `Friends → Challenge → Matchmaking(creating→waiting: "invite sent") →
   (accepted) → Countdown → GAME`. **Recipient:** `Incoming request modal → Accept → Countdown`.

7. **Rejoin in-progress match:**
   `launch with saved session → Reconnect overlay → (snapshot) → GAME or MP end`.

8. **Cancel paths:** from Matchmaking(any) or Reconnect → Cancel/Exit → leave room → HOME.

---

## 6. Cross-cutting UX rules

- **Identity before network, never before fun.** Gate the name on the first *online* action;
  auto-fallback for solo and deep-link so nothing blocks play.
- **Presence-adaptive actions** (§1.5): compute online/in-match/offline from a heartbeat
  timestamp window; pick the CTA (challenge vs link vs disabled) from it; disable actions that
  can't succeed.
- **Cancelability & safe back:** every process overlay and gate defines Cancel/Back → a known
  safe surface + server cleanup. No trapped states.
- **Confirmation discipline:** confirm forfeit/leave-live/remove-friend; never confirm
  tab-switch/picker/start.
- **Loading / empty / error for every data surface:** friends, other-players, stats, match
  hydrate. Design all three.
- **Optimistic + reconciled:** reflect the local action immediately (selected opponent, "ready"
  for rematch, sent challenge) and reconcile when the server confirms; roll back visibly on
  failure.
- **Single source of truth for phase:** the base surface is a pure function of `matchPhase`
  (mirroring the doc status) + gates. Don't drive it from scattered booleans that can disagree.
- **Analytics on every edge:** `home_view`, `nav_tab_click`, `play_cta_click`, `*_picker_open/
  cancel`, `invite_share`, `challenge_send`, `match_start`, `rematch`, `*_leave`, `resign_*`,
  `emoji_send`, `text_send`.
- **In-match reactions are rate-limited in the shell:** one shared cooldown across emoji and
  text pickers; preset-only options (no free-text keyboard); online playing phase only.
- **Accessibility:** label every control; mark the active tab (`aria-current`); focus-trap
  modals and restore focus on close; respect reduced-motion for the countdown/FX (including
  reaction bursts); ensure liveness/turn state isn't conveyed by color alone (dot + text label).
- **Localization & length:** all copy is externalized; layouts tolerate long names/labels; avoid
  baking text into images.
- **Don't interrupt a live game:** updates, incoming requests, and non-critical banners defer
  until the player is out of an active match.

---

## 7. Client-agnostic navigation contract

Model each surface as a component that receives **state in** and emits **intents out** — no
surface calls the network or mutates global state directly; it renders state and reports intent
to a coordinator. This keeps the whole layer portable across clients.

```ts
// The coordinator owns this and derives the base surface from it (see §3).
interface NavState {
  identityReady: boolean
  displayName: string | null
  baseSurface: "home" | "countdown" | "game" | "end"
  homeTab: string                       // one of PRIMARY_SECTIONS
  matchPhase: "idle" | "creating" | "waiting" | "ready" | "playing" | "ended"
  overlay: "none" | "matchmaking" | "reconnect"
  matchmakingStep: "creating" | "sharing" | "waiting" | "joining" | "error"
  modal: "none" | "identity" | "opponentPicker" | "incomingRequest"
  dialog: "none" | "confirmExit" | "info"
  banner: "none" | "updateReady" | "error" | "toast"
  incomingRequest: { fromName: string } | null
  error: string | null
}

// Surfaces emit intents; the coordinator maps them to protocol calls + state changes.
type NavIntent =
  | { t: "setName"; name: string }
  | { t: "openEditName" }
  | { t: "switchTab"; tab: string }
  | { t: "startSolo"; opponentId: string }
  | { t: "openOpponentPicker" } | { t: "cancelOpponentPicker" }
  | { t: "startOnlineLink" }                      // create room + share
  | { t: "challengeFriend"; uid: string }         // create room + send request
  | { t: "cancelMatchmaking" }
  | { t: "acceptRequest" } | { t: "declineRequest" }
  | { t: "countdownComplete" }
  | { t: "requestRematch" }
  | { t: "leaveMatch"; forfeit: boolean }         // may open confirmExit first
  | { t: "confirmExit" } | { t: "cancelExit" }
  | { t: "openInfo"; section: string } | { t: "closeInfo" }
  | { t: "addFriend"; uid: string } | { t: "removeFriend"; uid: string }
  | { t: "refreshSocial" }
  | { t: "applyUpdate" } | { t: "dismissBanner" }
  | { t: "exitReconnect" }
  | { t: "sendReaction"; kind: "emoji" | "text"; value: string }  // in-game shell, MP only
```

The coordinator translates intents into protocol-layer calls (`createRoom`, `joinRoom`,
`requestRematch`, `leave`, presence, friends, `sendEmoji` / `sendText`) and updates
`NavState`; surfaces stay pure views. Swap the surface implementations per platform, keep
the coordinator + `NavState` shape. In-match reaction FX are driven by the match doc's
`reactions` array (protocol spec), not by optimistic-only local state — append locally via
the port, then animate when the snapshot (or the same write path) delivers the entry.

---

## 8. Surface inventory & readiness checklist

Ship-readiness matrix — every surface needs its loading/empty/error/back cells filled.

| # | Surface | Class | Back/Cancel does | Loading | Empty | Error |
|---|---|---|---|---|---|---|
| S1 | Identity gate | modal (gate) | — (no dismiss) | — | disabled Save | inline (bad input) |
| S2 | Home + tabs | base | — (root) | stats skeleton | — | — |
| S2.2 | Social tab | base (tab) | — | skeleton | "no friends"/"no players" | retry |
| S3 | Opponent picker | modal | close → Home | — | fallback opponent | — |
| S4 | Matchmaking overlay | process | leave room → Home | spinner steps | — | error step + Back |
| S5 | Incoming request | modal | decline | — | — | auto-decline if busy |
| S6 | Countdown | base | (optional) back → Home | — | — | — |
| S7 | Game shell | base | Resign (confirm) | deal/hydrate | — | reconnect overlay |
| S7.1 | Reaction pickers (emoji + text) | shell chrome | close / auto-timeout | cool-fill | — | toast on send fail |
| S8 | Resign confirm | dialog | cancel → resume | — | — | — |
| S9 | Info dialog | dialog | close | — | — | — |
| S10 | End (solo/MP) | base | Leave → Home | — | — | show forfeit reason |
| S11 | Reconnect | process | exit/forfeit → Home | spinner | — | exit hatch |
| S12 | Banners/toasts | banner | dismiss | — | — | is the error surface |

---

## 9. Edge cases the navigation layer MUST handle

1. **No name yet + taps online CTA** → identity gate first, then resume the *same* action.
2. **Deep-link arrives while a stale session is saved** → fresh invite wins; don't reopen the
   old game (protocol spec).
3. **Opponent joins while you're on the "waiting" overlay** → auto-advance to Countdown; don't
   leave the player stuck on the spinner.
4. **Incoming challenge while already in a game / countdown** → suppress or queue; never yank the
   player out of a live match.
5. **Cancel during creating/waiting** → tear down the half-created room (leave) so you don't
   orphan an empty room the invitee could later "join".
6. **Rematch race** (both tap together) → UI resolves to a single "Dealing…" and one new round,
   not two (protocol spec transaction).
7. **Opponent leaves at the End screen** → rematch button disables and reflects "Opponent left".
8. **Refresh mid-game** → Reconnect overlay → hydrate → land on the correct surface (Game or End)
   at the correct position.
9. **Update detected mid-match** → banner waits; apply only after the match, or on next Home.
10. **Tab switch during a background refresh** → don't flicker to empty; keep last data, overlay
    a subtle refreshing indicator.
11. **Wedged hydrate / dead room on rejoin** → the Reconnect exit hatch and the protocol's
    staleness guards return the player to Home cleanly.
12. **Long / RTL / emoji display names** → rows, VS layout, and end screen tolerate them without
    clipping.
13. **Reaction spam / dual picker** → shared cooldown blocks both emoji and text triggers after
    any send; only one rail open at a time; pick window auto-closes; reduced-motion clients
    skip burst FX without blocking the send itself.
14. **Reaction send outside playing** → shell hides pickers (or no-ops) unless
    `matchPhase == playing` and mode is online — never on End, Countdown, or solo.

---

### Deliverables

1. A **navigation coordinator** owning `NavState` (§7) that derives the base surface (§3) and
   maps `NavIntent`s to protocol-layer calls.
2. Each surface S1–S12 (including S7.1 reaction chrome) implemented per §4, with its
   loading/empty/error/back states (§8).
3. The seven entry flows (§5) wired and tested, including all cancel paths.
4. Cross-cutting rules (§6) applied globally: identity gating, presence-adaptive CTAs,
   cancelability, confirmation discipline, analytics on every edge, accessibility.
5. Edge-case coverage (§9), especially the identity-gate-then-resume, deep-link-vs-session,
   auto-advance-on-join, and rejoin-hydrate paths.

Build surfaces as pure projections of `NavState`; route all side effects through the
coordinator; keep gameplay, matchmaking, and presence behind their own layers. That separation
is what makes this navigation template reusable across every future turn-based game.
