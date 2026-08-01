/** DiceBear portrait URL seeded by a stable id (bot id, username, seat). */
export function avatarUrl(seed: string): string {
  const safe = encodeURIComponent(seed.trim() || 'player')
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${safe}&backgroundColor=0d2818,143a22`
}
