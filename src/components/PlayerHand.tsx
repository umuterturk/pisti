import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Card as CardType } from '../game/cards'
import { computeHandLayout, findReorderIndex } from '../motion/handLayout'
import { HandCard } from './HandCard'
import type { PanInfo } from 'framer-motion'

const DEAL_STAGGER = 0.08

interface PlayerHandProps {
  cards: CardType[]
  disabled?: boolean
  dealFromRef?: RefObject<HTMLDivElement | null>
  onReorder: (order: string[]) => void
  onThrow: (card: CardType, info: PanInfo, element: HTMLElement) => void
}

export function PlayerHand({ cards, disabled, dealFromRef, onReorder, onThrow }: PlayerHandProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(360)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [previewOrder, setPreviewOrder] = useState<string[]>(() => cards.map((c) => c.id))

  useEffect(() => {
    setPreviewOrder(cards.map((c) => c.id))
  }, [cards])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const orderedCards = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]))
    return previewOrder
      .map((id) => byId.get(id))
      .filter((c): c is CardType => c !== undefined)
  }, [cards, previewOrder])

  const activeIndex = activeId ? previewOrder.indexOf(activeId) : null
  const baseSlots = computeHandLayout(orderedCards.length, containerWidth, activeIndex)

  const handleDragMove = useCallback(
    (cardId: string, dragX: number) => {
      const currentIndex = previewOrder.indexOf(cardId)
      if (currentIndex === -1) return

      const newIndex = findReorderIndex(dragX, baseSlots, currentIndex)
      if (newIndex === currentIndex) return

      setPreviewOrder((prev) => {
        const next = [...prev]
        const [removed] = next.splice(currentIndex, 1)
        next.splice(newIndex, 0, removed)
        return next
      })
    },
    [previewOrder, baseSlots],
  )

  const handleReorderCommit = useCallback(
    (cardId: string) => {
      onReorder(previewOrder)
      if (!previewOrder.includes(cardId)) {
        onReorder(cards.map((c) => c.id))
      }
    },
    [onReorder, previewOrder, cards],
  )

  return (
    <div className="player-hand" ref={containerRef}>
      <div className="player-hand__cards">
        {orderedCards.map((card, index) => (
          <HandCard
            key={card.id}
            card={card}
            slot={baseSlots[index]}
            disabled={disabled}
            dealFromRef={dealFromRef}
            dealDelay={index * DEAL_STAGGER}
            onActiveChange={setActiveId}
            onDragMove={handleDragMove}
            onReorderCommit={handleReorderCommit}
            onThrow={onThrow}
          />
        ))}
      </div>
    </div>
  )
}
