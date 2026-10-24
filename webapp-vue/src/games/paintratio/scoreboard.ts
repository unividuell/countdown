/**
 * The ranking of „Anmaßung“: which rows exist, in which order, what each cell says. Pure,
 * like the other games' `scoreboard.ts`.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { asPaintRatioOutcome, strokesOf } from './types'
import type { PaintRatioOutcome, Stroke } from './types'

export interface ScoreRow extends ScoreboardRow {
  /** The painted share in percentage points, e.g. `42,3`; `null` without a readable outcome. */
  ratioLabel: string | null
  /** Share minus target, signed; `null` without a readable outcome. */
  differenceLabel: string | null
  /** The painting; `null` for a row that gave up or whose strokes or outcome cannot be read. */
  strokes: Stroke[] | null
}

/**
 * Shares and differences are percentage points, one decimal, no unit: the table's star names the
 * unit once, and a „%“ on a difference would read as relative.
 */
const points = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const signedPoints = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** `0.4234` → `42,3`. */
export function formatShare(fraction: number): string {
  return points.format(fraction * 100)
}

/** `0.012` → `+1,2`; a difference that rounds to zero carries no sign. */
export function formatDifference(fraction: number): string {
  return signedPoints.format(fraction * 100)
}

/**
 * Every entry of the round as a row, the nearest to the target first. A row without a readable
 * outcome goes last and ties go by user id, so a reload shows the same picture.
 *
 * A painting that cannot be read is no painting: its row stays, its name is no button. So is one
 * whose outcome cannot be read — nothing to compare it by — and one that gave up (`guess` is
 * `null`), which never painted.
 */
export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  /** Passed through to `tickOfRow`, which decides when my own row may land. */
  mineUserId: string | null
  /** Brushes of the round's payload: a stroke names its brush by index. */
  brushCount: number
}): ScoreRow[] {
  const ranked = input.entries.map((entry) => {
    const outcome = asPaintRatioOutcome(entry.outcome)

    return {
      outcome,
      row: {
        ...rowHead(entry, input.awardRule),
        ratioLabel: outcome === null ? null : formatShare(outcome.ratio),
        differenceLabel: outcome === null ? null : formatDifference(outcome.difference),
        strokes: outcome === null ? null : strokesOf(entry.guess, input.brushCount),
      },
    }
  })

  ranked.sort(
    (a, b) =>
      Number(a.outcome === null) - Number(b.outcome === null) ||
      distance(a.outcome) - distance(b.outcome) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  return withTicks(
    ranked.map(({ row }) => row),
    input.mineUserId,
  )
}

function distance(outcome: PaintRatioOutcome | null): number {
  return outcome === null ? 0 : Math.abs(outcome.difference)
}
