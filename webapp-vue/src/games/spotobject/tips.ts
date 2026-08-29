/**
 * The pure half of Weltanschauung's reveal: which tiles the grid shows and which rows the
 * scoreboard shows, built once from the round's entries so neither component has anything left
 * to compute. Model on `findpattern/scoreboard.ts` — the shape a test can assert on.
 *
 * The grid and the scoreboard stay two shapes rather than one: the grid is this game's own review
 * surface (photo, flag, votes), the scoreboard is the scoring table every game shares (name, time,
 * points) — see `SpotObjectReveal.vue` for why folding them together would be the wrong move.
 */
import type { AwardRule, Vote, VoteView } from '@/api/types'
import { isProvisional } from '@/games/awards'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import { readableTextColor } from '@/ui/readableTextColor'
import { asSpotObjectOutcome, asSpotObjectTip, flagOf } from './types'
import type { SpotObjectTip } from './types'

export interface TipTile {
  userId: string
  name: string
  colorHex: string
  ink: string
  tip: SpotObjectTip | null
  /** The country as its flag emoji — the code itself is nowhere shown, so nothing carries it on. */
  flag: string
  confirms: VoteView[]
  flags: VoteView[]
  /** The viewer's own ballot on this tip, which is what its two buttons render as pressed. */
  myVote: Vote | null
  /** Whether this tip currently scores nothing, override included. Copied, never recomputed. */
  struck: boolean
  adminOverride: boolean | null
  mine: boolean
}

export function tipTiles(input: {
  entries: readonly GameEntry[]
  mineUserId: string | null
}): TipTile[] {
  return input.entries.map((entry) => {
    const mineIsA = (value: Vote) =>
      input.mineUserId !== null &&
      entry.votes.some((vote) => vote.value === value && vote.userId === input.mineUserId)

    return {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      tip: asSpotObjectTip(entry.guess),
      flag: flagOf(asSpotObjectOutcome(entry.outcome)?.country ?? null),
      confirms: entry.votes.filter((vote) => vote.value === 'CONFIRM'),
      flags: entry.votes.filter((vote) => vote.value === 'FLAG'),
      myVote: mineIsA('CONFIRM') ? 'CONFIRM' : mineIsA('FLAG') ? 'FLAG' : null,
      struck: entry.struck,
      adminOverride: entry.adminOverride,
      mine: entry.userId === input.mineUserId,
    }
  })
}

export interface ScoreRow {
  userId: string
  name: string
  colorHex: string
  ink: string
  /** `mm:ss`, or `null` for a round that does not measure time — see `SpotObjectParams.timed`. */
  durationLabel: string | null
  points: number | null
  provisional: boolean
  tick: number
}

/** `mm:ss` with minutes running past 59 — the clock measures a round, not a wall clock. */
function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function hasDurations(rows: readonly ScoreRow[]): boolean {
  return rows.some((row) => row.durationLabel !== null)
}

/**
 * Faster first, by the millisecond the server measured. A row without a clock sorts after one
 * with it rather than winning by default.
 */
function durationOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const ranked = input.entries.map((entry) => ({
    durationMs: entry.durationMs,
    row: {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      durationLabel: formatDuration(entry.durationMs),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
    },
  }))

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      durationOrder(a.durationMs, b.durationMs) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  const myRank = ranked.findIndex((item) => item.row.userId === input.mineUserId)
  return ranked.map(({ row }, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}
