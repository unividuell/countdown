import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import {
  formatFactor,
  formatTolerance,
  myWin,
  scoreboardRows,
  solutionText,
  toleranceText,
  truthOf,
  type Truth,
} from '@/games/matchscale/scoreboard'

function entry(over: Partial<GameEntry>): GameEntry {
  return gameEntry({
    guess: { scale: 1 },
    outcome: { scale: 1, deviation: 0, withinTolerance: true },
    points: 1,
    ...over,
  })
}

function rowsOf(
  entries: GameEntry[],
  mineUserId: string | null = null,
  factor = 2,
  truth: Truth | null = null,
) {
  return scoreboardRows({ entries, factor, truth, awardRule: 'ALL_QUALIFYING', mineUserId })
}

/** B is 2 m long, the round counts in cm. */
const TWO_METRES: Truth = { metres: 2, unit: 'cm' }

describe('formatFactor', () => {
  it('uses a decimal comma and always two decimals', () => {
    expect(formatFactor(1.3)).toBe('1,30')
    expect(formatFactor(2)).toBe('2,00')
    expect(formatFactor(1.2345)).toBe('1,23')
  })
})

describe('formatTolerance', () => {
  it('names the gate in whole percent, the same either way', () => {
    expect(formatTolerance(0.25)).toBe('±25')
    expect(formatTolerance(0.1)).toBe('±10')
  })
})

describe('truthOf', () => {
  const measure = (metres: number) => ({ axis: 'length' as const, metres, source: 'x' })

  it("is B's length in the pair's unit", () => {
    expect(truthOf(measure(0.12), measure(2))).toEqual({ metres: 2, unit: 'cm' })
    expect(truthOf(null, measure(2))).toEqual({ metres: 2, unit: 'cm' })
  })

  it("is null without B's measure", () => {
    expect(truthOf(measure(2), null)).toBeNull()
  })
})

describe('solutionText', () => {
  it("is B's length, or the factor without one", () => {
    expect(solutionText(1.6, TWO_METRES)).toBe('200,0')
    expect(solutionText(1.6, null)).toBe('1,60')
  })
})

describe('toleranceText', () => {
  it('is how far a tip may sit from the solution either way, in the distance column unit', () => {
    expect(toleranceText(0.25, TWO_METRES)).toBe('±50,0')
    expect(toleranceText(0.25, { metres: 61, unit: 'm' })).toBe('±15,3')
  })

  it('is the percent without a length, nothing in phase two', () => {
    expect(toleranceText(0.25, null)).toBe('±25')
    expect(toleranceText(null, TWO_METRES)).toBeNull()
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

  it("prints the tip as B's length and its signed distance in the round's unit", () => {
    const rows = rowsOf(
      [
        entry({ userId: 'under', guess: { scale: 1.6 } }),
        entry({ userId: 'over', guess: { scale: 2.5 } }),
        entry({ userId: 'exact', guess: { scale: 2.0001 } }),
      ],
      null,
      2,
      TWO_METRES,
    )
    const byId = Object.fromEntries(rows.map((row) => [row.userId, row]))

    expect(byId.under!.tip).toBe('160,0')
    expect(byId.under!.off).toBe('−40,0')
    expect(byId.over!.tip).toBe('250,0')
    expect(byId.over!.off).toBe('+50,0')
    expect(byId.exact!.tip).toBe('200,0')
    expect(byId.exact!.off).toBe('±0,0')
  })

  it('shows a tip just outside the gate as outside: tenths, not whole numbers', () => {
    // B 42 cm, gate 25 %: 10.5 cm. The tip 31.42 cm misses by 10.58 cm (25.2 %); in whole
    // numbers both would read 11.
    const truth: Truth = { metres: 0.42, unit: 'cm' }
    const [row] = rowsOf([entry({ userId: 'edge', guess: { scale: 0.7481 } })], null, 1, truth)

    expect(toleranceText(0.25, truth)).toBe('±10,5')
    expect(row!.tip).toBe('31,4')
    expect(row!.off).toBe('−10,6')
  })

  it("without B's measure prints the tip as a factor and its distance in percent", () => {
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

    expect(byId.over!.tip).toBe('2,46')
    expect(byId.over!.off).toBe('+23')
    expect(byId.under!.off).toBe('−18')
    expect(byId.exact!.off).toBe('±0')
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

    expect(myWin({ tolerance: 0.1, outcome: inside, rows, mineUserId: 'me' })).toBe(true)
    expect(myWin({ tolerance: 0.1, outcome: outside, rows, mineUserId: 'me' })).toBe(false)
    expect(myWin({ tolerance: 0.1, outcome: null, rows, mineUserId: 'me' })).toBeNull()
  })

  it('phase two: my row holds the points now', () => {
    const rows = rowsOf([entry({ userId: 'me', points: 3 }), entry({ userId: 'you', points: 0 })])
    const phaseTwo = { tolerance: null, outcome: outside, rows }

    expect(myWin({ ...phaseTwo, mineUserId: 'me' })).toBe(true)
    expect(myWin({ ...phaseTwo, mineUserId: 'you' })).toBe(false)
    expect(myWin({ ...phaseTwo, mineUserId: 'nobody' })).toBeNull()
  })
})
