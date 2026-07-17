import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanInfo } from 'framer-motion'
import { CaptureLayer, type CaptureState } from './components/CaptureLayer'
import { FlyingCardLayer } from './components/FlyingCardLayer'
import {
  createFlyingCardFromThrow,
  createOpponentFlyingCard,
  type FlyingCardState,
  type LandingResult,
} from './components/flyingCard'
import { ConfirmDialog } from './components/ConfirmDialog'
import { GameOver } from './components/GameOver'
import { Hud } from './components/Hud'
import { OpponentArea } from './components/OpponentArea'
import { OpponentPicker } from './components/OpponentPicker'
import { PlayerHand } from './components/PlayerHand'
import { ScoreInfoDialog } from './components/ScoreInfoDialog'
import { StartScreen } from './components/StartScreen'
import { TablePile, type PileVisuals } from './components/TablePile'
import { ScorePopLayer, type ScorePop } from './components/ScorePopLayer'
import { NamePromptModal } from './app/NamePromptModal'
import { FriendMatchOverlay } from './app/FriendMatchOverlay'
import { GameRequestModal } from './app/GameRequestModal'
import { CountdownScreen } from './app/CountdownScreen'
import { TURN_TIMER } from './app/TurnTimer'
import { MultiplayerEndOverlay } from './app/MultiplayerEndOverlay'
import { useFriends } from './app/useFriends'
import { useMultiplayer, type MultiplayerState } from './app/useMultiplayer'
import { usePlayerProfile } from './app/usePlayerProfile'
import { useUserPresence } from './app/useUserPresence'
import { getJoinCodeFromUrl, setJoinCodeInUrl, clearGameUrl, pushSoloGameUrl, shareInviteLink } from './app/shareInvite'
import { getBot } from './game/bots/registry'
import { runTournament } from './game/bots/selfplay'
import type { Card as CardType } from './game/cards'
import { vibrate, TAP, CAPTURE, PISTI, DOUBLE_PISTI, TRIPLE_PISTI, QUAD_PISTI, EXTREME_PISTI, WIN } from './game/haptics'
import {
  clearContinueParam,
  clearGame,
  hasContinueParam,
  readContinuedGame,
  saveGame,
  setContinueParam,
} from './game/gamePersistence'
import { getLifetimeStats, recordHandResult } from './game/lifetimeStats'
import type { FriendEntry, GameRequest, UserLifetimeStats } from './ports'
import { useGame, hydrateGameState, blankMpWaitingState, type PlayResult, type Turn, type GameState } from './game/useGame'
import {
  cardPoints,
  computeScoreboard,
  DOUBLE_PISTI_BONUS,
  PISTI_BONUS,
  type Scoreboard,
} from './game/rules'
import { TIMING } from './motion/params'
import { FirebaseMultiplayerAdapter } from './adapters/FirebaseMultiplayerAdapter'
import { FirebaseFriendsAdapter } from './adapters/FirebaseFriendsAdapter'
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter'
import { ensureAnonymousAuth } from './firebase/config'

const storage = new LocalStorageAdapter()
const mpAdapter = new FirebaseMultiplayerAdapter()
const friendsAdapter = new FirebaseFriendsAdapter()

/** Survives Strict Mode remount (useRef resets and would double-join). */
const joinBootstrapCodes = new Set<string>()

const CAPTURE_TOTAL_MS = (TIMING.capturePause + TIMING.captureMove) * 1000 + 120
const DEAL_ANIM_MS = 950
const TURN_MS = TURN_TIMER.TURN_MS
const HEARTBEAT_FORFEIT_MS = 30_000

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[pisti]', ...args)
}

function capturePoints(result: PlayResult): number {
  const cards = result.capturedCards.reduce((sum, c) => sum + cardPoints(c), 0)
  const bonus = result.doublePisti ? DOUBLE_PISTI_BONUS : result.pisti ? PISTI_BONUS : 0
  return cards + bonus
}

/** Auto-play strategy for turn-timer expiry: rank-match > jack > random */
function pickAutoPlayCard(hand: CardType[], pile: CardType[]): CardType {
  if (hand.length === 0) throw new Error('Empty hand')
  const top = pile.length > 0 ? pile[pile.length - 1] : null
  if (top) {
    const match = hand.find((c) => c.rank === top.rank)
    if (match) return match
    const jack = hand.find((c) => c.rank === 'J')
    if (jack) return jack
  }
  return hand[Math.floor(Math.random() * hand.length)]
}

/** Dev-only: fake end-screen payload so we can preview the MP overlay with `e`. */
function makeDebugMpEnd(): { gameState: GameState; mpState: MultiplayerState } {
  const myPts = 40 + Math.floor(Math.random() * 80)
  const oppPts = 40 + Math.floor(Math.random() * 80)
  const winner: Scoreboard['winner'] =
    myPts === oppPts ? 'tie' : myPts > oppPts ? 'player' : 'opponent'
  const side = (total: number, pisti: number, dbl: number) => ({
    cardCount: 10 + Math.floor(Math.random() * 20),
    cardPoints: Math.max(0, total - pisti * 10 - dbl * 20 - (Math.random() > 0.5 ? 3 : 0)),
    pistiCount: pisti,
    doublePistiCount: dbl,
    pistiPoints: pisti * 10 + dbl * 20,
    majorityBonus: Math.random() > 0.5 ? 3 : 0,
    total,
  })
  const scoreboard: Scoreboard = {
    player: side(myPts, Math.floor(Math.random() * 3), Math.floor(Math.random() * 2)),
    opponent: side(oppPts, Math.floor(Math.random() * 3), Math.floor(Math.random() * 2)),
    winner,
  }
  const games = {
    player: (winner === 'player' ? 1 : 0) + Math.floor(Math.random() * 3),
    opponent: (winner === 'opponent' ? 1 : 0) + Math.floor(Math.random() * 3),
  }
  const gameState: GameState = {
    ...blankMpWaitingState(),
    gameOver: true,
    scoreboard,
    games,
    playerCollected: Array.from({ length: scoreboard.player.cardCount }, (_, i) => ({
      id: `dbg-p-${i}`,
      suit: 'hearts' as const,
      rank: 'A' as const,
    })),
    opponentCollected: Array.from({ length: scoreboard.opponent.cardCount }, (_, i) => ({
      id: `dbg-o-${i}`,
      suit: 'spades' as const,
      rank: 'K' as const,
    })),
  }
  const mpState: MultiplayerState = {
    phase: 'ended',
    matchId: 'debug',
    inviteCode: 'DEBUG',
    seed: 'debug',
    round: 1,
    localSeat: 0,
    firstSeat: 0,
    moves: [],
    turnDeadline: 0,
    opponentUid: 'opp',
    opponentName: 'Rakip',
    opponentLastSeen: Date.now(),
    opponentResigned: false,
    opponentLeft: false,
    localWantsRematch: false,
    opponentWantsRematch: false,
    endedReason: 'completed',
    winnerUid: null,
    error: null,
  }
  return { gameState, mpState }
}

export default function App() {
  // If the URL has a join code we're restoring a multiplayer session — never
  // flash a random solo deal (that was the "cards change on refresh" bug).
  const joiningFromUrl = Boolean(getJoinCodeFromUrl())
  const [continuedGame] = useState(() => (joiningFromUrl ? null : readContinuedGame()))
  const {
    state,
    canPlayerAct,
    nextGame,
    chooseBot,
    reorderPlayerHand,
    playPlayerCard,
    playOpponentCard,
    applyRemoteCard,
    resetToState,
    resolvePlay,
  } = useGame(joiningFromUrl ? blankMpWaitingState() : continuedGame ?? undefined)

  // True once we've hydrated at least once from Firestore for this page load.
  const [mpHydrated, setMpHydrated] = useState(!joiningFromUrl)

  // ── Profile ──────────────────────────────────────────────────────────────
  const { username, saveUsername, loaded: profileLoaded } = usePlayerProfile(storage)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [editingName, setEditingName] = useState(false)

  useEffect(() => {
    if (profileLoaded && !username.trim()) setShowNamePrompt(true)
  }, [profileLoaded, username])

  const handleSaveName = useCallback((name: string) => {
    void saveUsername(name)
    void friendsAdapter.syncProfile(name)
    mpAdapter.setDisplayName(name)
    setShowNamePrompt(false)
    setEditingName(false)
  }, [saveUsername])

  const handleSkipName = useCallback(() => {
    setShowNamePrompt(false)
  }, [])

  useEffect(() => {
    if (username) {
      mpAdapter.setDisplayName(username)
      void friendsAdapter.syncProfile(username)
      void friendsAdapter.syncLifetimeStats(getLifetimeStats())
    }
  }, [username])

  const {
    friendList,
    loading: friendsLoading,
    refresh: refreshFriends,
    incomingRequest,
    sendChallenge,
    acceptRequest,
    declineRequest,
    cancelOutgoingRequest,
  } = useFriends(friendsAdapter, true)
  const [invitingUid, setInvitingUid] = useState<string | null>(null)
  const [challengedName, setChallengedName] = useState<string | null>(null)
  const outgoingRequestIdRef = useRef<string | null>(null)

  // ── Multiplayer hook ─────────────────────────────────────────────────────
  const {
    mpState,
    createRoom,
    joinRoom,
    rejoinMatch,
    startPlaying,
    setTurnDeadline,
    requestRematch,
    leave,
    forfeitForHeartbeat,
  } = useMultiplayer(mpAdapter, username)

  const isMpMode = mpState.phase !== 'idle'

  // Stay "in match" through lobby + end screen; clear only when fully idle
  const presenceInMatch =
    isMpMode &&
    (mpState.phase === 'creating' ||
      mpState.phase === 'waiting' ||
      mpState.phase === 'countdown' ||
      mpState.phase === 'playing' ||
      mpState.phase === 'ended')

  useUserPresence(
    friendsAdapter,
    username,
    presenceInMatch,
    mpState.matchId ?? undefined,
    true,
  )

  const clearPresence = useCallback(() => {
    void friendsAdapter.setPresence(false)
  }, [])

  // How many moves from mpState.moves we have already applied to local game state.
  // Incremented when: (a) local player publishes a move (pre-increment), (b) remote move is animated.
  const appliedMovesRef = useRef(0)
  // Seed of the last hydrated match — changing seed triggers a new hydration.
  const prevSeedRef = useRef<string | null>(null)
  // Guard against writing status:ended to Firestore more than once per hand.
  const mpGameOverWrittenRef = useRef(false)
  // Chains playMove promises so we never mark the match ended before the last move is on Firestore.
  const publishChainRef = useRef(Promise.resolve())
  // After phase→ended, we sync local state from the move log before showing the end screen.
  const [mpEndSynced, setMpEndSynced] = useState(false)
  // Blocks autoplay / throws once the local player has chosen to exit.
  const leavingRef = useRef(false)

  // ── Deep link join ───────────────────────────────────────────────────────
  // Strict Mode mounts effects twice in dev — module Set survives remount.
  useEffect(() => {
    const code = getJoinCodeFromUrl()?.trim().toUpperCase()
    if (!code) return
    if (joinBootstrapCodes.has(code)) return
    joinBootstrapCodes.add(code)

    const session = storage.loadSession()
    // Only rejoin a saved match when the URL points at THAT same room.
    // A different (or brand-new) invite code always wins — otherwise pasting a
    // fresh link would reopen the previous game and rewrite the URL.
    const sameRoom =
      session != null &&
      session.inviteCode.trim().toUpperCase() === code

    if (sameRoom) {
      log('Rejoining saved session', session.matchId, code)
      void rejoinMatch(session.matchId)
    } else {
      if (session) {
        log('URL invite differs from saved session — joining new room', {
          url: code,
          saved: session.inviteCode,
        })
        storage.clearSession()
      } else {
        log('Fresh join via URL code', code)
      }
      setMpOverlayPhase('joining')
      void joinRoom(code).catch(() => {
        // Allow a manual retry after failure (e.g. host not ready yet)
        joinBootstrapCodes.delete(code)
        // Keep overlay open so the joiner sees why join failed (e.g. host gone)
        setMpOverlayPhase('error')
        setMpHydrated(true)
      })
    }
    setStarted(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── UI state ─────────────────────────────────────────────────────────────
  const [resignOpen, setResignOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scoreInfoSide, setScoreInfoSide] = useState<Turn | null>(null)
  const [started, setStarted] = useState(() => continuedGame !== null)
  const [mpOverlayPhase, setMpOverlayPhase] = useState<'idle' | 'creating' | 'sharing' | 'waiting' | 'joining' | 'error'>('idle')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [showCountdown, setShowCountdown] = useState(false)
  const [debugMpEnd, setDebugMpEnd] = useState<ReturnType<typeof makeDebugMpEnd> | null>(null)
  const [lifetime, setLifetime] = useState<UserLifetimeStats>(() => getLifetimeStats())
  const [opponentLifetime, setOpponentLifetime] = useState<UserLifetimeStats | null>(null)

  // Refresh friends when returning home, and poll so opponent leave/presence updates show up
  useEffect(() => {
    if (started) return
    void refreshFriends()
    const interval = window.setInterval(() => {
      void refreshFriends({ silent: true })
    }, 12_000)
    return () => window.clearInterval(interval)
  }, [started, refreshFriends])

  // Dev: press `e` to preview the multiplayer end overlay with random scores
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      setDebugMpEnd((prev) => (prev ? null : makeDebugMpEnd()))
      if (!debugMpEnd) {
        setLifetime(getLifetimeStats())
        setOpponentLifetime({
          handsWon: 5 + Math.floor(Math.random() * 40),
          handsPlayed: 20 + Math.floor(Math.random() * 80),
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [debugMpEnd])

  // Refresh lifetime + fetch opponent stats when the end screen opens
  useEffect(() => {
    const showEnd = (isMpMode && mpState.phase === 'ended') || !!debugMpEnd
    if (!showEnd) return
    setLifetime(getLifetimeStats())
    const oppUid = debugMpEnd ? null : mpState.opponentUid
    if (!oppUid) return
    let cancelled = false
    void friendsAdapter.getUserStats(oppUid).then((stats) => {
      if (!cancelled) setOpponentLifetime(stats)
    })
    return () => { cancelled = true }
  }, [isMpMode, mpState.phase, mpState.opponentUid, debugMpEnd])

  // Always use live state from useGame — never a stale snapshot
  const opponentName = isMpMode ? (mpState.opponentName ?? 'Rakip') : getBot(state.activeBotId).name
  const playerName = username.trim() || 'Sen'

  // ── Animation state ───────────────────────────────────────────────────────
  const pileRef = useRef<HTMLDivElement>(null)
  const opponentHandRef = useRef<HTMLDivElement>(null)
  const sideHudRef = useRef<HTMLDivElement>(null)
  const playerScoreRef = useRef<HTMLSpanElement>(null)
  const opponentScoreRef = useRef<HTMLSpanElement>(null)
  const [flying, setFlying] = useState<FlyingCardState | null>(null)
  const [capture, setCapture] = useState<CaptureState | null>(null)
  const [scorePop, setScorePop] = useState<ScorePop | null>(null)
  const [pileHighlight, setPileHighlight] = useState(false)
  const [pileVisuals, setPileVisuals] = useState<PileVisuals>({})
  const [shaking, setShaking] = useState<false | 'soft' | 'hard'>(false)
  const [dealing, setDealing] = useState(true)
  const captureResultRef = useRef<PlayResult | null>(null)
  const landTimerRef = useRef<number | null>(null)
  const captureTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)
  const scorePopTimerRef = useRef<number | null>(null)
  const pistiTriggerCountRef = useRef(0)
  const recordedHandRef = useRef(continuedGame?.gameNumber ?? 0)

  // Stable refs used inside callbacks to avoid stale closures
  const flyingRef = useRef(flying); flyingRef.current = flying
  const captureRef = useRef(capture); captureRef.current = capture
  const canPlayerActRef = useRef(canPlayerAct); canPlayerActRef.current = canPlayerAct

  // ── Deal animation pause ─────────────────────────────────────────────────
  useEffect(() => {
    setDealing(true)
    const timer = window.setTimeout(() => setDealing(false), DEAL_ANIM_MS)
    return () => window.clearTimeout(timer)
  }, [state.dealSerial])

  // ── Solo persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isMpMode) return
    if (!state.gameOver || !state.scoreboard) return
    if (recordedHandRef.current === state.gameNumber) return
    recordedHandRef.current = state.gameNumber
    recordHandResult(state.scoreboard.winner === 'player')
    void friendsAdapter.syncLifetimeStats(getLifetimeStats())
    if (state.scoreboard.winner === 'player') vibrate(WIN)
  }, [isMpMode, state.gameOver, state.scoreboard, state.gameNumber])

  useEffect(() => {
    if (isMpMode) return
    if (!started || state.phase !== 'idle') return
    saveGame(state)
  }, [isMpMode, started, state])

  useEffect(() => {
    if (continuedGame === null && hasContinueParam()) clearContinueParam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Browser back button navigation ────────────────────────────────────────
  // When the user presses back while in-game, return them to the start screen.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const isHomePage = !params.has('play') && !params.has('join')
      if (isHomePage && started) {
        resetTransient()
        if (isMpMode) {
          leavingRef.current = true
          clearPresence()
          void leave(true)
          prevSeedRef.current = null
          appliedMovesRef.current = 0
          mpGameOverWrittenRef.current = false
          setMpOverlayPhase('idle')
          setInviteCopied(false)
          setShowCountdown(false)
          storage.clearSession()
        } else {
          clearGame()
          clearContinueParam()
        }
        setStarted(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  // We intentionally capture the stable refs and callbacks, not reactive state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, isMpMode])

  // ── MP: save session + update URL when we know our invite code ────────────
  useEffect(() => {
    if (leavingRef.current) return
    if (!isMpMode) return
    if (!mpState.inviteCode || !mpState.matchId) return
    if (mpState.phase === 'ended' || mpState.phase === 'idle') return
    setJoinCodeInUrl(mpState.inviteCode)
    storage.saveSession({ matchId: mpState.matchId, inviteCode: mpState.inviteCode })
  }, [isMpMode, mpState.inviteCode, mpState.matchId, mpState.phase])

  // ── MP: countdown + clear stale lobby overlay once the match is underway ──
  useEffect(() => {
    if (mpState.phase === 'countdown') {
      setShowCountdown(true)
      setMpOverlayPhase('idle')
      setInviteCopied(false)
      setChallengedName(null)
      outgoingRequestIdRef.current = null
    } else if (mpState.phase === 'playing') {
      // Rejoin can skip countdown — still clear joining/waiting overlay
      setMpOverlayPhase('idle')
      setInviteCopied(false)
      setChallengedName(null)
      outgoingRequestIdRef.current = null
    }
  }, [mpState.phase])

  // ── MP: hydrate game state from Firestore moves whenever seed changes ─────
  // This covers: fresh match start (after countdown), rejoin into active game,
  // and rematch (new seed). Using seed as the key means we only hydrate once
  // per unique match, even if snapshot fires multiple times.
  // Keep a ref of current games score so we can carry it across rematches
  const gamesRef = useRef(state.games)
  useEffect(() => { gamesRef.current = state.games }, [state.games])

  useEffect(() => {
    if (!isMpMode) { prevSeedRef.current = null; return }
    if (mpState.phase !== 'playing') return
    if (!mpState.seed || mpState.localSeat === null || mpState.firstSeat === null) return
    if (mpState.seed === prevSeedRef.current) return // already hydrated this seed

    const isFirstMatch = prevSeedRef.current === null
    prevSeedRef.current = mpState.seed

    // Carry over match scores across rematches, start at 0-0 for a new match
    const games = isFirstMatch ? { player: 0, opponent: 0 } : gamesRef.current

    log('Hydrating from seed', { seed: mpState.seed, moves: mpState.moves.length, games, localSeat: mpState.localSeat })
    const hydrated = hydrateGameState(
      mpState.seed,
      mpState.moves,
      mpState.localSeat,
      mpState.firstSeat,
      games,
      mpState.round,
    )

    resetTransient()
    resetToState(hydrated)
    appliedMovesRef.current = mpState.moves.length
    // Only mark the hand recorded if it was already finished when we hydrated
    // (rejoin after game over). An in-progress hand must still be recordable.
    recordedHandRef.current = hydrated.gameOver ? hydrated.gameNumber : hydrated.gameNumber - 1
    setMpHydrated(true)
    setStarted(true)

    // Add opponent as friend when match starts (first match only, not rematch)
    if (isFirstMatch && mpState.opponentUid && mpState.opponentName) {
      void friendsAdapter.isFriend(mpState.opponentUid).then((already) => {
        if (!already && mpState.opponentUid && mpState.opponentName) {
          void friendsAdapter.addFriend(mpState.opponentUid, mpState.opponentName).then(() => {
            void refreshFriends()
          })
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally omit mpState.moves and mpState.round — we only want to re-hydrate on seed change
  }, [isMpMode, mpState.phase, mpState.seed, mpState.localSeat, mpState.firstSeat])

  // ── MP: record hand result when game ends in MP mode ─────────────────────
  useEffect(() => {
    if (!isMpMode) return
    if (!state.gameOver || !state.scoreboard) return
    if (recordedHandRef.current === state.gameNumber) return
    recordedHandRef.current = state.gameNumber
    const won = state.scoreboard.winner === 'player'
    const tied = state.scoreboard.winner === 'tie'
    recordHandResult(won)
    void friendsAdapter.syncLifetimeStats(getLifetimeStats())
    if (mpState.opponentUid && mpState.opponentName) {
      const result = tied ? 'tie' : won ? 'win' : 'lose'
      const resultId = mpState.matchId
        ? `${mpState.matchId}_${state.gameNumber}`
        : undefined
      void friendsAdapter.recordMatchResult(
        mpState.opponentUid,
        mpState.opponentName,
        result,
        resultId,
      )
    }
    if (won) vibrate(WIN)
  }, [
    isMpMode,
    state.gameOver,
    state.scoreboard,
    state.gameNumber,
    mpState.opponentUid,
    mpState.opponentName,
    mpState.matchId,
  ])

  // ── MP: when match ends, force-sync final score from the shared move log ───
  // Critical: the Firestore `ended` snapshot can arrive on the loser BEFORE the
  // last remote card is animated in. The remote-move effect also stops once
  // phase !== 'playing', so without this the loser would show Berabere / 0–0.
  useEffect(() => {
    if (mpState.phase !== 'ended') {
      setMpEndSynced(false)
      return
    }

    // Forfeits / disconnects — opponent quit mid-hand; award the match win (1–0 etc.)
    if (
      mpState.endedReason === 'forfeit_heartbeat' ||
      mpState.endedReason === 'resign' ||
      mpState.opponentResigned ||
      mpState.opponentLeft
    ) {
      const resultId = mpState.matchId
        ? `${mpState.matchId}_${state.gameNumber}_forfeit`
        : undefined

      if (!state.gameOver) {
        resetToState({
          ...state,
          gameOver: true,
          scoreboard: null,
          games: {
            player: state.games.player + 1,
            opponent: state.games.opponent,
          },
        })
      }

      // Record H2H even if gameOver was already set (hydrate / race)
      if (recordedHandRef.current !== state.gameNumber) {
        recordedHandRef.current = state.gameNumber
        recordHandResult(true)
        void friendsAdapter.syncLifetimeStats(getLifetimeStats())
        if (mpState.opponentUid && mpState.opponentName) {
          void friendsAdapter.recordMatchResult(
            mpState.opponentUid,
            mpState.opponentName,
            'win',
            resultId,
          )
        }
        vibrate(WIN)
      }
      setMpEndSynced(true)
      return
    }

    if (!mpState.seed || mpState.localSeat === null || mpState.firstSeat === null) return

    // Winner (or anyone who already resolved the last card) already has the truth
    if (state.gameOver && state.scoreboard) {
      setMpEndSynced(true)
      return
    }

    // Rebuild from seed + full move log. `state.games` is still the pre-hand
    // match score here, so hydrate will add this hand's win exactly once.
    log('End-sync hydrate', { moves: mpState.moves.length, games: state.games })
    const hydrated = hydrateGameState(
      mpState.seed,
      mpState.moves,
      mpState.localSeat,
      mpState.firstSeat,
      state.games,
      mpState.round,
    )
    // Last move may not have landed on Firestore yet — wait for the next snapshot
    if (!hydrated.gameOver || !hydrated.scoreboard) return

    resetTransient()
    resetToState(hydrated)
    appliedMovesRef.current = mpState.moves.length
    setMpEndSynced(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mpState.phase,
    mpState.endedReason,
    mpState.opponentResigned,
    mpState.opponentLeft,
    mpState.seed,
    mpState.localSeat,
    mpState.firstSeat,
    mpState.moves,
    mpState.round,
    state.gameOver,
    state.scoreboard,
    state.games,
  ])

  // ── MP: write status:ended to Firestore when local game finishes ──────────
  useEffect(() => {
    if (!isMpMode || mpState.phase !== 'playing') return
    if (!state.gameOver) { mpGameOverWrittenRef.current = false; return }
    if (mpGameOverWrittenRef.current || !mpState.matchId || leavingRef.current) return
    mpGameOverWrittenRef.current = true
    const matchId = mpState.matchId
    void (async () => {
      try {
        await publishChainRef.current
      } catch { /* playMove failure already logged */ }
      const { doc, runTransaction } = await import('firebase/firestore')
      const { getFirebaseDb, MATCHES_COLLECTION } = await import('./firebase/config')
      try {
        await runTransaction(getFirebaseDb(), async (tx) => {
          const ref = doc(getFirebaseDb(), MATCHES_COLLECTION, matchId)
          const snap = await tx.get(ref)
          if (!snap.exists()) return
          const data = snap.data() as { status?: string }
          // Don't clobber resign / heartbeat forfeits with "completed"
          if (data.status === 'ended') return
          tx.update(ref, { status: 'ended', endedReason: 'completed' })
        })
      } catch { /* best effort */ }
    })()
  }, [isMpMode, mpState.phase, mpState.matchId, state.gameOver])

  // ── MP: heartbeat forfeit watch ───────────────────────────────────────────
  useEffect(() => {
    if (!isMpMode || mpState.phase !== 'playing') return
    if (!mpState.opponentLastSeen) return
    const t = window.setTimeout(() => {
      const silentFor = Date.now() - mpState.opponentLastSeen
      if (silentFor > HEARTBEAT_FORFEIT_MS) {
        log('Opponent heartbeat forfeit', silentFor)
        void forfeitForHeartbeat()
      }
    }, HEARTBEAT_FORFEIT_MS)
    return () => window.clearTimeout(t)
  }, [isMpMode, mpState.phase, mpState.opponentLastSeen, forfeitForHeartbeat])

  // ── Animation helpers ─────────────────────────────────────────────────────
  const getPileTarget = useCallback(() => {
    const pileEl = pileRef.current?.querySelector('.table-pile__stack')
    return pileEl?.getBoundingClientRect() ?? pileRef.current?.getBoundingClientRect()
  }, [])

  const recordLanding = useCallback((card: CardType, land: LandingResult) => {
    setPileVisuals((prev) => ({ ...prev, [card.id]: land }))
  }, [])

  const finishCapture = useCallback(() => {
    const result = captureResultRef.current
    captureResultRef.current = null
    setCapture(null)
    setPileHighlight(false)
    setPileVisuals({})
    if (result) resolvePlay(result)
  }, [resolvePlay])

  const applyLanding = useCallback(
    (result: PlayResult, land: LandingResult) => {
      setFlying(null)
      recordLanding(result.playedCard, land)

      if (result.captured) {
        captureResultRef.current = result
        setPileHighlight(true)
        if (result.pisti) {
          if (result.pistiStreak >= 5) vibrate(EXTREME_PISTI)
          else if (result.pistiStreak === 4) vibrate(QUAD_PISTI)
          else if (result.pistiStreak === 3) vibrate(TRIPLE_PISTI)
          else if (result.pistiStreak === 2) vibrate(DOUBLE_PISTI)
          else vibrate(PISTI)
        } else {
          vibrate(CAPTURE)
        }
        if (result.pisti) {
          if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
          shakeTimerRef.current = window.setTimeout(() => {
            setShaking(result.doublePisti ? 'hard' : 'soft')
            shakeTimerRef.current = window.setTimeout(() => {
              shakeTimerRef.current = null; setShaking(false)
            }, result.doublePisti ? 850 : 600)
          }, TIMING.capturePause * 1000)
        }

        const pileRect = getPileTarget()
        const originX = pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2
        const originY = pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2
        setCapture({
          id: `cap-${Date.now()}`,
          cards: result.capturedCards,
          winner: result.who,
          pisti: result.pisti,
          doublePisti: result.doublePisti,
          pistiStreak: result.pistiStreak,
          originX,
          originY,
        })

        const earned = capturePoints(result)
        if (earned > 0) {
          if (scorePopTimerRef.current !== null) window.clearTimeout(scorePopTimerRef.current)
          scorePopTimerRef.current = window.setTimeout(() => {
            scorePopTimerRef.current = null
            const scoreEl = result.who === 'player' ? playerScoreRef.current : opponentScoreRef.current
            const scoreRect = scoreEl?.getBoundingClientRect()
            const toX = scoreRect ? scoreRect.left + scoreRect.width / 2 : originX
            const toY = scoreRect ? scoreRect.top + scoreRect.height / 2 : originY
            setScorePop({ id: `pop-${Date.now()}`, amount: earned, winner: result.who, fromX: originX, fromY: originY, toX, toY })
            scorePopTimerRef.current = window.setTimeout(() => {
              scorePopTimerRef.current = null; setScorePop(null)
            }, 1250)
          }, TIMING.capturePause * 1000)
        }
        if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
        captureTimerRef.current = window.setTimeout(() => {
          captureTimerRef.current = null; finishCapture()
        }, CAPTURE_TOTAL_MS)
        return
      }

      resolvePlay(result)
    },
    [recordLanding, resolvePlay, finishCapture, getPileTarget],
  )

  const launchFlight = useCallback(
    (result: PlayResult, fly: FlyingCardState) => {
      if (landTimerRef.current !== null) window.clearTimeout(landTimerRef.current)
      setFlying(fly)
      landTimerRef.current = window.setTimeout(() => {
        landTimerRef.current = null
        applyLanding(result, fly.landing)
      }, fly.totalMs + 30)
    },
    [applyLanding],
  )

  // Animate and apply a remote (opponent's) card from Firestore
  const triggerRemoteCardAnimation = useCallback(
    (cardId: string): boolean => {
      log('remote card', cardId)
      if (flyingRef.current || captureRef.current) return false

      const result = applyRemoteCard(cardId)
      if (!result) {
        log('applyRemoteCard returned null for', cardId, 'hand:', state.opponentHand.map(c => c.id))
        return false
      }

      const target = getPileTarget()
      const opponentCard = opponentHandRef.current?.querySelector('.opponent-area__card')
      const fromRect = opponentCard?.getBoundingClientRect()

      if (!target || !fromRect) {
        applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
      } else {
        launchFlight(result, createOpponentFlyingCard(result.playedCard, fromRect, target, result.pisti))
      }
      return true
    },
    [applyRemoteCard, getPileTarget, applyLanding, launchFlight, state.opponentHand],
  )

  // ── MP: apply remote moves ────────────────────────────────────────────────
  // Single effect that triggers when: new moves arrive OR state becomes idle.
  // This correctly handles the case where a remote move arrives while we're
  // still animating (state.phase='animating') — we retry when phase flips back.
  useEffect(() => {
    if (!isMpMode || mpState.phase !== 'playing') return
    if (state.phase !== 'idle' || state.turn !== 'opponent' || state.gameOver) return
    if (flying || capture || dealing) return

    const nextIdx = appliedMovesRef.current
    if (nextIdx >= mpState.moves.length) return

    const cardId = mpState.moves[nextIdx]
    const applied = triggerRemoteCardAnimation(cardId)
    if (applied) appliedMovesRef.current = nextIdx + 1
  }, [
    isMpMode, mpState.phase, mpState.moves,
    state.phase, state.turn, state.gameOver,
    flying, capture, dealing,
    triggerRemoteCardAnimation,
  ])

  // ── Player throw ──────────────────────────────────────────────────────────
  const handlePlayerThrow = useCallback(
    (card: CardType, info: PanInfo, element: HTMLElement) => {
      if (leavingRef.current) return
      if (!canPlayerActRef.current || flyingRef.current || captureRef.current) return
      // In MP: block if it's not our turn
      if (isMpMode && state.turn !== 'player') return

      const target = getPileTarget()
      if (!target) return

      const result = playPlayerCard(card.id)
      if (!result) return

      vibrate(TAP)
      launchFlight(result, createFlyingCardFromThrow(card, element, target, info.velocity, info.offset, result.pisti))

      if (isMpMode && mpState.phase === 'playing' && !leavingRef.current) {
        const seq = appliedMovesRef.current
        appliedMovesRef.current += 1
        const publish = mpAdapter.playMove(card.id, seq, Date.now() + TURN_MS).catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          log('playMove failed', message)
          // Match already ended (resign/forfeit) — don't roll back or rethrow
          if (message !== 'Match ended.') appliedMovesRef.current -= 1
        })
        publishChainRef.current = publishChainRef.current.then(() => publish, () => publish)
      }
    },
    [isMpMode, state.turn, getPileTarget, playPlayerCard, launchFlight, mpState.phase],
  )

  // ── Bot opponent (solo only) ──────────────────────────────────────────────
  const triggerOpponentThrow = useCallback(() => {
    if (flying || capture) return
    const result = playOpponentCard()
    if (!result) return

    const target = getPileTarget()
    const opponentCard = opponentHandRef.current?.querySelector('.opponent-area__card')
    const fromRect = opponentCard?.getBoundingClientRect()

    if (!target || !fromRect) {
      applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
    } else {
      launchFlight(result, createOpponentFlyingCard(result.playedCard, fromRect, target, result.pisti))
    }
  }, [flying, capture, getPileTarget, playOpponentCard, applyLanding, launchFlight])

  useEffect(() => {
    if (isMpMode) return
    if (state.turn !== 'opponent' || state.phase !== 'idle' || state.gameOver || flying || capture || dealing) return
    const timer = window.setTimeout(triggerOpponentThrow, 650)
    return () => window.clearTimeout(timer)
  }, [isMpMode, state.turn, state.phase, state.gameOver, flying, capture, dealing, triggerOpponentThrow, state.opponentHand.length])

  const mpTurnDeadline = isMpMode && mpState.phase === 'playing' ? mpState.turnDeadline : 0
  const localTurnDeadline = mpTurnDeadline && state.turn === 'player' && !state.gameOver ? mpTurnDeadline : 0
  const remoteTurnDeadline = mpTurnDeadline && state.turn === 'opponent' && !state.gameOver ? mpTurnDeadline : 0

  // ── Turn timer auto-play (MP only) ────────────────────────────────────────
  // Returns true only when a card was actually played — callers must retry
  // when false (e.g. refresh landed during deal / hydrate before we can act).
  const autoPlayedDeadlineRef = useRef(0)
  const handleTurnExpire = useCallback((): boolean => {
    if (leavingRef.current) return false
    if (!isMpMode || mpState.phase !== 'playing') return false
    if (state.phase !== 'idle' || state.turn !== 'player' || state.gameOver || dealing) return false
    if (flying || capture) return false
    if (state.playerHand.length === 0) return false
    if (mpState.turnDeadline && autoPlayedDeadlineRef.current === mpState.turnDeadline) return false

    const card = pickAutoPlayCard(state.playerHand, state.pile)
    log('auto-play on expire', card.id)

    const result = playPlayerCard(card.id)
    if (!result) return false

    if (mpState.turnDeadline) autoPlayedDeadlineRef.current = mpState.turnDeadline

    const target = getPileTarget()
    const cardEl = document.querySelector<HTMLElement>(`[data-card-id="${card.id}"]`)

    if (target && cardEl) {
      launchFlight(result, createFlyingCardFromThrow(card, cardEl, target, { x: 0, y: 0 }, { x: 0, y: 0 }, result.pisti))
    } else if (target) {
      applyLanding(result, { offsetX: 0, offsetY: 0, rotation: 0 })
    } else {
      resolvePlay(result)
    }

    if (leavingRef.current || mpState.phase !== 'playing') return true

    const seq = appliedMovesRef.current
    appliedMovesRef.current += 1
    const publish = mpAdapter.playMove(card.id, seq, Date.now() + TURN_MS).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      log('auto-play publish failed', message)
      // Expected race: opponent resigned/forfeited while our timer autoplay fired
      if (message !== 'Match ended.') appliedMovesRef.current -= 1
    })
    publishChainRef.current = publishChainRef.current.then(() => publish, () => publish)
    return true
  }, [isMpMode, mpState.phase, mpState.turnDeadline, state.phase, state.turn, state.gameOver, state.playerHand, state.pile, dealing, flying, capture, playPlayerCard, getPileTarget, launchFlight, applyLanding, resolvePlay])

  // Watchdog: HUD onExpire is one-shot and can fire while dealing/hydrating after a
  // refresh. Re-arm until autoplay succeeds for this deadline (incl. already-past).
  useEffect(() => {
    if (!localTurnDeadline) return
    if (autoPlayedDeadlineRef.current === localTurnDeadline) return

    let cancelled = false
    const attempt = () => {
      if (cancelled || leavingRef.current) return
      handleTurnExpire()
    }

    const delay = Math.max(0, localTurnDeadline - Date.now())
    const t = window.setTimeout(attempt, delay)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [
    localTurnDeadline,
    handleTurnExpire,
    // Re-attempt when the board becomes able to play after a failed expire
    state.phase,
    state.turn,
    state.gameOver,
    dealing,
    flying,
    capture,
    mpState.phase,
    mpHydrated,
  ])

  // ── Transient state reset ─────────────────────────────────────────────────
  const resetTransient = useCallback(() => {
    if (landTimerRef.current !== null) { window.clearTimeout(landTimerRef.current); landTimerRef.current = null }
    if (captureTimerRef.current !== null) { window.clearTimeout(captureTimerRef.current); captureTimerRef.current = null }
    if (shakeTimerRef.current !== null) { window.clearTimeout(shakeTimerRef.current); shakeTimerRef.current = null }
    if (scorePopTimerRef.current !== null) { window.clearTimeout(scorePopTimerRef.current); scorePopTimerRef.current = null }
    setFlying(null)
    setCapture(null)
    setScorePop(null)
    setPileHighlight(false)
    setPileVisuals({})
    setShaking(false)
    captureResultRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (landTimerRef.current !== null) window.clearTimeout(landTimerRef.current)
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
      if (scorePopTimerRef.current !== null) window.clearTimeout(scorePopTimerRef.current)
    }
  }, [])

  // ── Countdown complete ────────────────────────────────────────────────────
  // This callback is intentionally stable (no mp state deps) — it just signals
  // "go", and the seed-based hydration effect handles the actual game setup.
  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false)
    // Fresh clock locally first — don't wait on Firestore or a lagging 'ready' snap
    // will briefly (or permanently) show a dead timer.
    const turnDeadline = Date.now() + TURN_MS
    startPlaying(turnDeadline)
    const matchId = mpAdapter.getActiveMatchId()
    if (matchId) {
      void (async () => {
        const { doc, updateDoc } = await import('firebase/firestore')
        const { getFirebaseDb, MATCHES_COLLECTION } = await import('./firebase/config')
        try {
          await updateDoc(doc(getFirebaseDb(), MATCHES_COLLECTION, matchId), {
            status: 'playing',
            turnDeadline,
          })
        } catch { /* best effort */ }
      })()
    }
  }, [startPlaying])

  // If we somehow enter playing with no clock (rejoin / missed countdown write), create one.
  useEffect(() => {
    if (!isMpMode || mpState.phase !== 'playing') return
    if (state.gameOver) return
    if (mpState.turnDeadline > Date.now()) return
    if (mpState.turnDeadline !== 0) return // expired → autoplay watchdog handles it

    const turnDeadline = Date.now() + TURN_MS
    setTurnDeadline(turnDeadline)
    const matchId = mpAdapter.getActiveMatchId()
    if (!matchId) return
    void (async () => {
      const { doc, updateDoc } = await import('firebase/firestore')
      const { getFirebaseDb, MATCHES_COLLECTION } = await import('./firebase/config')
      try {
        await updateDoc(doc(getFirebaseDb(), MATCHES_COLLECTION, matchId), { turnDeadline })
      } catch { /* best effort */ }
    })()
  }, [isMpMode, mpState.phase, mpState.turnDeadline, state.gameOver, setTurnDeadline])

  // ── Solo: next hand ────────────────────────────────────────────────────────
  const handleNextGame = useCallback(() => {
    resetTransient()
    nextGame()
  }, [resetTransient, nextGame])

  // ── Resign / leave ─────────────────────────────────────────────────────────
  const recordForfeitLoss = useCallback(() => {
    if (
      !mpState.opponentUid ||
      !mpState.opponentName ||
      recordedHandRef.current === state.gameNumber
    ) {
      return
    }
    recordedHandRef.current = state.gameNumber
    recordHandResult(false)
    void friendsAdapter.syncLifetimeStats(getLifetimeStats())
    const resultId = mpState.matchId
      ? `${mpState.matchId}_${state.gameNumber}_forfeit`
      : undefined
    void friendsAdapter.recordMatchResult(
      mpState.opponentUid,
      mpState.opponentName,
      'lose',
      resultId,
    )
  }, [
    mpState.opponentUid,
    mpState.opponentName,
    mpState.matchId,
    state.gameNumber,
  ])

  const handleResignConfirm = useCallback(() => {
    setResignOpen(false)
    leavingRef.current = true
    resetTransient()
    if (isMpMode) {
      // Record H2H loss before leave so score updates even if winner is slow
      recordForfeitLoss()
      clearPresence()
      void leave(true)
      prevSeedRef.current = null
      appliedMovesRef.current = 0
      mpGameOverWrittenRef.current = false
      setMpHydrated(true)
      setMpOverlayPhase('idle')
      setInviteCopied(false)
      setChallengedName(null)
      setShowCountdown(false)
      setStarted(false)
      clearGameUrl()
      storage.clearSession()
    } else {
      setStarted(false)
      clearGame()
      clearContinueParam()
    }
  }, [resetTransient, isMpMode, leave, clearPresence, recordForfeitLoss])

  /** Exit from the rejoin/loading screen — forfeit so the opponent sees the match end. */
  const handleLoadingExit = useCallback(() => {
    leavingRef.current = true
    resetTransient()
    recordForfeitLoss()
    clearPresence()
    void leave(true)
    prevSeedRef.current = null
    appliedMovesRef.current = 0
    mpGameOverWrittenRef.current = false
    setMpHydrated(true)
    setMpOverlayPhase('idle')
    setInviteCopied(false)
    setChallengedName(null)
    setShowCountdown(false)
    setStarted(false)
    clearGameUrl()
    storage.clearSession()
  }, [resetTransient, leave, clearPresence, recordForfeitLoss])

  const handleSelectBot = useCallback(
    (botId: string) => { setPickerOpen(false); resetTransient(); chooseBot(botId) },
    [resetTransient, chooseBot],
  )

  const handleStart = useCallback(
    (botId: string) => { resetTransient(); chooseBot(botId); setStarted(true); setContinueParam(); pushSoloGameUrl() },
    [resetTransient, chooseBot],
  )

  // ── Play with friend ──────────────────────────────────────────────────────
  const ensureMpUsername = useCallback(async () => {
    if (username.trim()) return
    try {
      const uid = await ensureAnonymousAuth()
      const autoName = `Oyuncu ${uid.slice(-4).toUpperCase()}`
      await saveUsername(autoName)
      mpAdapter.setDisplayName(autoName)
    } catch {
      // Proceed anyway — adapter will fallback to uid-based name
    }
  }, [username, saveUsername])

  const handlePlayWithFriend = useCallback(async () => {
    await ensureMpUsername()
    leavingRef.current = false
    setInvitingUid(null)
    setChallengedName(null)
    outgoingRequestIdRef.current = null
    setMpOverlayPhase('creating')
    setInviteCopied(false)
    clearGame()
    clearContinueParam()
    const code = await createRoom()
    if (!code) {
      setMpOverlayPhase('error')
      return
    }
    setMpOverlayPhase('sharing')
    setStarted(true)
    const shareResult = await shareInviteLink(code)
    setInviteCopied(shareResult === 'copied')
    setMpOverlayPhase('waiting')
  }, [ensureMpUsername, createRoom])

  const handleInviteFriend = useCallback(
    async (friend: FriendEntry) => {
      setInvitingUid(friend.uid)
      try {
        await ensureMpUsername()
        leavingRef.current = false
        setInviteCopied(false)
        clearGame()
        clearContinueParam()

        // Online → in-app challenge popup for them; offline → share link
        if (friend.online && !friend.inMatch) {
          setChallengedName(friend.name)
          outgoingRequestIdRef.current = null
          setMpOverlayPhase('creating')
          const code = await createRoom()
          const matchId = mpAdapter.getActiveMatchId()
          if (!code || !matchId) {
            setMpOverlayPhase('error')
            setChallengedName(null)
            return
          }
          setStarted(true)
          try {
            const req = await sendChallenge(friend.uid, matchId, code)
            outgoingRequestIdRef.current = req.id
            setMpOverlayPhase('waiting')
          } catch {
            await leave()
            setMpOverlayPhase('error')
            setChallengedName(null)
            setStarted(false)
          }
          return
        }

        setChallengedName(null)
        outgoingRequestIdRef.current = null
        setMpOverlayPhase('creating')
        const code = await createRoom()
        if (!code) {
          setMpOverlayPhase('error')
          return
        }
        setMpOverlayPhase('sharing')
        setStarted(true)
        const shareResult = await shareInviteLink(code)
        setInviteCopied(shareResult === 'copied')
        setMpOverlayPhase('waiting')
      } finally {
        setInvitingUid(null)
      }
    },
    [ensureMpUsername, createRoom, sendChallenge, leave],
  )

  const handleCancelMpOverlay = useCallback(async () => {
    leavingRef.current = true
    const requestId = outgoingRequestIdRef.current
    outgoingRequestIdRef.current = null
    if (requestId) void cancelOutgoingRequest(requestId)
    clearPresence()
    await leave()
    setMpOverlayPhase('idle')
    setInviteCopied(false)
    setChallengedName(null)
    setShowCountdown(false)
    setStarted(false)
    clearGameUrl()
    storage.clearSession()
  }, [leave, cancelOutgoingRequest, clearPresence])

  const handleAcceptGameRequest = useCallback(
    async (request: GameRequest) => {
      leavingRef.current = false
      setChallengedName(null)
      setInviteCopied(false)
      try {
        await acceptRequest(request.id)
        setMpOverlayPhase('joining')
        setStarted(true)
        clearGame()
        clearContinueParam()
        await joinRoom(request.inviteCode)
      } catch {
        setMpOverlayPhase('error')
        setMpHydrated(true)
      }
    },
    [acceptRequest, joinRoom],
  )

  const handleDeclineGameRequest = useCallback(
    async (request: GameRequest) => {
      await declineRequest(request.id)
    },
    [declineRequest],
  )
  // ── MP rematch / leave ────────────────────────────────────────────────────
  const handleMpRematch = useCallback(async () => {
    await requestRematch()
  }, [requestRematch])

  const handleMpLeave = useCallback(async () => {
    leavingRef.current = true
    resetTransient()
    const requestId = outgoingRequestIdRef.current
    outgoingRequestIdRef.current = null
    if (requestId) void cancelOutgoingRequest(requestId)
    clearPresence()
    await leave()
    prevSeedRef.current = null
    appliedMovesRef.current = 0
    mpGameOverWrittenRef.current = false
    setMpOverlayPhase('idle')
    setInviteCopied(false)
    setChallengedName(null)
    setShowCountdown(false)
    setStarted(false)
    clearGameUrl()
    storage.clearSession()
  }, [resetTransient, leave, cancelOutgoingRequest, clearPresence])

  // ── Score info ─────────────────────────────────────────────────────────────
  const handleOpponentScoreClick = useCallback(() => setScoreInfoSide('opponent'), [])
  const handlePlayerScoreClick = useCallback(() => setScoreInfoSide('player'), [])

  // ── Dev pişti demo ─────────────────────────────────────────────────────────
  const triggerPistiDemo = useCallback(
    (streak = 1) => {
      if (flying || capture) return
      const demoCards: CardType[] = [
        { id: 'demo-1', suit: 'hearts', rank: '7' },
        { id: 'demo-2', suit: 'spades', rank: '7' },
      ]
      const pileRect = getPileTarget()
      setPileHighlight(true)
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
      shakeTimerRef.current = window.setTimeout(() => {
        setShaking(streak >= 4 ? 'hard' : 'soft')
        shakeTimerRef.current = window.setTimeout(() => { shakeTimerRef.current = null; setShaking(false) }, streak >= 4 ? 850 : 600)
      }, TIMING.capturePause * 1000)
      setCapture({
        id: `demo-${Date.now()}`,
        cards: demoCards,
        winner: 'player',
        pisti: true,
        doublePisti: false,
        pistiStreak: streak,
        originX: pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2,
        originY: pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2,
      })
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current)
      captureTimerRef.current = window.setTimeout(() => { captureTimerRef.current = null; setCapture(null); setPileHighlight(false) }, CAPTURE_TOTAL_MS)
    },
    [flying, capture, getPileTarget],
  )

  // ── Live score ─────────────────────────────────────────────────────────────
  const liveScore = useMemo(
    () =>
      computeScoreboard(
        state.playerCollected, state.opponentCollected,
        state.playerPisti, state.opponentPisti,
        state.playerDoublePisti, state.opponentDoublePisti,
        false,
      ),
    [state.playerCollected, state.opponentCollected, state.playerPisti, state.opponentPisti, state.playerDoublePisti, state.opponentDoublePisti],
  )

  const canHint = canPlayerAct && !flying && !capture && !dealing
  const topCard = state.pile.length > 0 ? state.pile[state.pile.length - 1] : null
  const matchRank = canHint && topCard ? topCard.rank : null
  const playerHasJack = canHint && state.pile.length > 0 && state.playerHand.some((c) => c.rank === 'J')
  const playerHasMatch = matchRank != null && state.playerHand.some((c) => c.rank === matchRank)
  const highlightPileTop = playerHasMatch || playerHasJack

  const opponentThinking =
    !isMpMode && state.turn === 'opponent' && state.phase === 'idle' && !state.gameOver && !capture && !dealing

  const showMpEnd = isMpMode && mpState.phase === 'ended' && mpEndSynced && !showCountdown
  const showSoloEnd = !isMpMode && state.gameOver && state.scoreboard !== null

  // Lobby / join overlay — only while actively in a lobby phase (never after leave/home)
  const showMpOverlay =
    mpOverlayPhase !== 'idle' &&
    mpState.phase !== 'playing' &&
    mpState.phase !== 'ended' &&
    mpState.phase !== 'countdown' &&
    !showCountdown

  const friendOverlayPhase =
    mpOverlayPhase === 'error' ? 'error' : mpOverlayPhase === 'idle' ? 'waiting' : mpOverlayPhase

  return (
    <div
      className={`game-shell${
        shaking === 'hard' ? ' game-shell--shake-hard' : shaking === 'soft' ? ' game-shell--shake' : ''
      }`}
    >
      {!mpHydrated && (
        <div className="mp-loading" aria-live="polite">
          <div className="mp-loading__spinner" />
          <p>Maç yükleniyor…</p>
          <button
            type="button"
            className="mp-loading__exit"
            onClick={handleLoadingExit}
          >
            Çık / Pes et
          </button>
        </div>
      )}

      <div className={`opponent-wrap${dealing ? ' opponent-wrap--dealing' : ''}`} ref={opponentHandRef}>
        <Hud
          side="top"
          name={opponentName}
          score={liveScore.opponent.total}
          cards={state.opponentCollected.length}
          active={state.turn === 'opponent'}
          thinking={opponentThinking}
          scoreRef={opponentScoreRef}
          onScoreClick={handleOpponentScoreClick}
          turnDeadline={remoteTurnDeadline}
        />
        <OpponentArea handCount={state.opponentHand.length} dealFromRef={sideHudRef} />
      </div>

      <div className="table-area">
        <TablePile
          ref={pileRef}
          cards={state.pile}
          visuals={pileVisuals}
          highlight={pileHighlight}
          highlightTopRank={highlightPileTop}
          showPlayPrompt={canPlayerAct && !flying && !capture && !dealing}
          dealFromRef={sideHudRef}
          capturing={!!capture}
        />
      </div>

      <div className="player-area">
        <PlayerHand
          cards={state.playerHand}
          disabled={!canPlayerAct || !!flying || !!capture || dealing}
          matchRank={matchRank}
          dealFromRef={sideHudRef}
          onReorder={reorderPlayerHand}
          onThrow={handlePlayerThrow}
        />
        <Hud
          side="bottom"
          name={playerName}
          score={liveScore.player.total}
          cards={state.playerCollected.length}
          active={state.turn === 'player'}
          scoreRef={playerScoreRef}
          onScoreClick={handlePlayerScoreClick}
          turnDeadline={localTurnDeadline}
          onTurnExpire={handleTurnExpire}
        />
      </div>

      <div className="side-hud" ref={sideHudRef}>
        <div className="side-hud__match">
          <span className="side-hud__score side-hud__score--me">{state.games.player}</span>
          <span className="side-hud__sep">–</span>
          <span className="side-hud__score">{state.games.opponent}</span>
        </div>
        <div className="side-hud__label">El {state.gameNumber}</div>
        <div className="side-hud__label">Deste {state.deck.length}</div>
        {!isMpMode && (
          <button className="side-hud__btn" onClick={() => setPickerOpen(true)} aria-label="Rakip seç">
            Rakip
          </button>
        )}
        <button className="side-hud__btn" onClick={() => setResignOpen(true)} aria-label="Oyundan çık">
          Çekil
        </button>
        {import.meta.env.DEV && !isMpMode && (
          <>
            <button
              className="side-hud__btn side-hud__btn--debug"
              onClick={() => { const s = (pistiTriggerCountRef.current % 4) + 1; pistiTriggerCountRef.current += 1; triggerPistiDemo(s) }}
            >
              Pişti?
            </button>
            <button
              className="side-hud__btn side-hud__btn--debug"
              onClick={() => runTournament(['random', 'greedy', 'defensive', 'jackSaver', 'mc16', 'mc40'], 200)}
            >
              Turnuva
            </button>
          </>
        )}
      </div>

      <FlyingCardLayer flying={flying} />
      <CaptureLayer capture={capture} visuals={pileVisuals} />
      <ScorePopLayer pop={scorePop} />

      {showSoloEnd && (
        <GameOver
          scoreboard={state.scoreboard!}
          games={state.games}
          playerName={playerName}
          opponentName={opponentName}
          playerCards={state.playerCollected}
          opponentCards={state.opponentCollected}
          onNewGame={handleNextGame}
        />
      )}

      {(showMpEnd || debugMpEnd) && (
        <MultiplayerEndOverlay
          open
          gameState={debugMpEnd?.gameState ?? state}
          mpState={debugMpEnd?.mpState ?? mpState}
          playerName={playerName}
          opponentName={debugMpEnd ? (debugMpEnd.mpState.opponentName ?? 'Rakip') : opponentName}
          lifetime={lifetime}
          opponentLifetime={opponentLifetime}
          onRematch={debugMpEnd ? () => setDebugMpEnd(makeDebugMpEnd()) : handleMpRematch}
          onLeave={debugMpEnd ? () => setDebugMpEnd(null) : handleMpLeave}
        />
      )}

      <StartScreen
        open={!started}
        defaultBotId={state.activeBotId}
        username={username}
        friends={friendList}
        friendsLoading={friendsLoading}
        invitingUid={invitingUid}
        onStart={handleStart}
        onPlayWithFriend={() => void handlePlayWithFriend()}
        onInviteFriend={(friend) => void handleInviteFriend(friend)}
        onEditName={() => setEditingName(true)}
        onRefreshFriends={refreshFriends}
      />

      <OpponentPicker
        open={pickerOpen}
        activeBotId={state.activeBotId}
        onSelect={handleSelectBot}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={resignOpen}
        title="Oyundan çık"
        message={isMpMode ? 'Rakibine karşı pes edeceksin. Devam?' : 'Ana menüye dönülsün mü? Bu maçtaki skor sıfırlanır.'}
        confirmLabel="Çekil"
        cancelLabel="Vazgeç"
        onConfirm={handleResignConfirm}
        onCancel={() => setResignOpen(false)}
      />

      <ScoreInfoDialog
        open={scoreInfoSide !== null}
        name={scoreInfoSide === 'opponent' ? opponentName : playerName}
        cards={scoreInfoSide === 'opponent' ? state.opponentCollected : state.playerCollected}
        pistiCount={scoreInfoSide === 'opponent' ? state.opponentPisti : state.playerPisti}
        doublePistiCount={scoreInfoSide === 'opponent' ? state.opponentDoublePisti : state.playerDoublePisti}
        onClose={() => setScoreInfoSide(null)}
      />

      <FriendMatchOverlay
        open={showMpOverlay}
        phase={friendOverlayPhase}
        inviteCopied={inviteCopied}
        challengedName={challengedName}
        error={mpState.error}
        onCancel={() => void handleCancelMpOverlay()}
      />

      {incomingRequest && !showCountdown && mpState.phase !== 'playing' && (
        <GameRequestModal
          request={incomingRequest}
          onAccept={() => void handleAcceptGameRequest(incomingRequest)}
          onDecline={() => void handleDeclineGameRequest(incomingRequest)}
        />
      )}

      <CountdownScreen
        open={showCountdown}
        playerName={playerName}
        opponentName={mpState.opponentName ?? 'Rakip'}
        games={state.games}
        onComplete={handleCountdownComplete}
      />

      <NamePromptModal
        open={showNamePrompt || editingName}
        skippable={showNamePrompt && !editingName}
        onSave={handleSaveName}
        onSkip={handleSkipName}
      />
    </div>
  )
}
