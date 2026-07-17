const BASE_URL = import.meta.env.BASE_URL ?? '/'
/** Same alphabet as generateInviteCode (no I/O/0/1). */
const INVITE_CODE_RE = /^([A-HJ-NP-Z2-9]{6})/i

export function buildInviteUrl(code: string): string {
  const origin = window.location.origin
  return `${origin}${BASE_URL}?join=${code}`
}

/** Pull the 6-char room id; ignore any trailing junk after it. */
export function parseInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const match = raw.trim().toUpperCase().match(INVITE_CODE_RE)
  return match?.[1] ?? null
}

export type ShareInviteResult = 'shared' | 'copied' | 'none'

export async function shareInviteLink(code: string): Promise<ShareInviteResult> {
  const url = buildInviteUrl(code)

  // URL only — title/message in the share payload make "Copy" paste a broken blob.
  if (navigator.share) {
    try {
      await navigator.share({ url })
      return 'shared'
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'none'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'none'
  }
}

export function getJoinCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return parseInviteCode(params.get('join'))
}

/** Push a new history entry pointing to a solo game screen */
export function pushSoloGameUrl(): void {
  const url = new URL(window.location.href)
  // Only push if we're not already on the game screen
  if (url.searchParams.has('play') || url.searchParams.has('join')) return
  url.searchParams.set('play', '1')
  window.history.pushState({ screen: 'game' }, '', url.toString())
}

/**
 * Set the multiplayer join code in the URL.
 * Uses pushState on the first call (entering MP), replaceState on subsequent ones.
 */
export function setJoinCodeInUrl(code: string): void {
  const url = new URL(window.location.href)
  const alreadySet = url.searchParams.get('join') === code
  url.searchParams.set('join', code)
  url.searchParams.delete('play')
  if (alreadySet) {
    window.history.replaceState({ screen: 'game' }, '', url.toString())
  } else {
    window.history.pushState({ screen: 'game' }, '', url.toString())
  }
}

/** Clear all game params and return URL to the home state */
export function clearGameUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('join')
  url.searchParams.delete('play')
  window.history.replaceState({ screen: 'home' }, '', url.toString())
}

/** @deprecated Use clearGameUrl instead */
export const clearJoinCodeFromUrl = clearGameUrl
