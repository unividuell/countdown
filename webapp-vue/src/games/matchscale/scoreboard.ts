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
  /** The tip, e.g. `1,3×`. */
  tip: string
  /** Signed distance from the true factor, e.g. `+23 %` or `−18 %`. */
  off: string
  /** As the server judged it; `null` while the entry has no outcome. */
  deviation: number | null
}

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export function formatFactor(x: number): string {
  return nf.format(x)
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
        tip: `${formatFactor(scale)}×`,
        off: signedPercent(scale / input.factor - 1),
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

function signedPercent(fraction: number): string {
  const percent = Math.round(fraction * 100)

  return `${percent < 0 ? '−' : '+'}${Math.abs(percent)} %`
}
