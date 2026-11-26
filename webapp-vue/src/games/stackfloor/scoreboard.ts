/**
 * The ranking of „Hochstapler“: which rows exist, in which order, what each cell says. Pure, like
 * Verrohrung's `scoreboard.ts`, without a clock.
 */
import type { GameEntry } from '@/games/GameEntry'
import { withTicks } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { asStackFloorGuess, asStackFloorOutcome } from './types'
import type { StackFloorMark } from './types'

export interface ScoreRow extends ScoreboardRow {
  /** Floors above the foundation; `null` when the outcome is not readable. */
  height: number | null
  marks: StackFloorMark[]
  /** The tip's click times for the reveal to rebuild the tower; `null` when unreadable. */
  clicks: number[] | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  mineUserId: string | null
}): ScoreRow[] {
  const rows = input.entries.map((entry) => {
    const outcome = asStackFloorOutcome(entry.outcome)

    return {
      ...rowHead(entry, null),
      height: outcome?.height ?? null,
      marks: outcome?.marks ?? [],
      clicks: asStackFloorGuess(entry.guess)?.clicks ?? null,
    }
  })

  rows.sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      (b.height ?? -1) - (a.height ?? -1) ||
      a.userId.localeCompare(b.userId),
  )

  return withTicks(rows, input.mineUserId)
}

export function heightLabel(height: number): string {
  return height === 1 ? '1 Stockwerk' : `${height} Stockwerke`
}
