/**
 * The scoreboard's arithmetic: which rows exist and in which order. Pure, like the other games'.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow as SharedScoreboardRow } from '@/games/scoreboardColumns'
import { asMatchScaleOutcome, scaleOf } from './types'

export interface ScoreboardRow extends SharedScoreboardRow {
  /** The tip as sent. */
  scale: number
  /** The tip, e.g. `1,3×`. */
  tip: string
  /** Distance from the true factor as a factor with its direction, e.g. `1,3× ↑` (too large). */
  off: string
  /** As the server judged it; `null` while the entry has no outcome. */
  deviation: number | null
}

const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatFactor(x: number): string {
  return nf.format(x)
}

/** The gate as the table names it: `1.25` → `1,25×`, the same either way. */
export function formatTolerance(toleranceFactor: number): string {
  return `${nf.format(toleranceFactor)}×`
}

/**
 * Every tip the table can print, best first: points descending (`null` last), then the server's
 * deviation (a missing one last), then user id so a reload shows the same picture. An entry without
 * a usable scale drops out rather than printing `NaN`.
 */
export function scoreboardRows(input: {
  entries: readonly GameEntry[]
  /** The true factor between A and B. */
  factor: number
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreboardRow[] {
  const ranked = input.entries.flatMap((entry) => {
    const scale = scaleOf(entry.guess)
    if (scale === null) return []

    return [
      {
        ...rowHead(entry, input.awardRule),
        scale,
        tip: `${formatFactor(scale)}×`,
        off: formatOff(scale / input.factor),
        deviation: asMatchScaleOutcome(entry.outcome)?.deviation ?? null,
      },
    ]
  })

  ranked.sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      byDeviation(a.deviation, b.deviation) ||
      a.userId.localeCompare(b.userId),
  )

  return withTicks(ranked, input.mineUserId)
}

/** Ascending, a missing deviation last; two missing ones tie. */
function byDeviation(a: number | null, b: number | null): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null)

  return a - b
}

/** `ratio` = tip / truth: `1.3` → `1,3× ↑`, `0.5` → `2× ↓`; equal within rounding → `genau`. */
function formatOff(ratio: number): string {
  const times = Math.max(ratio, 1 / ratio)
  if (nf.format(times) === nf.format(1)) return 'genau'

  return `${nf.format(times)}× ${ratio > 1 ? '↑' : '↓'}`
}

/**
 * Whether my tip earns the reveal's success sound. Phase one: inside the gate. Phase two: my row
 * holds the points now — under „closest only“ that is being ahead, vorläufig. `null` without a
 * tip of mine or a verdict on it: no sound.
 */
export function myWin(input: {
  /** `null` in phase two. */
  toleranceFactor: number | null
  /** My own outcome. */
  outcome: unknown
  rows: readonly ScoreboardRow[]
  mineUserId: string | null
}): boolean | null {
  if (input.toleranceFactor !== null) {
    return asMatchScaleOutcome(input.outcome)?.withinTolerance ?? null
  }

  const points = input.rows.find((row) => row.userId === input.mineUserId)?.points ?? null

  return points === null ? null : points > 0
}
