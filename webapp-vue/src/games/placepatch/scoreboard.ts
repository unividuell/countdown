/**
 * „Auswertung“: which rows exist, in which order, and what each cell says. Pure, like Musterung's
 * `scoreboard.ts` — this is the half a test can assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import { formatDuration } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock } from '@/games/ranking'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { cellOf } from './types'
import type { Cell, PlacePatchPayload, PlacePatchSolution } from './types'

export interface ScoreRow extends ScoreboardRow {
  correct: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** Where their stamp lay, for the box on the reveal board; `null` without a tip on it. */
  cell: Cell | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: PlacePatchSolution
  layout: PlacePatchPayload
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  return rankByClock(input.entries, input.mineUserId, (entry) => {
    const cell = cellOf(entry.guess, input.layout)
    return {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      // Read off the board rather than off `outcome`: the box sits on the picture, so „correct“
      // has to be the comparison the reader is making.
      correct: cell !== null && cell.x === input.solution.x && cell.y === input.solution.y,
      durationLabel: formatDuration(entry.durationMs),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
      cell,
    }
  })
}
