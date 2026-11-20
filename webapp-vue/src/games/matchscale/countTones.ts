/**
 * The count the reveal plays while the true B grows from my tip to the factor: one short tone per
 * equal step of B's size, each a step up a major pentatonic scale when B grows, down when it
 * shrinks. The steps follow B's easing, so the tones come quickly and slow down as B settles; the
 * last one lands when B arrives.
 *
 *   B ×2:   ♪♪ ♪  ♪   ♪        ♪     6 tones, rising
 *           0 ───────────────────▶ GROW_MS
 *
 * Pure: the graph plays it (`countSound.ts`).
 */

/** A CSS `cubic-bezier(x1, y1, x2, y2)`: x is time, y is progress. */
export type Bezier = readonly [number, number, number, number]

/** Tailwind's `ease-out` (`--ease-out`): B's growth in ScaleField (`EASE`). */
export const GROW_EASE: Bezier = [0, 0, 0.2, 1]

export const MIN_TICKS = 4
/** 11 pentatonic steps above G4 end on A6: higher gets shrill on a phone speaker. */
export const MAX_TICKS = 12
/** Ticks per unit of |ln(factor / tip)|: a tip off by ×2 counts 6. */
export const TICKS_PER_LN = 8
/** Below this |ln(factor / tip)| the tip is the size: one tone. */
const SAME_SIZE_LN = 0.01

/** G4: low enough to leave room for the climb, high enough for a phone speaker. */
export const BASE_HZ = 392
/** Major pentatonic, in semitones above the root. */
const PENTATONIC = [0, 2, 4, 7, 9] as const

export interface Tone {
  /** Seconds after the growth starts. */
  atS: number
  hz: number
}

export function tickCount(tip: number, factor: number): number {
  const distance = Math.abs(Math.log(factor / tip))
  if (distance < SAME_SIZE_LN) return 1

  return Math.min(Math.max(Math.round(distance * TICKS_PER_LN), MIN_TICKS), MAX_TICKS)
}

/** One coordinate of a cubic Bézier from (0, 0) to (1, 1) at parameter `s`. */
function bezierAt(p1: number, p2: number, s: number): number {
  const r = 1 - s

  return 3 * r * r * s * p1 + 3 * r * s * s * p2 + s * s * s
}

/**
 * The time fraction at which `ease` reaches `progress`. Bisects the curve's parameter: progress
 * rises monotonically with it as long as y1 and y2 lie in 0..1, which every ease without
 * overshoot does.
 */
export function timeAt(progress: number, ease: Bezier): number {
  const [x1, y1, x2, y2] = ease
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bezierAt(y1, y2, mid) < progress) lo = mid
    else hi = mid
  }

  return bezierAt(x1, x2, (lo + hi) / 2)
}

/** Tick `i` of `count` sounds when B has covered `i / count` of its way; the last at the end. */
export function tickTimes(count: number, durationS: number, ease: Bezier): number[] {
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? durationS : timeAt((i + 1) / count, ease) * durationS,
  )
}

/** `count` steps up the scale from G4, or the same steps down to it. */
export function pitches(count: number, rising: boolean): number[] {
  const up = Array.from({ length: count }, (_, degree) => {
    const semitones =
      12 * Math.floor(degree / PENTATONIC.length) + PENTATONIC[degree % PENTATONIC.length]!

    return BASE_HZ * 2 ** (semitones / 12)
  })

  return rising ? up : up.reverse()
}

/** The whole count for B growing from `tip` to `factor` in `durationS`. */
export function countTones(tip: number, factor: number, durationS: number): Tone[] {
  const count = tickCount(tip, factor)
  const times = tickTimes(count, durationS, GROW_EASE)
  const hzs = pitches(count, factor >= tip)

  return times.map((atS, i) => ({ atS, hz: hzs[i]! }))
}
