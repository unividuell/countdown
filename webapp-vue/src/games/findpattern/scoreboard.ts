/**
 * „Auswertung“: which rows exist, in which order, and what each cell says.
 *
 * Pure, like Guess Hue's `scoreboard.ts` — this is the half a test can assert on, and the component
 * above it has nothing left to get wrong.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import { readableTextColor } from '@/ui/readableTextColor'
import { startIndexOf } from './types'
import type { FindPatternSolution } from './types'

export interface ToneChip {
  value: number
  hex: string
  ink: string
}

export interface ScoreRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground, and the colour of their outline on the board. */
  colorHex: string
  ink: string
  /** The four tones they picked, or empty for a row that gave up. */
  chips: ToneChip[]
  correct: boolean
  gaveUp: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  points: number | null
  provisional: boolean
  /** Where their run starts, for the outline on the reveal board. `null` for a give-up. */
  startIndex: number | null
  tick: number
}

export function toneChips(tones: readonly number[], palette: readonly string[]): ToneChip[] {
  return tones.flatMap((value) => {
    const hex = palette[value]
    return hex === undefined ? [] : [{ value, hex, ink: readableTextColor(hex) }]
  })
}

/** `mm:ss` with minutes running past 59 — the clock measures a round, not a wall clock. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Word for word the server's own rule (`RoundPlayPoints.kt`): under „closest only“ a score above zero
 * can still be taken away, a zero is final.
 */
function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: FindPatternSolution
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const patternLength = input.solution.pattern.length
  const ranked = input.entries.map((entry) => {
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

  ranked.sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      Number(b.correct) - Number(a.correct) ||
      durationOrder(a.durationLabel, b.durationLabel) ||
      a.userId.localeCompare(b.userId),
  )

  const myRank = ranked.findIndex((row) => row.userId === input.mineUserId)
  return ranked.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

export function hasDurations(rows: readonly ScoreRow[]): boolean {
  return rows.some((row) => row.durationLabel !== null)
}

/** Faster first; a row without a clock sorts after one with it rather than winning by default. */
function durationOrder(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}
