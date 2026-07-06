import { memo, type RefObject } from 'react'
import { motion } from 'framer-motion'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

// A single vertical reel: a 0-9 strip shifted so the wanted digit sits in the
// viewport. Increasing values scroll the strip upward through the in-between
// digits, giving the slot-machine roll.
const Reel = memo(function Reel({ digit }: { digit: number }) {
  return (
    <span className="reel">
      <motion.span
        className="reel__strip"
        animate={{ y: `-${digit * 10}%` }}
        transition={{ type: 'spring', stiffness: 190, damping: 20 }}
      >
        {DIGITS.map((d) => (
          <span className="reel__cell" key={d}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  )
})

interface RollingScoreProps {
  value: number
  className?: string
  innerRef?: RefObject<HTMLSpanElement | null>
}

export const RollingScore = memo(function RollingScore({ value, className, innerRef }: RollingScoreProps) {
  const digits = String(Math.max(0, Math.round(value))).split('')
  return (
    <span className={className} ref={innerRef} aria-label={String(value)}>
      {digits.map((ch, i) => (
        // Key from the right so the units reel keeps its identity as the number
        // grows a new leading digit (prevents a remount/reset of the roll).
        <Reel key={digits.length - i} digit={Number(ch)} />
      ))}
    </span>
  )
})
