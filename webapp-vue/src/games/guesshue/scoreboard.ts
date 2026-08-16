/**
 * The scoreboard's arithmetic: which rows exist, in which order, and whether a score can still
 * move. Pure, and kept out of the component for the same reason `reveal.ts` is — happy-dom
 * computes no layout, so this is the half a test can actually assert on.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { readableTextColor } from '@/ui/readableTextColor'
import { hslToHex } from './color'
import { tickOfRow } from './reveal'
import { hueOf } from './types'

export interface ScoreboardRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground. */
  colorHex: string
  /** Ink that reads against [colorHex]. */
  ink: string
  hue: number
  /** The guess as a colour, at the round's saturation and lightness. */
  guessHex: string
  /** Ink that reads against [guessHex] — a different decision from [ink]. */
  guessInk: string
  /** How far off, as the server judged it. Never recomputed here. */
  deviationDeg: number
  points: number | null
  /** Whether [points] can still be overtaken — see [isProvisional]. */
  provisional: boolean
  /**
   * Which tick of the reveal cascade this row's timing comes from. Its rank, except for the
   * viewer's own row — see `tickOfRow` in `reveal.ts`.
   */
  tick: number
}

/** The solution as the head block shows it: a number over a colour. */
export interface ScoreboardSolution {
  hue: number
  hex: string
  ink: string
}

/**
 * Whether a score can still be overtaken. Word for word the server's own rule in
 * `RoundPlayPoints.kt` (`provisional = awardRule == CLOSEST_ONLY && points > 0`), mirrored here
 * because a round's response carries the rule but not the verdict. A zero is final even under
 * „closest only": deviations freeze on guessing, so a later guess can only take points away.
 */
export function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}

export function solutionCell(
  targetHue: number,
  saturation: number,
  lightness: number,
): ScoreboardSolution {
  const hex = hslToHex(targetHue, saturation, lightness)
  return { hue: targetHue, hex, ink: readableTextColor(hex) }
}

/**
 * Every guess the table can rank, best first. Ties go by user id so a reload shows the same
 * picture — the same rule `layoutGuesses` uses for the wheel.
 *
 * An entry whose guess carries no usable angle, or whose outcome carries no usable deviation,
 * **drops out** rather than printing `NaN`. Its marker stays on the wheel; see `GuessHueGame`.
 */
export function scoreboardRows(input: {
  entries: readonly GameEntry[]
  saturation: number
  lightness: number
  awardRule: AwardRule | null
  /** Passed through to `tickOfRow`, which decides when my own row may land. */
  mineUserId: string | null
}): ScoreboardRow[] {
  const ranked = input.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    const deviationDeg = deviationOf(entry.outcome)
    if (hue === null || deviationDeg === null) return []
    const guessHex = hslToHex(hue, input.saturation, input.lightness)
    return [
      {
        userId: entry.userId,
        name: entry.username,
        colorHex: entry.avatar.bgColorHex,
        ink: readableTextColor(entry.avatar.bgColorHex),
        hue,
        guessHex,
        guessInk: readableTextColor(guessHex),
        deviationDeg,
        points: entry.points,
        provisional: isProvisional(entry.points, input.awardRule),
      },
    ]
  })

  ranked.sort((a, b) => a.deviationDeg - b.deviationDeg || a.userId.localeCompare(b.userId))
  const myRank = ranked.findIndex((row) => row.userId === input.mineUserId)
  return ranked.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

/** Narrowed, not cast: `outcome` is `unknown` by contract, and a stale round may be junk. */
function deviationOf(outcome: unknown): number | null {
  if (typeof outcome !== 'object' || outcome === null) return null
  const value = (outcome as { deviationDeg?: unknown }).deviationDeg
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
