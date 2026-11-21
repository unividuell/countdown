/**
 * The scoreboard's arithmetic: which rows exist and in which order. Pure, like the other games'.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow as SharedScoreboardRow } from '@/games/scoreboardColumns'
import { asMatchScaleOutcome, scaleOf, type Measure } from './types'
import { formatLength, formatSigned, inUnit, roundUnit, type Unit } from './units'

export interface ScoreboardRow extends SharedScoreboardRow {
  /** The tip as sent. */
  scale: number
  /** The tip as B's length in the round's unit, e.g. `160`; without B's measure a factor, `1,30×`. */
  tip: string
  /** Tip minus truth in the same unit, e.g. `−40`, `+50`, `±0`; without, `1,30× ↑` (too large). */
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

/** B's true length and the round's unit: what the table counts in. */
export interface Truth {
  metres: number
  unit: Unit
}

/** `null` without B's measure: the table then speaks in factors. */
export function truthOf(a: Measure | null, b: Measure | null): Truth | null {
  const unit = roundUnit(a, b)

  return b === null || unit === null ? null : { metres: b.metres, unit }
}

/** The head's „Lösung“: B's length, `200`, or the factor, `1,60×`. */
export function solutionText(factor: number, truth: Truth | null): string {
  return truth === null
    ? `${formatFactor(factor)}×`
    : formatLength(inUnit(truth.metres, truth.unit))
}

/**
 * The head's „Toleranz“: how far a tip may sit from the solution, in the „Abstand“ column's terms —
 * `[−40,50]` for 200 cm at 1.25, narrow as a head cell must be; without a length the factor,
 * `1,25×`. `null` in phase two.
 */
export function toleranceText(toleranceFactor: number | null, truth: Truth | null): string | null {
  if (toleranceFactor === null) return null
  if (truth === null) return formatTolerance(toleranceFactor)

  const { metres, unit } = truth
  const solution = inUnit(metres, unit)
  const low = formatLength(inUnit(metres / toleranceFactor, unit) - solution)
  const high = formatLength(inUnit(metres * toleranceFactor, unit) - solution)

  return `[${low},${high}]`
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
  truth: Truth | null
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
        ...cells(scale, input.factor, input.truth),
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

/**
 * Scaling is linear, so the tip as B's length is `metres × scale / factor`. The distance is taken
 * between the rounded values, so the row adds up: Lösung `200`, Tipp `160`, Abstand `−40`.
 */
function cells(scale: number, factor: number, truth: Truth | null): { tip: string; off: string } {
  if (truth === null) return { tip: `${formatFactor(scale)}×`, off: formatOff(scale / factor) }

  const tip = inUnit((truth.metres * scale) / factor, truth.unit)

  return { tip: formatLength(tip), off: formatSigned(tip - inUnit(truth.metres, truth.unit)) }
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
