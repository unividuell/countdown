/**
 * The scoreboard's arithmetic: which rows exist, in which order, and what each cell says. Pure and
 * outside the component for the same reason Guess Hue's is — happy-dom computes no layout, so this
 * is the half a test can actually assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'

export interface ScoreRow extends ScoreboardRow {
  /** „Titel · Artist“, or the give-up dash. */
  guessLabel: string
  /** The guessed track, when it can be played back from the catalogue. `null` after a give-up. */
  trackId: number | null
  /** Whether the game judged this guess right — decides only whether it is playable, not its ink. */
  correct: boolean
  /**
   * How much audio this player needed, e.g. „2,0“ — always one decimal, see [oneDecimal]. Bare:
   * the unit stands in the column head („Zeit [s]“) rather than after every number.
   */
  timeLabel: string
  /** The stage behind [timeLabel] — the tie-breaker: less audio ranks higher. */
  stage: number
}

/** U+2014, standing in for a guess nobody made. A hyphen would read as a minus. */
const GAVE_UP = '— aufgegeben —'

/**
 * One decimal, always — „0,1“ over „15,0“ rather than over „15“. The column is right-aligned and
 * tabular, so a fixed number of decimals is what puts every comma on the same axis; the same reason
 * Guess Hue prints its degrees this way.
 */
const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Every entry as a row, best first: most points, then least audio, then user id so a reload shows
 * the same picture.
 */
export function scoreRows(input: {
  entries: readonly GameEntry[]
  durations: readonly number[]
  awardRule: AwardRule | null
  /** Passed through to `tickOfRow`, which decides when my own row may land. */
  mineUserId: string | null
}): ScoreRow[] {
  const rows = input.entries.map((entry) => {
    const guess = guessOf(entry.guess)
    return {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      guessLabel: guess?.title === undefined ? GAVE_UP : `${guess.title} · ${guess.artist ?? '?'}`,
      trackId: guess?.trackId ?? null,
      correct: (entry.outcome as { correct?: boolean } | null)?.correct === true,
      timeLabel: oneDecimal.format(input.durations[entry.stage] ?? 0),
      stage: entry.stage,
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
    }
  })
  rows.sort(
    (a, b) =>
      (b.points ?? 0) - (a.points ?? 0) || a.stage - b.stage || a.userId.localeCompare(b.userId),
  )

  const myRank = rows.findIndex((row) => row.userId === input.mineUserId)
  return rows.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, rows.length),
  }))
}

/** Narrowed, not cast: a guess is `unknown` by contract, and a stale round may be junk. */
function guessOf(guess: unknown): { trackId?: number; artist?: string; title?: string } | null {
  if (typeof guess !== 'object' || guess === null) return null
  return guess as { trackId?: number; artist?: string; title?: string }
}
