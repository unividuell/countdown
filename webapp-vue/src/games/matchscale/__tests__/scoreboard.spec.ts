import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { formatFactor, formatTolerance, myWin, scoreboardRows } from '@/games/matchscale/scoreboard'

function entry(over: Partial<GameEntry>): GameEntry {
  return gameEntry({
    guess: { scale: 1 },
    outcome: { scale: 1, deviation: 0, withinTolerance: true },
    points: 1,
    ...over,
  })
}

function rowsOf(entries: GameEntry[], mineUserId: string | null = null, factor = 2) {
  return scoreboardRows({ entries, factor, awardRule: 'ALL_QUALIFYING', mineUserId })
}

describe('formatFactor', () => {
  it('uses a decimal comma and at most two decimals', () => {
    expect(formatFactor(1.3)).toBe('1,3')
    expect(formatFactor(2)).toBe('2')
    expect(formatFactor(1.2345)).toBe('1,23')
  })
})

describe('formatTolerance', () => {
  it('names the gate in percent, without float noise', () => {
    expect(formatTolerance(1.1)).toBe('± 10 %')
    expect(formatTolerance(1.25)).toBe('± 25 %')
  })
})

describe('scoreboardRows', () => {
  it('ranks by points, then deviation, then user id', () => {
    const rows = rowsOf([
      entry({
        userId: 'd',
        points: 1,
        outcome: { scale: 1, deviation: 0.5, withinTolerance: null },
      }),
      entry({
        userId: 'c',
        points: 3,
        outcome: { scale: 1, deviation: 0.9, withinTolerance: null },
      }),
      entry({
        userId: 'b',
        points: 3,
        outcome: { scale: 1, deviation: 0.1, withinTolerance: null },
      }),
      entry({
        userId: 'a',
        points: 3,
        outcome: { scale: 1, deviation: 0.1, withinTolerance: null },
      }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts unscored and unjudged entries last', () => {
    const rows = rowsOf([
      entry({ userId: 'nopoints', points: null }),
      entry({ userId: 'nooutcome', points: 1, outcome: null }),
      entry({ userId: 'fine', points: 1 }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['fine', 'nooutcome', 'nopoints'])
  })

  it('drops an entry whose guess has no usable scale', () => {
    const rows = rowsOf([
      entry({ userId: 'broken', guess: { scale: 'x' } }),
      entry({ userId: 'ok' }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['ok'])
  })

  it('prints the tip and the signed deviation from the factor', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'over', guess: { scale: 2.46 } }),
        entry({ userId: 'under', guess: { scale: 1.64 } }),
        entry({ userId: 'exact', guess: { scale: 2 } }),
      ],
      null,
      2,
    )
    const byId = Object.fromEntries(rows.map((row) => [row.userId, row]))

    expect(byId.over!.tip).toBe('2,46×')
    expect(byId.over!.off).toBe('+23 %')
    expect(byId.under!.off).toBe('−18 %')
    expect(byId.exact!.off).toBe('+0 %')
  })

  it('sorts outcome-less entries of equal points by user id', () => {
    const rows = rowsOf([
      entry({ userId: 'b', outcome: null }),
      entry({ userId: 'a', outcome: null }),
      entry({ userId: 'c', outcome: { scale: 1, deviation: 0.2, withinTolerance: null } }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['c', 'a', 'b'])
  })

  it('gives each row its rank as a tick, and holds mine back to the first foreign marker', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'far', outcome: { scale: 1, deviation: 0.9, withinTolerance: null } }),
        entry({ userId: 'me', outcome: { scale: 1, deviation: 0.4, withinTolerance: null } }),
        entry({ userId: 'near', outcome: { scale: 1, deviation: 0.1, withinTolerance: null } }),
      ],
      'me',
    )

    expect(rows.map((row) => [row.userId, row.tick])).toEqual([
      ['near', 0],
      ['me', 0],
      ['far', 2],
    ])
  })
})

describe('myWin', () => {
  const inside = { scale: 1, deviation: 0.05, withinTolerance: true }
  const outside = { scale: 1, deviation: 0.5, withinTolerance: false }

  it('phase one: my tip inside the gate', () => {
    const rows = rowsOf([entry({ userId: 'me', points: 0 })], 'me')

    expect(myWin({ toleranceFactor: 1.1, outcome: inside, rows, mineUserId: 'me' })).toBe(true)
    expect(myWin({ toleranceFactor: 1.1, outcome: outside, rows, mineUserId: 'me' })).toBe(false)
    expect(myWin({ toleranceFactor: 1.1, outcome: null, rows, mineUserId: 'me' })).toBeNull()
  })

  it('phase two: my row holds the points now', () => {
    const rows = rowsOf([entry({ userId: 'me', points: 3 }), entry({ userId: 'you', points: 0 })])
    const phaseTwo = { toleranceFactor: null, outcome: outside, rows }

    expect(myWin({ ...phaseTwo, mineUserId: 'me' })).toBe(true)
    expect(myWin({ ...phaseTwo, mineUserId: 'you' })).toBe(false)
    expect(myWin({ ...phaseTwo, mineUserId: 'nobody' })).toBeNull()
  })
})
