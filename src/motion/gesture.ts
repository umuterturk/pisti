import { GESTURE } from './params'

export type GestureResult = 'THROW' | 'REORDER' | 'SNAP_BACK'

export function classifyRelease(
  offset: { x: number; y: number },
  velocity: { x: number; y: number },
): GestureResult {
  const upwardDistance = -offset.y
  const upwardVelocity = -velocity.y
  const horizontalDistance = Math.abs(offset.x)
  const totalDistance = Math.hypot(offset.x, offset.y)

  if (
    upwardDistance >= GESTURE.throwDistance ||
    upwardVelocity >= GESTURE.throwVelocity
  ) {
    return 'THROW'
  }

  if (
    horizontalDistance >= GESTURE.reorderDistance &&
    horizontalDistance > upwardDistance
  ) {
    return 'REORDER'
  }

  if (totalDistance <= GESTURE.snapBackMax) {
    return 'SNAP_BACK'
  }

  if (horizontalDistance > upwardDistance) {
    return 'REORDER'
  }

  return 'SNAP_BACK'
}
