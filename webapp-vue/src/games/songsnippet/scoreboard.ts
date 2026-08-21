/**
 * The scoreboard's arithmetic: which rows exist, in which order, and what each cell says. Pure and
 * outside the component for the same reason Guess Hue's is — happy-dom computes no layout, so this
 * is the half a test can actually assert on.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { readableTextColor } from '@/ui/readableTextColor'

export interface ScoreRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground, the same one their avatar has above the card. */
  colorHex: string
  /** Ink that reads against [colorHex]. */
  ink: string
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
  points: number | null
  /** Whether [points] can still be overtaken. */
  provisional: boolean
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
  return rows.sort(
    (a, b) =>
      (b.points ?? 0) - (a.points ?? 0) || a.stage - b.stage || a.userId.localeCompare(b.userId),
  )
}

/**
 * Whether a score can still be overtaken — the server's own rule in `RoundPlayPoints.kt`
 * (`awardRule == CLOSEST_ONLY && points > 0`), mirrored because a round's response carries the rule
 * but not the verdict. A zero is final even under „closest only“: a later guess can only take
 * points away, never give them.
 */
function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}

/** Narrowed, not cast: a guess is `unknown` by contract, and a stale round may be junk. */
function guessOf(guess: unknown): { trackId?: number; artist?: string; title?: string } | null {
  if (typeof guess !== 'object' || guess === null) return null
  return guess as { trackId?: number; artist?: string; title?: string }
}
