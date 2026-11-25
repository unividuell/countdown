import { describe, expect, it } from 'vitest'
import type { RosterMemberResponse } from '@/api/types'
import { podium, standings } from '@/communities/fallbacks/poster/standings'

function member(fullName: string, stable: number, live?: number): RosterMemberResponse {
  return {
    userId: fullName,
    shortName: fullName.slice(0, 3).toUpperCase(),
    fullName,
    bgColorHex: '#8e44ad',
    points:
      live === undefined ? { stable } : { stable, live: { points: live, provisional: false } },
    streak: 0,
  }
}

const names = (rows: { member: RosterMemberResponse }[]) => rows.map((r) => r.member.fullName)

describe('standings', () => {
  it('ranks by stable plus live points, highest first', () => {
    const rows = standings([member('fry', 3), member('leela', 2, 5), member('bender', 9)])
    expect(names(rows)).toEqual(['bender', 'leela', 'fry'])
    expect(rows.map((r) => r.points)).toEqual([9, 7, 3])
  })

  // Competition ranking: 1, 1, 3 — a tie takes the places it fills.
  it('gives a tie one rank and skips the places it fills', () => {
    const rows = standings([member('fry', 5), member('leela', 5), member('bender', 2)])
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('keeps the roster order within a tie', () => {
    expect(names(standings([member('leela', 5), member('fry', 5)]))).toEqual(['leela', 'fry'])
  })
})

describe('podium', () => {
  const ranksAndNames = (steps: ReturnType<typeof podium>) =>
    steps.map((s) => [s.rank, names(s.rows)])

  it('is always places 2, 1, 3', () => {
    const table = standings([member('a', 9), member('b', 7), member('c', 4)])
    expect(ranksAndNames(podium(table))).toEqual([
      [2, ['b']],
      [1, ['a']],
      [3, ['c']],
    ])
  })

  // Competition ranking: a shared place takes the next one with it.
  it('leaves the place after a shared one empty', () => {
    const table = standings([member('a', 9), member('b', 9), member('c', 4), member('d', 1)])
    expect(ranksAndNames(podium(table))).toEqual([
      [2, []],
      [1, ['a', 'b']],
      [3, ['c']],
    ])
  })

  it('leaves third empty when second is shared', () => {
    const table = standings([member('a', 9), member('b', 7), member('c', 7), member('d', 4)])
    expect(ranksAndNames(podium(table))).toEqual([
      [2, ['b', 'c']],
      [1, ['a']],
      [3, []],
    ])
  })

  it('puts nobody without points on it', () => {
    const table = standings([member('a', 9), member('b', 0)])
    expect(ranksAndNames(podium(table))).toEqual([
      [2, []],
      [1, ['a']],
      [3, []],
    ])
  })
})
