/**
 * The scoreboard's arithmetic: which rows exist and in which order. Pure, like the other games'.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow as SharedScoreboardRow } from '@/games/scoreboardColumns'
import { asMatchScaleOutcome, scaleOf, type Measure } from './types'
import {
  formatSigned,
  formatSignedTenths,
  formatTenths,
  inUnitTenths,
  roundUnit,
  type Unit,
} from './units'

export interface ScoreboardRow extends SharedScoreboardRow {
  /** The tip as sent. */
  scale: number
  /** The tip as B's length in the round's unit, e.g. `160,0`; without B's measure a factor, `1,30`. */
  tip: string
  /** Tip minus truth in the same unit, e.g. `−40,0`, `+50,0`, `±0,0`; without, in percent: `+30`. */
  off: string
  /** As the server judged it; `null` while the entry has no outcome. */
  deviation: number | null
}

const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatFactor(x: number): string {
  return nf.format(x)
}

/** A share in whole percent, signed like the distance column: `0.3` → `+30`, `0` → `±0`; `%` stands beneath the table. */
export function formatPercent(share: number): string {
  return formatSigned(Math.round(share * 100))
}

/** The gate in whole percent, the same either way: `0.25` → `±25`. */
export function formatTolerance(tolerance: number): string {
  return `±${Math.round(tolerance * 100)}`
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

/** The head's „Lösung“: B's length, `200,0`, or the factor, `1,60`. */
export function solutionText(factor: number, truth: Truth | null): string {
  return truth === null
    ? formatFactor(factor)
    : formatTenths(inUnitTenths(truth.metres, truth.unit))
}

/**
 * The head's „Toleranz“: how far a tip may sit from the solution either way, in the „Abstand“
 * column's terms — `±50,0` for 200 cm at 0.25; without a length in percent, `±25`. `null` in
 * phase two.
 */
export function toleranceText(tolerance: number | null, truth: Truth | null): string | null {
  if (tolerance === null) return null
  if (truth === null) return formatTolerance(tolerance)

  return `±${formatTenths(inUnitTenths(truth.metres * tolerance, truth.unit))}`
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
 * between the rounded values, so the row adds up: Lösung `200,0`, Tipp `160,0`, Abstand `−40,0`.
 */
function cells(scale: number, factor: number, truth: Truth | null): { tip: string; off: string } {
  if (truth === null) return { tip: formatFactor(scale), off: formatPercent(scale / factor - 1) }

  const tip = inUnitTenths((truth.metres * scale) / factor, truth.unit)

  return {
    tip: formatTenths(tip),
    off: formatSignedTenths(tip - inUnitTenths(truth.metres, truth.unit)),
  }
}
