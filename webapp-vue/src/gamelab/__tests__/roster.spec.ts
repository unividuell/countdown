import { describe, expect, it } from 'vitest'
import { labRoster, labStreakBase, type LabViewer } from '@/gamelab/roster'
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
  return { seed: 7, me, others, awardRule, players }
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
        streak: labStreakBase(7, 'me'),
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

  describe('streak', () => {
    const streakOf = (roster: ReturnType<typeof labRoster>, id: string) =>
      roster.find((m) => m.userId === id)!.streak

    // The lab has no history; the streak is rolled from the URL's seed so a link reproduces it.
    it('rolls the same streaks for the same seed and others for another', () => {
      const a = (seed: number) => ({ ...round(null, [entry('ann', 1)]), seed })

      expect(labRoster(a(7), ME)).toEqual(labRoster(a(7), ME))

      const seen = new Set<number>()
      for (let seed = 1; seed <= 20; seed++) seen.add(streakOf(labRoster(a(seed), ME), 'ann'))
      expect(seen.size).toBeGreaterThan(1)
    })

    // Just below a band edge, so one more round tips the badge over it — for everyone alike.
    it('starts everyone just below a band boundary most of the time', () => {
      for (let i = 0; i < 50; i++) {
        expect([2, 9, 19, 32, 49, 5, 14, 25, 40]).toContain(labStreakBase(7, `user-${i}`))
      }
    })

    // Two testers on one seed must see each other's badge as each sees their own.
    it('shows a player the same streak whoever looks', () => {
      const ANN: LabViewer = {
        id: 'ann',
        username: 'Ann',
        avatar: { shortName: 'AN', bgColorHex: '#000000' },
      }
      const asMe = labRoster(round(entry('me', 1), [entry('ann', 1)]), ME)
      const asAnn = labRoster(round(entry('ann', 1), [entry('me', 1)]), ANN)

      expect(streakOf(asMe, 'ann')).toBe(streakOf(asAnn, 'ann'))
      expect(streakOf(asMe, 'me')).toBe(streakOf(asAnn, 'me'))
    })

    it('adds the lab round to whoever submitted it', () => {
      const seated = labRoster(round(null, [], 'ALL_QUALIFYING', [player('ann')]), ME)
      const entered = labRoster(round(null, [entry('ann', 1)]), ME)

      expect(streakOf(entered, 'ann')).toBe(streakOf(seated, 'ann') + 1)
      expect(streakOf(seated, 'ann')).toBe(labStreakBase(7, 'ann'))
    })

    it('adds it to me once my entry lands', () => {
      const before = streakOf(labRoster(round(null, []), ME), 'me')
      const after = streakOf(labRoster(round(entry('me', 1), []), ME), 'me')

      expect(before).toBe(labStreakBase(7, 'me'))
      expect(after).toBe(before + 1)
    })
  })
})
