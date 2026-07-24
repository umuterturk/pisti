import { useEffect, useState } from 'react'
import type { EmojiReaction } from '../multiplayer/types'

interface EmojiAnimationProps {
  reactions: EmojiReaction[]
  localUid: string
}

interface AnimatingReaction {
  id: string
  emoji?: string
  text?: string
  timestamp: number
  fromTop: boolean
}

/** Matches emoji-burst / text-burst CSS animation duration (2s incl. fade-out). */
const BURST_MS = 2000

export function EmojiAnimation({ reactions, localUid }: EmojiAnimationProps) {
  const [animating, setAnimating] = useState<AnimatingReaction[]>([])
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const newReactions = reactions.filter((r) => {
      const id = `${r.from}-${r.timestamp}`
      return !processedIds.has(id)
    })

    if (newReactions.length === 0) return

    newReactions.forEach((r) => {
      const id = `${r.from}-${r.timestamp}`
      setProcessedIds((prev) => new Set(prev).add(id))

      // fromTop = true if sender is opponent (comes from top, travels toward player)
      const fromTop = r.from !== localUid

      const item: AnimatingReaction = {
        id,
        emoji: r.emoji,
        text: r.text,
        timestamp: r.timestamp,
        fromTop,
      }

      setAnimating((prev) => [...prev, item])

      setTimeout(() => {
        setAnimating((prev) => prev.filter((e) => e.id !== id))
      }, BURST_MS)
    })
  }, [reactions, localUid, processedIds])

  return (
    <div className="emoji-animation-layer">
      {animating.map((e) =>
        e.text ? (
          <div
            key={e.id}
            className={`text-burst ${e.fromTop ? 'text-burst--from-top' : 'text-burst--from-bottom'}`}
          >
            {e.text}
          </div>
        ) : (
          <div
            key={e.id}
            className={`emoji-burst ${e.fromTop ? 'emoji-burst--from-top' : 'emoji-burst--from-bottom'}`}
          >
            {e.emoji}
          </div>
        ),
      )}
    </div>
  )
}
