import { useEffect, useState } from 'react'
import type { EmojiReaction } from '../multiplayer/types'

interface EmojiAnimationProps {
  reactions: EmojiReaction[]
  localUid: string
}

interface AnimatingEmoji {
  id: string
  emoji: string
  timestamp: number
  fromTop: boolean
}

export function EmojiAnimation({ reactions, localUid }: EmojiAnimationProps) {
  const [animating, setAnimating] = useState<AnimatingEmoji[]>([])
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

      // fromTop = true if sender is opponent (their emoji comes from top HUD)
      const fromTop = r.from !== localUid

      const emoji: AnimatingEmoji = {
        id,
        emoji: r.emoji,
        timestamp: r.timestamp,
        fromTop,
      }

      setAnimating((prev) => [...prev, emoji])

      // Must match the emoji-burst CSS animation duration (2s incl. fade-out)
      setTimeout(() => {
        setAnimating((prev) => prev.filter((e) => e.id !== id))
      }, 2000)
    })
  }, [reactions, localUid, processedIds])

  return (
    <div className="emoji-animation-layer">
      {animating.map((e) => (
        <div
          key={e.id}
          className={`emoji-burst ${e.fromTop ? 'emoji-burst--from-top' : 'emoji-burst--from-bottom'}`}
        >
          {e.emoji}
        </div>
      ))}
    </div>
  )
}
