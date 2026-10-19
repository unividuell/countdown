/**
 * „Auswertung“: which rows exist, in which order, and what each cell says.
 *
 * Pure, like Guess Hue's `scoreboard.ts` — this is the half a test can assert on, and the component
 * above it has nothing left to get wrong.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import { formatDuration } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock } from '@/games/ranking'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { startIndexOf } from './types'
import type { FindPatternSolution } from './types'

export interface ToneChip {
  value: number
  hex: string
  ink: string
}

export interface ScoreRow extends ScoreboardRow {
  /** The four tones they picked, or empty for a row that gave up. */
  chips: ToneChip[]
  correct: boolean
  gaveUp: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** Where their run starts, for the outline on the reveal board. `null` for a give-up. */
  startIndex: number | null
}

export function toneChips(tones: readonly number[], palette: readonly string[]): ToneChip[] {
  return tones.flatMap((value) => {
    const hex = palette[value]
    return hex === undefined ? [] : [{ value, hex, ink: readableTextColor(hex) }]
  })
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: FindPatternSolution
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const patternLength = input.solution.pattern.length
  return rankByClock(input.entries, input.mineUserId, (entry) => {
    const startIndex = startIndexOf(entry.guess)
    const tones =
      startIndex === null ? [] : input.solution.blocks.slice(startIndex, startIndex + patternLength)
    return {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      chips: toneChips(tones, input.solution.palette),
      // Read off the board rather than off `outcome`: the row's own chips sit right under the
      // solution's, so „correct“ has to be the same comparison the reader is making.
      correct:
        tones.length === patternLength &&
        tones.every((tone, at) => tone === input.solution.pattern[at]),
      gaveUp: startIndex === null,
      durationLabel: formatDuration(entry.durationMs),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
      startIndex,
    }
  })
}
