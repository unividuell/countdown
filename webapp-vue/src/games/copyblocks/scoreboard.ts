/**
 * The ranking of „Blockierung“: which rows exist, in which order, what each cell says. Pure, like
 * Platzierung's `scoreboard.ts`.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import { durationOrder, formatDuration } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { asCopyBlocksOutcome } from './types'
import type { CopyBlocksOutcome } from './types'

export interface ScoreRow extends ScoreboardRow {
  correct: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** What the server judged, for the reveal to redraw; `null` when it is not readable. */
  outcome: CopyBlocksOutcome | null
  /**
   * „K/D“ in the shooters' manner: blocks right, then everything marked — missing, extra, wrong
   * type. `24/3`, or `null` without a readable outcome or the template's size.
   */
  kdLabel: string | null
}

function kdOf(outcome: CopyBlocksOutcome | null, templateSize: number | null): string | null {
  if (outcome === null || templateSize === null) return null

  const { missing, extra, wrongType } = outcome
  const right = Math.max(0, templateSize - missing.length - wrongType.length)
  return `${right}/${missing.length + extra.length + wrongType.length}`
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  mineUserId: string | null
  /** Blocks in the template; `null` while the payload is not here. */
  templateSize: number | null
}): ScoreRow[] {
  const ranked = input.entries.map((entry) => {
    const outcome = asCopyBlocksOutcome(entry.outcome)

    return {
      durationMs: entry.durationMs,
      row: {
        userId: entry.userId,
        name: entry.username,
        colorHex: entry.avatar.bgColorHex,
        ink: readableTextColor(entry.avatar.bgColorHex),
        correct: outcome?.correct ?? false,
        durationLabel: formatDuration(entry.durationMs),
        points: entry.points,
        provisional: isProvisional(entry.points, input.awardRule),
        outcome,
        kdLabel: kdOf(outcome, input.templateSize),
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
