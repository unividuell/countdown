import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import { formatDeviation, scoreboardRows, toleranceText } from '@/games/mixcolor/scoreboard'

function entry(over: Partial<GameEntry>): GameEntry {
  return gameEntry({
    guess: { drops: 7 },
    outcome: { hex: '#00A0E9', recipe: { c: 4, m: 3 }, deviation: 1, withinTolerance: null },
    points: 1,
    ...over,
  })
}

function rowsOf(entries: GameEntry[], mineUserId: string | null = null) {
  return scoreboardRows({ entries, awardRule: 'ALL_QUALIFYING', mineUserId })
}

describe('formatDeviation', () => {
  it('uses one decimal and a comma', () => {
    expect(formatDeviation(3.24)).toBe('3,2')
    expect(formatDeviation(0)).toBe('0,0')
  })
})

describe('toleranceText', () => {
  it('prefixes the gate', () => {
    expect(toleranceText(4)).toBe('≤ 4,0')
  })
})

describe('scoreboardRows', () => {
  it('prints drops and deviation from the outcome', () => {
    const [row] = rowsOf([
      entry({
        outcome: { hex: '#112233', recipe: { c: 4, m: 3 }, deviation: 3.24, withinTolerance: null },
      }),
    ])

    expect(row).toMatchObject({
      drops: '7',
      off: '3,2',
      deviation: 3.24,
      hex: '#112233',
      recipe: { c: 4, m: 3 },
    })
  })

  it('ranks by points, then deviation, then user id', () => {
    const o = (deviation: number) => ({
      hex: '#000000',
      recipe: {},
      deviation,
      withinTolerance: null,
    })
    const rows = rowsOf([
      entry({ userId: 'd', points: 1, outcome: o(0.5) }),
      entry({ userId: 'c', points: 3, outcome: o(0.9) }),
      entry({ userId: 'b', points: 3, outcome: o(0.1) }),
      entry({ userId: 'a', points: 3, outcome: o(0.1) }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps a given-up entry, last, with dashes', () => {
    const rows = rowsOf([
      entry({ userId: 'gaveup', guess: null, outcome: null, points: null }),
      entry({ userId: 'fine' }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['fine', 'gaveup'])
    expect(rows[1]).toMatchObject({
      drops: '–',
      off: '–',
      deviation: null,
      hex: null,
      recipe: null,
    })
  })
})
