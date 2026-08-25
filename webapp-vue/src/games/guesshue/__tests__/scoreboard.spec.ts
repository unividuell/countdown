import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hslToHex } from '@/games/guesshue/color'
import { isProvisional, scoreboardRows, solutionCell } from '@/games/guesshue/scoreboard'

const SATURATION = 0.6
const LIGHTNESS = 0.45

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: { hue: 210 },
    outcome: { deviationDeg: 0, withinTolerance: true },
    points: 1,
    durationMs: null,
    avatar: { bgColorHex: '#3366cc' },
    ...over,
  }
}

function rowsOf(
  entries: GameEntry[],
  over: { awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null; mineUserId?: string | null } = {},
) {
  return scoreboardRows({
    entries,
    saturation: SATURATION,
    lightness: LIGHTNESS,
    awardRule: over.awardRule ?? 'ALL_QUALIFYING',
    mineUserId: over.mineUserId ?? null,
  })
}

describe('scoreboardRows', () => {
  it('ranks by how close the guess came, not by when it arrived', () => {
    const rows = rowsOf([
      entry({ userId: 'far', outcome: { deviationDeg: 90.7 } }),
      entry({ userId: 'near', outcome: { deviationDeg: 5 } }),
      entry({ userId: 'mid', outcome: { deviationDeg: 8.7 } }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['near', 'mid', 'far'])
  })

  it('breaks a tie by user id, so a reload shows the same picture', () => {
    const rows = rowsOf([
      entry({ userId: 'b', outcome: { deviationDeg: 5 } }),
      entry({ userId: 'a', outcome: { deviationDeg: 5 } }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b'])
  })

  it('paints the row in the player colour and the guess in the guess colour', () => {
    const [row] = rowsOf([
      entry({ userId: 'me', guess: { hue: 128.4 }, avatar: { bgColorHex: '#7d2ae8' } }),
    ])

    expect(row!.colorHex).toBe('#7d2ae8')
    // The round's saturation and lightness, never the guess's: a guess is only an angle.
    expect(row!.guessHex).toBe(hslToHex(128.4, SATURATION, LIGHTNESS))
  })

  it('picks ink that reads against each of the two backgrounds separately', () => {
    const [row] = rowsOf([
      entry({ userId: 'me', guess: { hue: 60 }, avatar: { bgColorHex: '#111111' } }),
    ])

    expect(row!.ink).toBe('#ffffff')
    expect(row!.guessInk).toBe('#111111')
  })

  it('takes the deviation from the server and never recomputes it', () => {
    // Deliberately inconsistent with the hue: what the round was judged on is what the table shows.
    const [row] = rowsOf([
      entry({ userId: 'me', guess: { hue: 0 }, outcome: { deviationDeg: 42.5 } }),
    ])

    expect(row!.deviationDeg).toBe(42.5)
  })

  it.each([
    ['a missing outcome', null],
    ['a non-object outcome', 7],
    ['a missing deviation', { withinTolerance: true }],
    ['a non-numeric deviation', { deviationDeg: 'weit' }],
    ['a non-finite deviation', { deviationDeg: NaN }],
  ])('drops a row it cannot rank: %s', (_label, outcome) => {
    const rows = rowsOf([entry({ userId: 'broken', outcome }), entry({ userId: 'fine' })])

    expect(rows.map((row) => row.userId)).toEqual(['fine'])
  })

  it('drops a row whose guess carries no usable angle', () => {
    const rows = rowsOf([
      entry({ userId: 'broken', guess: { hue: 'blau' } }),
      entry({ userId: 'fine' }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['fine'])
  })

  it('gives each row its rank as a tick, and holds mine back to the first foreign marker', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'far', outcome: { deviationDeg: 90 } }),
        entry({ userId: 'me', outcome: { deviationDeg: 40 } }),
        entry({ userId: 'near', outcome: { deviationDeg: 1 } }),
      ],
      { mineUserId: 'me' },
    )

    expect(rows.map((row) => [row.userId, row.tick])).toEqual([
      ['near', 0],
      ['me', 0],
      ['far', 2],
    ])
  })
})

describe('isProvisional', () => {
  it.each([
    [2, 'CLOSEST_ONLY' as const, true],
    // A zero cannot get better under closest-only: deviations freeze on guessing.
    [0, 'CLOSEST_ONLY' as const, false],
    [2, 'ALL_QUALIFYING' as const, false],
    [0, 'ALL_QUALIFYING' as const, false],
    [null, 'CLOSEST_ONLY' as const, false],
    [2, null, false],
  ])('is %s points under %s → %s', (points, awardRule, expected) => {
    expect(isProvisional(points, awardRule)).toBe(expected)
  })
})

describe('solutionCell', () => {
  it("is the target at the round's own saturation and lightness, with readable ink", () => {
    const cell = solutionCell(123.4, SATURATION, LIGHTNESS)

    expect(cell.hue).toBe(123.4)
    expect(cell.hex).toBe(hslToHex(123.4, SATURATION, LIGHTNESS))
    expect(cell.ink).toMatch(/^#(111111|ffffff)$/)
  })
})
