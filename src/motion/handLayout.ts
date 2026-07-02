import { HAND_CARD_WIDTH, TOUCH } from './params'

export interface HandSlot {
  x: number
  y: number
  rotate: number
  zIndex: number
}

const FAN_ROTATIONS: Record<number, number[]> = {
  1: [0],
  2: [-4, 4],
  3: [-5, 0, 5],
  4: [-5, -2, 2, 5],
  5: [-6, -3, 0, 3, 6],
}

export function computeHandLayout(
  cardCount: number,
  containerWidth: number,
  activeIndex: number | null = null,
): HandSlot[] {
  if (cardCount === 0) return []

  const overlap = HAND_CARD_WIDTH * 0.36
  const totalWidth = HAND_CARD_WIDTH + overlap * (cardCount - 1)
  const startX = (containerWidth - totalWidth) / 2
  const rotations = FAN_ROTATIONS[cardCount] ?? Array.from({ length: cardCount }, (_, i) => {
    const t = cardCount === 1 ? 0 : i / (cardCount - 1)
    return -5 + t * 10
  })

  return Array.from({ length: cardCount }, (_, index) => {
    let x = startX + index * overlap
    let y = 0
    let rotate = rotations[index] ?? 0

    if (activeIndex !== null && activeIndex !== index) {
      const direction = index < activeIndex ? -1 : 1
      x += direction * TOUCH.neighborPush
    }

    if (activeIndex === index) {
      y = TOUCH.lift
      rotate = 0
    }

    return {
      x,
      y,
      rotate,
      zIndex: activeIndex === index ? 100 : index + 1,
    }
  })
}

export function findReorderIndex(
  dragX: number,
  slots: HandSlot[],
  currentIndex: number,
): number {
  const dragCenter = dragX + HAND_CARD_WIDTH / 2

  for (let i = 0; i < slots.length; i += 1) {
    if (i === currentIndex) continue
    const slotCenter = slots[i].x + HAND_CARD_WIDTH / 2
    if (i < currentIndex && dragCenter < slotCenter) return i
    if (i > currentIndex && dragCenter > slotCenter) return i
  }

  return currentIndex
}
