/**
 * The scoreboard's order, shared by every game. A game brings its own row; the ranking and the tick
 * each row rides in the reveal cascade come from here.
 */
import { durationOrder } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'

/** Stamps rows already in rank order with the cascade tick each one rides — see `tickOfRow`. */
export function withTicks<Row extends { userId: string }>(
  ranked: readonly Row[],
  mineUserId: string | null,
): (Row & { tick: number })[] {
  const myRank = ranked.findIndex((row) => row.userId === mineUserId)
  return ranked.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

/** What the clock ranking reads off a row. `correct` only where a game judges hit or miss. */
interface ClockRankable {
  userId: string
  points: number | null
  correct?: boolean
}

/**
 * Most points first (`null` last), then a hit before a miss, then the faster clock, then user id so
 * a reload shows the same picture. The clock is the entry's own, so a row need not carry it.
 */
export function rankByClock<Row extends ClockRankable>(
  entries: readonly GameEntry[],
  mineUserId: string | null,
  toRow: (entry: GameEntry) => Row,
): (Row & { tick: number })[] {
  const ranked = entries.map((entry) => ({ durationMs: entry.durationMs, row: toRow(entry) }))

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      Number(b.row.correct ?? false) - Number(a.row.correct ?? false) ||
      durationOrder(a.durationMs, b.durationMs) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  return withTicks(
    ranked.map(({ row }) => row),
    mineUserId,
  )
}
