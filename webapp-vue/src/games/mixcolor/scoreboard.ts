/**
 * The scoreboard's arithmetic: which rows exist and in which order. Pure, like the other games'.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow as SharedScoreboardRow } from '@/games/scoreboardColumns'
import { asMixColorOutcome, type Recipe } from './types'

export interface ScoreboardRow extends SharedScoreboardRow {
  /** The server's deviation, one decimal, e.g. `3,2`; `–` without outcome. */
  off: string
  deviation: number | null
  hex: string | null
  recipe: Recipe | null
}

const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function formatDeviation(d: number): string {
  return nf.format(d)
}

/** The gate, e.g. `≤ 4,0`. */
export function toleranceText(t: number): string {
  return `≤ ${formatDeviation(t)}`
}

/**
 * Every entry, best first: points descending (`null` last), then the server's deviation (a missing
 * one last), then user id so a reload shows the same picture. A player who gave up stays, with dashes.
 */
export function scoreboardRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreboardRow[] {
  const ranked = input.entries.map((entry) => {
    const outcome = asMixColorOutcome(entry.outcome)

    return {
      ...rowHead(entry, input.awardRule),
      off: outcome === null ? '–' : formatDeviation(outcome.deviation),
      deviation: outcome?.deviation ?? null,
      hex: outcome?.hex ?? null,
      recipe: outcome?.recipe ?? null,
    }
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
