/**
 * „Auswertung“: which rows exist, in which order, and what each cell says.
 *
 * Pure, like Guess Hue's `scoreboard.ts` — this is the half a test can assert on, and the component
 * above it has nothing left to get wrong.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
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
      durationMs: entry.durationMs,
      row: {
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

/**
 * Faster first, by the millisecond the server measured — never by comparing the `mm:ss` label as
 * text, which inverts past two-digit minutes (`"100:00"` sorts before `"60:00"`). A row without a
 * clock sorts after one with it rather than winning by default.
 */
function durationOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}
