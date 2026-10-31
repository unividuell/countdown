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
import type { GameEntry } from '@/games/GameEntry'
import { rankByClock } from '@/games/ranking'
import { rowHead } from '@/games/scoreboardColumns'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
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

/**
 * By panorama id, and by user id where there is no panorama to sort by.
 *
 * There is no *good* order for tips — none of them is more right than another, and the scoreboard
 * below already ranks. What there has to be is one order: `entries` arrives mine-first, so every
 * player saw the same round in a different arrangement, and nobody could point at „the third one“
 * and be understood.
 *
 * The panorama rather than the name, because the name would put the same person first in every
 * round of the run. A tip's panorama is whatever the world handed them that day: stable for the
 * length of a round, and shuffled again by the next one.
 *
 * A player who gave up has no panorama and sorts last — there is nothing to look at there.
 */
function byPano(a: TipTile, b: TipTile): number {
  if ((a.tip === null) !== (b.tip === null)) return a.tip === null ? 1 : -1
  return (
    (a.tip?.panoId ?? '').localeCompare(b.tip?.panoId ?? '') || a.userId.localeCompare(b.userId)
  )
}

export function tipTiles(input: {
  entries: readonly GameEntry[]
  mineUserId: string | null
}): TipTile[] {
  const tiles: TipTile[] = input.entries.map((entry) => {
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

  return tiles.sort(byPano)
}

export interface ScoreRow extends ScoreboardRow {
  /** `mm:ss`, or `null` for a round that does not measure time — see `SpotObjectParams.timed`. */
  durationLabel: string | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  return rankByClock(input.entries, input.mineUserId, (entry) => rowHead(entry, input.awardRule))
}
