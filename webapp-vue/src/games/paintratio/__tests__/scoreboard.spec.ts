import { describe, expect, it } from 'vitest'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import type { GameEntry } from '@/games/GameEntry'
import { formatDifference, formatPercent, scoreRows } from '@/games/paintratio/scoreboard'
import type { PaintRatioOutcome, Stroke } from '@/games/paintratio/types'

const PAINTING: Stroke[] = [{ brush: 0, color: '#ff0000', points: [10, 10, 20, 20] }]

function outcome(difference: number, ratio = 0.4): PaintRatioOutcome {
  return { ratio, difference, withinTolerance: true }
}

/** A judged entry with a painting of its own. */
function entry(over: Partial<GameEntry>): GameEntry {
  return gameEntry({ guess: { strokes: PAINTING }, outcome: outcome(0), points: 1, ...over })
}

function rowsOf(
  entries: GameEntry[],
  over: { awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null; mineUserId?: string | null } = {},
) {
  return scoreRows({
    entries,
    awardRule: over.awardRule ?? 'ALL_QUALIFYING',
    mineUserId: over.mineUserId ?? null,
    brushCount: 3,
  })
}

describe('formatPercent / formatDifference', () => {
  it('formats German percent with one decimal', () => {
    expect(formatPercent(0.4234)).toBe('42,3 %')
    expect(formatPercent(0.05)).toBe('5,0 %')
    expect(formatDifference(0.012)).toBe('+1,2 %')
    expect(formatDifference(0)).toBe('0,0 %')
  })

  it('signs a shortfall the way Intl does for German', () => {
    const intl = new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    })

    expect(formatDifference(-0.008)).toBe(intl.format(-0.008))
    expect(formatDifference(-0.008)).toContain('0,8')
  })

  it('signs nothing that rounds to zero', () => {
    expect(formatDifference(-0.0004)).toBe('0,0 %')
    expect(formatDifference(0.0004)).toBe('0,0 %')
  })
})

describe('scoreRows', () => {
  it('ranks by the size of the difference, unreadable rows last, then by user id', () => {
    const rows = rowsOf([
      entry({ userId: 'e', outcome: { ratio: 'x' } }),
      entry({ userId: 'd', outcome: outcome(0.01) }),
      entry({ userId: 'a', outcome: outcome(-0.03) }),
      entry({ userId: 'c', outcome: null, guess: null }),
      entry({ userId: 'b', outcome: outcome(0.01) }),
      entry({ userId: 'f', outcome: outcome(-0.002) }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['f', 'b', 'd', 'a', 'c', 'e'])
  })

  it('labels the share and the signed difference', () => {
    const [row] = rowsOf([entry({ outcome: outcome(-0.008, 0.4234) })])

    expect(row!.ratioLabel).toBe(formatPercent(0.4234))
    expect(row!.differenceLabel).toBe(formatDifference(-0.008))
    expect(row!.strokes).toEqual(PAINTING)
  })

  it('carries the head every game shares', () => {
    const [row] = rowsOf(
      [entry({ userId: 'me', username: 'Mia', points: 7, avatar: { bgColorHex: '#7d2ae8' } })],
      { awardRule: 'CLOSEST_ONLY' },
    )

    expect(row).toMatchObject({
      userId: 'me',
      name: 'Mia',
      colorHex: '#7d2ae8',
      points: 7,
      provisional: true,
    })
  })

  it('keeps a row whose strokes or outcome are unreadable, without strokes', () => {
    const rows = rowsOf([
      entry({ userId: 'ok' }),
      entry({ userId: 'bad-strokes', outcome: outcome(0.02), guess: { strokes: [{ brush: 9 }] } }),
      entry({ userId: 'bad-outcome', outcome: { ratio: NaN, difference: 0 } }),
    ])

    const byId = Object.fromEntries(rows.map((row) => [row.userId, row]))
    expect(rows).toHaveLength(3)
    expect(byId['ok']!.strokes).toEqual(PAINTING)
    expect(byId['bad-strokes']!.strokes).toBeNull()
    expect(byId['bad-strokes']!.differenceLabel).toBe(formatDifference(0.02))
    expect(byId['bad-outcome']).toMatchObject({
      strokes: null,
      ratioLabel: null,
      differenceLabel: null,
    })
  })

  it('draws a brush beyond the payload as unreadable, not as a stroke', () => {
    const [row] = scoreRows({
      entries: [entry({ guess: { strokes: [{ brush: 2, color: '#ff0000', points: [1, 1] }] } })],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
      brushCount: 2,
    })

    expect(row!.strokes).toBeNull()
  })

  it('gives up rows no strokes', () => {
    const [row] = rowsOf([entry({ guess: null, outcome: null, points: 0 })])

    expect(row).toMatchObject({ strokes: null, ratioLabel: null, differenceLabel: null, points: 0 })
  })

  it('gives a row that never painted no strokes, whatever else it says', () => {
    const [row] = rowsOf([entry({ guess: null, outcome: outcome(0.01) })])

    expect(row!.strokes).toBeNull()
    expect(row!.differenceLabel).toBe(formatDifference(0.01))
  })

  it('stamps the reveal tick, my own row waiting for the first rival', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'me', outcome: outcome(0.001) }),
        entry({ userId: 'b', outcome: outcome(0.02) }),
        entry({ userId: 'c', outcome: outcome(0.03) }),
      ],
      { mineUserId: 'me' },
    )

    expect(rows.map((row) => [row.userId, row.tick])).toEqual([
      ['me', 1],
      ['b', 1],
      ['c', 2],
    ])
  })
})
