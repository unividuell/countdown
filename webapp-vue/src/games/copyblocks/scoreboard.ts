/**
 * The ranking of „Blockierung“: which rows exist, in which order, what each cell says. Pure, like
 * Platzierung's `scoreboard.ts`.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
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
  return rankByClock(input.entries, input.mineUserId, (entry) => {
    const outcome = asCopyBlocksOutcome(entry.outcome)

    return {
      ...rowHead(entry, input.awardRule),
      correct: outcome?.correct ?? false,
      outcome,
      kdLabel: kdOf(outcome, input.templateSize),
    }
  })
}
