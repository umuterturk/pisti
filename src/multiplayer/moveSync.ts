/**
 * Multiplayer move publish helpers.
 *
 * Local clients apply a card optimistically, then append it to Firestore
 * `moves[]`. If that write fails and we keep the optimistic board, both
 * players end up waiting on each other (deadlock). These helpers retry
 * transient failures and signal when the caller must roll back to
 * authoritative `seed + moves`.
 */

export type PublishOutcome = 'ok' | 'match_ended' | 'failed'

const RETRYABLE_CODES = new Set([
  'failed-precondition',
  'aborted',
  'unavailable',
  'resource-exhausted',
  'deadline-exceeded',
])

function errorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function isMatchEndedError(err: unknown): boolean {
  return errorMessage(err) === 'Match ended.'
}

/** Transaction contention / brief network blips — safe to retry. */
export function isRetryablePublishError(err: unknown): boolean {
  if (isMatchEndedError(err)) return false
  const msg = errorMessage(err)
  // A stale moveSeq was observed on FRESH data inside runTransaction (the SDK
  // already re-reads on contention) — retrying with the same seq can never
  // succeed. Fail fast so the caller rolls back to authority immediately.
  if (msg.includes('Stale move')) return false
  const code = errorCode(err)
  if (code && RETRYABLE_CODES.has(code)) return true
  // Firebase sometimes surfaces the code only inside the message.
  return RETRYABLE_CODES.has(msg) || /failed-precondition|aborted|unavailable/i.test(msg)
}

export interface PublishMoveArgs {
  cardId: string
  moveSeq: number
  nextDeadline: number
  maxAttempts?: number
  /** Delay between attempts (ms). Default 40. */
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

/**
 * Calls `playMove`, retrying transient Firestore contention.
 * Does not touch local game state — caller must roll back on `'failed'`.
 */
export async function publishMoveWithRetry(
  playMove: (cardId: string, moveSeq: number, nextDeadline: number) => Promise<void>,
  args: PublishMoveArgs,
): Promise<PublishOutcome> {
  const maxAttempts = args.maxAttempts ?? 5
  const retryDelayMs = args.retryDelayMs ?? 40
  const sleep = args.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await playMove(args.cardId, args.moveSeq, args.nextDeadline)
      return 'ok'
    } catch (err) {
      lastError = err
      if (isMatchEndedError(err)) return 'match_ended'
      if (!isRetryablePublishError(err) || attempt === maxAttempts) break
      await sleep(retryDelayMs * attempt)
    }
  }

  if (isMatchEndedError(lastError)) return 'match_ended'
  return 'failed'
}
