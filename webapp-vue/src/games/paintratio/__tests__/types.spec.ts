import { describe, expect, it } from 'vitest'
import {
  asPaintRatioOutcome,
  asPaintRatioPayload,
  asPaintRatioSolution,
  COORDINATE_LIMIT,
  MAX_PATH,
  MAX_POINTS,
  MAX_STROKES,
  normalizeColor,
  strokesOf,
} from '@/games/paintratio/types'

const PAYLOAD = { width: 1200, height: 900, brushes: [40, 80, 160], tolerance: 0.05 }

describe('asPaintRatioPayload', () => {
  it('narrows a payload and keeps a null tolerance', () => {
    expect(asPaintRatioPayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asPaintRatioPayload({ ...PAYLOAD, tolerance: null })).toEqual({
      ...PAYLOAD,
      tolerance: null,
    })
  })

  it.each([
    ['null', null],
    ['a number', 7],
    ['another game’s payload', { stageDurationsSeconds: [1, 2] }],
    ['a zero width', { ...PAYLOAD, width: 0 }],
    ['a fractional height', { ...PAYLOAD, height: 900.5 }],
    ['no brushes', { ...PAYLOAD, brushes: [] }],
    ['brushes that are no list', { ...PAYLOAD, brushes: 40 }],
    ['a brush that is no number', { ...PAYLOAD, brushes: [40, '80'] }],
    ['a brush without diameter', { ...PAYLOAD, brushes: [40, 0] }],
    ['a NaN tolerance', { ...PAYLOAD, tolerance: NaN }],
    ['a missing tolerance', { ...PAYLOAD, tolerance: undefined }],
    ['a missing brushes field', { width: 1200, height: 900, tolerance: null }],
  ])('turns %s into null', (_label, payload) => {
    expect(asPaintRatioPayload(payload)).toBeNull()
  })
})

describe('asPaintRatioSolution', () => {
  it('narrows a solution and keeps a null tolerance', () => {
    expect(asPaintRatioSolution({ targetRatio: 0.31, tolerance: 0.05 })).toEqual({
      targetRatio: 0.31,
      tolerance: 0.05,
    })
    expect(asPaintRatioSolution({ targetRatio: 0.31, tolerance: null })).toEqual({
      targetRatio: 0.31,
      tolerance: null,
    })
  })

  it.each([
    ['null', null],
    ['a NaN ratio', { targetRatio: NaN, tolerance: 0.05 }],
    ['a string ratio', { targetRatio: '0.31', tolerance: 0.05 }],
    ['a missing ratio', { tolerance: 0.05 }],
    ['a missing tolerance', { targetRatio: 0.31 }],
    ['an infinite tolerance', { targetRatio: 0.31, tolerance: Infinity }],
  ])('turns %s into null', (_label, solution) => {
    expect(asPaintRatioSolution(solution)).toBeNull()
  })
})

describe('asPaintRatioOutcome', () => {
  it('narrows an outcome and keeps a null verdict', () => {
    expect(asPaintRatioOutcome({ ratio: 0.3, difference: 0.01, withinTolerance: true })).toEqual({
      ratio: 0.3,
      difference: 0.01,
      withinTolerance: true,
    })
    expect(asPaintRatioOutcome({ ratio: 0.3, difference: 0.01, withinTolerance: null })).toEqual({
      ratio: 0.3,
      difference: 0.01,
      withinTolerance: null,
    })
  })

  it.each([
    ['null', null],
    ['a NaN ratio', { ratio: NaN, difference: 0.01, withinTolerance: true }],
    ['a NaN difference', { ratio: 0.3, difference: NaN, withinTolerance: true }],
    ['a missing difference', { ratio: 0.3, withinTolerance: true }],
    ['a missing verdict', { ratio: 0.3, difference: 0.01 }],
    ['a verdict that is no boolean', { ratio: 0.3, difference: 0.01, withinTolerance: 'yes' }],
  ])('turns %s into null', (_label, outcome) => {
    expect(asPaintRatioOutcome(outcome)).toBeNull()
  })
})

const STROKE = { brush: 1, color: '#3049e8', points: [1, 2, 3, 4] }

describe('strokesOf', () => {
  it('reads strokes and rejects any stroke that is off', () => {
    expect(strokesOf({ strokes: [STROKE] }, 3)).toEqual([STROKE])
  })

  it('accepts no strokes at all', () => {
    expect(strokesOf({ strokes: [] }, 3)).toEqual([])
  })

  it('accepts a dot and both ends of the coordinate range', () => {
    const edges = [-COORDINATE_LIMIT, COORDINATE_LIMIT, COORDINATE_LIMIT, -COORDINATE_LIMIT]

    expect(strokesOf({ strokes: [{ ...STROKE, points: [5, 6] }] }, 3)).toEqual([
      { ...STROKE, points: [5, 6] },
    ])
    expect(strokesOf({ strokes: [{ ...STROKE, points: edges }] }, 3)).toEqual([
      { ...STROKE, points: edges },
    ])
  })

  it.each([
    ['null', null],
    ['a list', [STROKE]],
    ['a missing strokes field', {}],
    ['an extra top-level field', { strokes: [STROKE], note: 'x' }],
    ['strokes that are no list', { strokes: STROKE }],
    ['a stroke that is no object', { strokes: [7] }],
    ['a stroke that is a list', { strokes: [[1, 2]] }],
    ['a stroke without a brush', { strokes: [{ color: STROKE.color, points: STROKE.points }] }],
    ['a stroke without a colour', { strokes: [{ brush: 1, points: STROKE.points }] }],
    ['a stroke without points', { strokes: [{ brush: 1, color: STROKE.color }] }],
    ['an extra stroke field', { strokes: [{ ...STROKE, width: 4 }] }],
    ['a brush past the last one', { strokes: [{ ...STROKE, brush: 3 }] }],
    ['a negative brush', { strokes: [{ ...STROKE, brush: -1 }] }],
    ['a fractional brush', { strokes: [{ ...STROKE, brush: 1.5 }] }],
    ['an upper-case colour', { strokes: [{ ...STROKE, color: '#3049E8' }] }],
    ['a colour name', { strokes: [{ ...STROKE, color: 'red' }] }],
    ['a colour that is no string', { strokes: [{ ...STROKE, color: 0x3049e8 }] }],
    ['an odd number of points', { strokes: [{ ...STROKE, points: [1, 2, 3] }] }],
    ['no points', { strokes: [{ ...STROKE, points: [] }] }],
    ['points that are no list', { strokes: [{ ...STROKE, points: '1,2' }] }],
    ['a fractional coordinate', { strokes: [{ ...STROKE, points: [1, 2, 1.5, 4] }] }],
    ['a NaN coordinate', { strokes: [{ ...STROKE, points: [1, 2, NaN, 4] }] }],
    ['a string coordinate', { strokes: [{ ...STROKE, points: [1, 2, '3', 4] }] }],
    ['a coordinate past the limit', { strokes: [{ ...STROKE, points: [1, 2, 10_001, 4] }] }],
    ['a coordinate below the limit', { strokes: [{ ...STROKE, points: [1, 2, 3, -10_001] }] }],
  ])('turns %s into null', (_label, guess) => {
    expect(strokesOf(guess, 3)).toBeNull()
  })

  it('stops at the stroke limit', () => {
    const dot = { ...STROKE, points: [0, 0] }

    expect(strokesOf({ strokes: Array(MAX_STROKES).fill(dot) }, 3)).toHaveLength(MAX_STROKES)
    expect(strokesOf({ strokes: Array(MAX_STROKES + 1).fill(dot) }, 3)).toBeNull()
  })

  it('stops at the point limit over all strokes', () => {
    const run = (points: number) => ({ ...STROKE, points: Array(2 * points).fill(0) })

    expect(strokesOf({ strokes: [run(MAX_POINTS / 2), run(MAX_POINTS / 2)] }, 3)).toHaveLength(2)
    expect(strokesOf({ strokes: [run(MAX_POINTS / 2), run(MAX_POINTS / 2 + 1)] }, 3)).toBeNull()
    expect(strokesOf({ strokes: [run(MAX_POINTS + 1)] }, 3)).toBeNull()
  })

  it('stops at the path limit like the server', () => {
    // Corner to corner is 4 × COORDINATE_LIMIT units a hop.
    const hop = 4 * COORDINATE_LIMIT
    const zigzag = (hops: number) => ({
      ...STROKE,
      points: Array.from({ length: hops + 1 }, (_, i) =>
        i % 2 === 0 ? [-COORDINATE_LIMIT, -COORDINATE_LIMIT] : [COORDINATE_LIMIT, COORDINATE_LIMIT],
      ).flat(),
    })
    const atLimit = MAX_PATH / hop

    expect(strokesOf({ strokes: [zigzag(atLimit)] }, 3)).toHaveLength(1)
    expect(strokesOf({ strokes: [zigzag(atLimit + 1)] }, 3)).toBeNull()
    // 37 + 38 hops is the limit again, one more tips it — across two strokes
    expect(strokesOf({ strokes: [zigzag(37), zigzag(38)] }, 3)).toHaveLength(2)
    expect(strokesOf({ strokes: [zigzag(37), zigzag(39)] }, 3)).toBeNull()
  })

  it('hands back copies, not the raw objects', () => {
    const raw = { strokes: [{ ...STROKE, points: [1, 2, 3, 4] }] }
    const strokes = strokesOf(raw, 3)

    expect(strokes?.[0]).not.toBe(raw.strokes[0])
    expect(strokes?.[0]?.points).not.toBe(raw.strokes[0]?.points)
  })
})

describe('normalizeColor', () => {
  it('lowers a colour and refuses anything not #rrggbb', () => {
    expect(normalizeColor('#3049E8')).toBe('#3049e8')
    expect(normalizeColor('#3049e8')).toBe('#3049e8')
    expect(normalizeColor('red')).toBeNull()
    expect(normalizeColor('#12345')).toBeNull()
    expect(normalizeColor('#1234567')).toBeNull()
    expect(normalizeColor('#12345g')).toBeNull()
    expect(normalizeColor('3049e8')).toBeNull()
    expect(normalizeColor('#3049e8\n')).toBeNull()
  })
})
