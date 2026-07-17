import { describe, expect, it, vi } from 'vitest'
import { hydrateGameState, type GameState } from '../game/useGame'
import {
  isRetryablePublishError,
  publishMoveWithRetry,
  type PublishOutcome,
} from './moveSync'

const SEED = 'desync-repro-seed-42'
const FIRST_SEAT = 0 as const

function canPlayerAct(state: GameState): boolean {
  return (
    state.turn === 'player' &&
    state.phase === 'idle' &&
    !state.gameOver &&
    state.playerHand.length > 0
  )
}

/**
 * Naive failure handling that mirrors the pre-fix App.tsx catch:
 * roll back moveSeq cursor only — keep the optimistic board.
 */
function naiveOnPublishFailed(opts: {
  appliedMoves: number
}): { appliedMoves: number } {
  return { appliedMoves: opts.appliedMoves - 1 }
}

/**
 * Fixed failure handling: restore board from authoritative seed + moves.
 */
function recoverOnPublishFailed(opts: {
  seed: string
  moves: string[]
  localSeat: 0 | 1
  firstSeat: 0 | 1
  appliedMoves: number
}): { appliedMoves: number; state: GameState } {
  return {
    appliedMoves: opts.moves.length,
    state: hydrateGameState(opts.seed, opts.moves, opts.localSeat, opts.firstSeat),
  }
}

describe('MP optimistic publish desync (repro)', () => {
  it('DEADLOCK: local apply + failed publish without board rollback freezes both players', () => {
    const authorityMoves: string[] = []

    const seat0Before = hydrateGameState(SEED, authorityMoves, 0, FIRST_SEAT)
    const seat1Before = hydrateGameState(SEED, authorityMoves, 1, FIRST_SEAT)

    expect(canPlayerAct(seat0Before)).toBe(true)
    expect(canPlayerAct(seat1Before)).toBe(false)

    const cardId = seat0Before.playerHand[0]!.id

    // Seat 0 applies locally as if playMove succeeded (optimistic).
    const seat0Optimistic = hydrateGameState(SEED, [...authorityMoves, cardId], 0, FIRST_SEAT)
    // Publish fails — Firestore still has authorityMoves.
    // Naive handler only undoes appliedMovesRef, keeps optimistic board:
    naiveOnPublishFailed({ appliedMoves: 1 })

    const seat0Stuck = seat0Optimistic
    const seat1Waiting = hydrateGameState(SEED, authorityMoves, 1, FIRST_SEAT)

    // Both think it is the opponent's turn → neither can act. This is the bug.
    expect(canPlayerAct(seat0Stuck)).toBe(false)
    expect(canPlayerAct(seat1Waiting)).toBe(false)
    expect(seat0Stuck.turn).toBe('opponent')
    expect(seat1Waiting.turn).toBe('opponent')
  })

  it('FIX: rolling back to seed+moves restores the mover and unblocks the match', () => {
    const authorityMoves: string[] = []
    const seat0Before = hydrateGameState(SEED, authorityMoves, 0, FIRST_SEAT)
    const cardId = seat0Before.playerHand[0]!.id

    // Optimistic apply, then publish fails.
    const seat0Optimistic = hydrateGameState(SEED, [...authorityMoves, cardId], 0, FIRST_SEAT)
    expect(canPlayerAct(seat0Optimistic)).toBe(false)

    const recovered = recoverOnPublishFailed({
      seed: SEED,
      moves: authorityMoves,
      localSeat: 0,
      firstSeat: FIRST_SEAT,
      appliedMoves: 1,
    })

    expect(recovered.appliedMoves).toBe(0)
    expect(canPlayerAct(recovered.state)).toBe(true)
    expect(recovered.state.turn).toBe('player')
    expect(recovered.state.playerHand.map((c) => c.id)).toEqual(
      seat0Before.playerHand.map((c) => c.id),
    )

    // Peer still waiting on authority — once mover retries successfully, they unlock.
    const seat1 = hydrateGameState(SEED, authorityMoves, 1, FIRST_SEAT)
    expect(canPlayerAct(seat1)).toBe(false)
  })
})

describe('publishMoveWithRetry', () => {
  it('classifies Firestore contention as retryable', () => {
    expect(isRetryablePublishError({ code: 'failed-precondition', message: 'x' })).toBe(true)
    expect(isRetryablePublishError(new Error('Stale move; retry.'))).toBe(false)
    expect(isRetryablePublishError(new Error('Match ended.'))).toBe(false)
    expect(isRetryablePublishError(new Error('Match not found.'))).toBe(false)
  })

  it('retries failed-precondition then succeeds', async () => {
    let attempts = 0
    const playMove = vi.fn(async () => {
      attempts += 1
      if (attempts < 3) {
        const err = new Error('transaction failed') as Error & { code: string }
        err.code = 'failed-precondition'
        throw err
      }
    })

    const outcome = await publishMoveWithRetry(playMove, {
      cardId: 'A-spades',
      moveSeq: 0,
      nextDeadline: Date.now() + 15_000,
      retryDelayMs: 1,
      sleep: async () => {},
    })

    expect(outcome).toBe('ok' satisfies PublishOutcome)
    expect(attempts).toBe(3)
  })

  it('fails immediately on stale moveSeq (no doomed same-seq retries)', async () => {
    const playMove = vi.fn(async () => {
      throw new Error('Stale move; retry.')
    })

    const outcome = await publishMoveWithRetry(playMove, {
      cardId: 'A-spades',
      moveSeq: 0,
      nextDeadline: Date.now() + 15_000,
      sleep: async () => {},
    })

    expect(outcome).toBe('failed')
    expect(playMove).toHaveBeenCalledTimes(1)
  })

  it('returns match_ended without treating it as a rollbackable failure', async () => {
    const playMove = vi.fn(async () => {
      throw new Error('Match ended.')
    })

    const outcome = await publishMoveWithRetry(playMove, {
      cardId: 'A-spades',
      moveSeq: 0,
      nextDeadline: Date.now() + 15_000,
      maxAttempts: 3,
      sleep: async () => {},
    })

    expect(outcome).toBe('match_ended')
    expect(playMove).toHaveBeenCalledTimes(1)
  })

  it('returns failed after exhausting retries (caller must roll back board)', async () => {
    const playMove = vi.fn(async () => {
      const err = new Error('transaction failed') as Error & { code: string }
      err.code = 'failed-precondition'
      throw err
    })

    const outcome = await publishMoveWithRetry(playMove, {
      cardId: 'A-spades',
      moveSeq: 0,
      nextDeadline: Date.now() + 15_000,
      maxAttempts: 3,
      retryDelayMs: 1,
      sleep: async () => {},
    })

    expect(outcome).toBe('failed')
    expect(playMove).toHaveBeenCalledTimes(3)
  })

  it('protocol: retries contention then both clients agree on authority', async () => {
    const authorityMoves: string[] = []
    let firestoreMoves = [...authorityMoves]

    const seat0 = hydrateGameState(SEED, firestoreMoves, 0, FIRST_SEAT)
    const cardId = seat0.playerHand[0]!.id

    let attempts = 0
    const playMove = vi.fn(async (_id: string, seq: number) => {
      attempts += 1
      if (seq !== firestoreMoves.length) throw new Error('Stale move; retry.')
      if (attempts < 3) {
        const err = new Error('contention') as Error & { code: string }
        err.code = 'failed-precondition'
        throw err
      }
      firestoreMoves = [...firestoreMoves, cardId]
    })

    // Optimistic local board (what App does before publish returns).
    let local = hydrateGameState(SEED, [...firestoreMoves, cardId], 0, FIRST_SEAT)
    expect(canPlayerAct(local)).toBe(false)

    const outcome = await publishMoveWithRetry(playMove, {
      cardId,
      moveSeq: authorityMoves.length,
      nextDeadline: Date.now() + 15_000,
      retryDelayMs: 1,
      sleep: async () => {},
    })

    expect(outcome).toBe('ok')
    expect(attempts).toBe(3)

    // Authority advanced — both clients hydrate to the same post-move state.
    local = hydrateGameState(SEED, firestoreMoves, 0, FIRST_SEAT)
    const peer = hydrateGameState(SEED, firestoreMoves, 1, FIRST_SEAT)
    expect(canPlayerAct(local)).toBe(false)
    expect(canPlayerAct(peer)).toBe(true)
  })
})
