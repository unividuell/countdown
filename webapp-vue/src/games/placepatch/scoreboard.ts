/**
 * „Auswertung“: which rows exist, in which order, and what each cell says. Pure, like Musterung's
 * `scoreboard.ts` — this is the half a test can assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import { durationOrder, formatDuration } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { cellOf } from './types'
import type { Cell, PlacePatchPayload, PlacePatchSolution } from './types'

export interface ScoreRow extends ScoreboardRow {
  correct: boolean
  /** No tip on the board: gave up, or a stored guess that does not fit it. */
  gaveUp: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** Where their stamp lay, for the box on the reveal board. */
  cell: Cell | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: PlacePatchSolution
  layout: PlacePatchPayload
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const ranked = input.entries.map((entry) => {
    const cell = cellOf(entry.guess, input.layout)
    return {
      durationMs: entry.durationMs,
      row: {
        userId: entry.userId,
        name: entry.username,
        colorHex: entry.avatar.bgColorHex,
        ink: readableTextColor(entry.avatar.bgColorHex),
        // Read off the board rather than off `outcome`: the box sits on the picture, so „correct“
        // has to be the comparison the reader is making.
        correct: cell !== null && cell.x === input.solution.x && cell.y === input.solution.y,
        gaveUp: cell === null,
        durationLabel: formatDuration(entry.durationMs),
        points: entry.points,
        provisional: isProvisional(entry.points, input.awardRule),
        cell,
      },
    }
  })

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      Number(b.row.correct) - Number(a.row.correct) ||
      durationOrder(a.durationMs, b.durationMs) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  const myRank = ranked.findIndex((item) => item.row.userId === input.mineUserId)
  return ranked.map(({ row }, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

export function hasDurations(rows: readonly ScoreRow[]): boolean {
  return rows.some((row) => row.durationLabel !== null)
}
