/**
 * The ranking of „Verrohrung“: which rows exist, in which order, what each cell says. Pure, like
 * Blockierung's `scoreboard.ts`.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { asTurnPipesGuess, asTurnPipesOutcome } from './types'
import type { TurnPipesOutcome } from './types'

export interface ScoreRow extends ScoreboardRow {
  correct: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** What the server judged, for the reveal to redraw; `null` when it is not readable. */
  outcome: TurnPipesOutcome | null
  /** The tip's rotations for the reveal to redraw; `null` when unreadable or of the wrong length. */
  rotations: number[] | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  mineUserId: string | null
  /** Cells per side; `null` while the scene is not here. */
  size: number | null
}): ScoreRow[] {
  return rankByClock(input.entries, input.mineUserId, (entry) => {
    const outcome = asTurnPipesOutcome(entry.outcome)
    const rotations = asTurnPipesGuess(entry.guess)?.rotations ?? null

    return {
      ...rowHead(entry, input.awardRule),
      correct: outcome?.correct ?? false,
      outcome,
      rotations:
        input.size !== null && rotations?.length === input.size * input.size ? rotations : null,
    }
  })
}
