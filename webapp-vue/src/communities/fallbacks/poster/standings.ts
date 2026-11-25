import type { RosterMemberResponse } from '@/api/types'
import { rankOf } from '@/members/winner'

export interface Standing {
  member: RosterMemberResponse
  points: number
  /** Competition ranking: 1, 1, 3. */
  rank: number
}

export interface PodiumStep {
  rank: number
  rows: Standing[]
}

/** The final table. A stable sort, so a tie keeps the roster's order. */
export function standings(members: readonly RosterMemberResponse[]): Standing[] {
  const sorted = members
    .map((member) => ({ member, points: rankOf(member) }))
    .sort((a, b) => b.points - a.points)

  return sorted.map((row) => ({
    ...row,
    rank: 1 + sorted.findIndex((other) => other.points === row.points),
  }))
}

/**
 * Places 1, 2 and 3 in podium order — second, first, third. A shared place leaves the next step
 * empty (1, 1, 3: nobody on 2); nobody without points stands on it.
 *
 *        ┌───┐
 *   ┌───┐│ 1 │
 *   │ 2 ││   │┌───┐
 *   │   ││   ││ 3 │
 */
export function podium(table: readonly Standing[]): PodiumStep[] {
  return [2, 1, 3].map((rank) => ({
    rank,
    rows: table.filter((row) => row.rank === rank && row.points > 0),
  }))
}
