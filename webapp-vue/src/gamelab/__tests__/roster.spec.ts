import { describe, expect, it } from 'vitest'
import { labRoster, type LabViewer } from '@/gamelab/roster'
import type { LabAwardRule, LabEntryDto, LabPlayerDto } from '@/gamelab/types'

const ME: LabViewer = {
  id: 'me',
  username: 'Clemens',
  avatar: { shortName: 'CH', bgColorHex: '#123456' },
}

function entry(userId: string, points: number): LabEntryDto {
  return {
    userId,
    username: userId.toUpperCase(),
    avatar: { shortName: userId.slice(0, 2).toUpperCase(), bgColorHex: '#abcdef' },
    guess: null,
    outcome: null,
    at: '2026-11-16T12:00:00Z',
    points,
    stage: 0,
    durationMs: null,
    votes: [],
    struck: false,
    adminOverride: null,
    steps: [],
  }
}

function player(userId: string): LabPlayerDto {
  return {
    userId,
    username: userId.toUpperCase(),
    avatar: { shortName: 'XX', bgColorHex: '#000000' },
  }
}

function round(
  me: LabEntryDto | null,
  others: LabEntryDto[],
  awardRule: LabAwardRule = 'ALL_QUALIFYING',
  players: LabPlayerDto[] = others.map((o) => player(o.userId)),
) {
  return { me, others, awardRule, players }
}

describe('labRoster', () => {
  // The row is the product's; the lab only feeds it. A tester who has not guessed yet is still in
  // the community, so their avatar stands in the row — without a live chip, like any member who has
  // not played the round.
  it('seats the viewer before their first guess, without live points', () => {
    const roster = labRoster(round(null, []), ME)

    expect(roster).toEqual([
      {
        userId: 'me',
        shortName: 'CH',
        fullName: 'Clemens',
        bgColorHex: '#123456',
        points: { stable: 0 },
      },
    ])
  })

  // The lab has no standing total, so stable is 0 for all and the chip carries the round.
  it('carries each tester’s round points as live points', () => {
    const roster = labRoster(round(entry('me', 3), [entry('anna', 1)]), ME)

    expect(roster.map((m) => [m.userId, m.points])).toEqual([
      ['me', { stable: 0, live: { points: 3, provisional: false } }],
      ['anna', { stable: 0, live: { points: 1, provisional: false } }],
    ])
  })

  // Mirrors `RosterService.rank`: ranked by what is displayed, highest first. Ties fall back to the
  // user id — the server's last tiebreak; its middle one, the join date, the lab does not have.
  it('ranks by points, highest first, ties by user id', () => {
    const roster = labRoster(round(entry('me', 1), [entry('bea', 4), entry('anna', 1)]), ME)

    expect(roster.map((m) => m.userId)).toEqual(['bea', 'anna', 'me'])
  })

  // Mirrors `RoundPlayPoints`: only a scoring tip under the best-guess rule can still be overtaken.
  it('marks points provisional only in phase two and only when there are any', () => {
    const roster = labRoster(round(entry('me', 2), [entry('anna', 0)], 'CLOSEST_ONLY'), ME)

    expect(roster.find((m) => m.userId === 'me')?.points.live?.provisional).toBe(true)
    expect(roster.find((m) => m.userId === 'anna')?.points.live?.provisional).toBe(false)
  })

  // Before my guess the server names who played but withholds their entries. They are seated like
  // members who have not played: no chip, so nothing about their tip leaks into the row.
  it('seats the other players before my guess, without live points', () => {
    const roster = labRoster(round(null, [], 'ALL_QUALIFYING', [player('anna')]), ME)

    expect(roster.map((m) => [m.userId, m.points])).toEqual([
      ['anna', { stable: 0 }],
      ['me', { stable: 0 }],
    ])
  })

  it('is empty without a viewer and without entries', () => {
    expect(labRoster(round(null, []), null)).toEqual([])
  })
})
