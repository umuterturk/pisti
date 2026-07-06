import { useCallback, useEffect, useMemo, useRef, useState, memo, type RefObject } from 'react'
import type { Card as CardType } from '../game/cards'
import { computeHandLayout, findReorderIndex } from '../motion/handLayout'
import { HandCard } from './HandCard'
import type { PanInfo } from 'framer-motion'

const DEAL_STAGGER = 0.08

interface PlayerHandProps {
  cards: CardType[]
  disabled?: boolean
  /** Rank of the top pile card; hand cards of this rank are highlighted. */
  matchRank?: string | null
  dealFromRef?: RefObject<HTMLDivElement | null>
  onReorder: (order: string[]) => void
  onThrow: (card: CardType, info: PanInfo, element: HTMLElement) => void
}

function PlayerHandComponent({ cards, disabled, matchRank, dealFromRef, onReorder, onThrow }: PlayerHandProps) {
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
  const baseSlots = useMemo(
    () => computeHandLayout(orderedCards.length, containerWidth, activeIndex),
    [orderedCards.length, containerWidth, activeIndex],
  )

  const previewOrderRef = useRef(previewOrder)
  previewOrderRef.current = previewOrder
  const baseSlotsRef = useRef(baseSlots)
  baseSlotsRef.current = baseSlots
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder

  const handleDragMove = useCallback(
    (cardId: string, dragX: number) => {
      const currentIndex = previewOrderRef.current.indexOf(cardId)
      if (currentIndex === -1) return

      const newIndex = findReorderIndex(dragX, baseSlotsRef.current, currentIndex)
      if (newIndex === currentIndex) return

      setPreviewOrder((prev) => {
        const next = [...prev]
        const [removed] = next.splice(currentIndex, 1)
        next.splice(newIndex, 0, removed)
        return next
      })
    },
    [],
  )

  const handleReorderCommit = useCallback(
    (cardId: string) => {
      onReorderRef.current(previewOrderRef.current)
      if (!previewOrderRef.current.includes(cardId)) {
        onReorderRef.current(cardsRef.current.map((c) => c.id))
      }
    },
    [],
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
            highlightRank={
              !disabled &&
              matchRank != null &&
              (card.rank === 'J' || card.rank === matchRank)
            }
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

export const PlayerHand = memo(PlayerHandComponent)
