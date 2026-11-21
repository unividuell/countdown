import { describe, expect, it } from 'vitest'
import {
  asMatchScaleOutcome,
  asMatchScalePayload,
  asMatchScaleSolution,
  scaleOf,
} from '@/games/matchscale/types'

const SILHOUETTE = {
  name: 'Alpha',
  path: 'M0 0L10 10Z',
  width: 1000,
  height: 600,
  attribution: null,
}
const PAYLOAD = { categoryName: 'Flächen', a: SILHOUETTE, b: SILHOUETTE, tolerance: 0.1 }

describe('asMatchScalePayload', () => {
  it('accepts a valid payload, with or without a tolerance and attribution', () => {
    expect(asMatchScalePayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asMatchScalePayload({ ...PAYLOAD, tolerance: null })).toEqual({
      ...PAYLOAD,
      tolerance: null,
    })

    const credited = { ...SILHOUETTE, attribution: 'Someone, CC BY' }
    expect(asMatchScalePayload({ ...PAYLOAD, a: credited })?.a.attribution).toBe('Someone, CC BY')
  })

  it.each([
    ['not an object', 7],
    ['null', null],
    ['no tolerance key', { ...PAYLOAD, tolerance: undefined }],
    ['NaN tolerance', { ...PAYLOAD, tolerance: NaN }],
    ['string tolerance', { ...PAYLOAD, tolerance: '0.1' }],
    ['no category', { ...PAYLOAD, categoryName: undefined }],
    ['no path', { ...PAYLOAD, a: { ...SILHOUETTE, path: undefined } }],
    ['empty path', { ...PAYLOAD, a: { ...SILHOUETTE, path: '' } }],
    ['zero width', { ...PAYLOAD, a: { ...SILHOUETTE, width: 0 } }],
    ['negative height', { ...PAYLOAD, b: { ...SILHOUETTE, height: -1 } }],
    ['NaN width', { ...PAYLOAD, b: { ...SILHOUETTE, width: NaN } }],
    ['missing b', { ...PAYLOAD, b: undefined }],
    ['numeric attribution', { ...PAYLOAD, a: { ...SILHOUETTE, attribution: 3 } }],
  ])('drops junk: %s', (_label, value) => {
    expect(asMatchScalePayload(value)).toBeNull()
  })
})

const MEASURE = { axis: 'length', metres: 2.3, source: 'https://example.org/q' }

describe('asMatchScaleSolution', () => {
  it('accepts a factor with or without a tolerance and measures', () => {
    expect(asMatchScaleSolution({ factor: 2.5, tolerance: 0.1, a: MEASURE, b: null })).toEqual({
      factor: 2.5,
      tolerance: 0.1,
      a: MEASURE,
      b: null,
    })
    expect(asMatchScaleSolution({ factor: 2.5, tolerance: null })?.tolerance).toBeNull()
  })

  it('keeps a known kind and drops an unknown or null one, not the measure', () => {
    const kept = asMatchScaleSolution({
      factor: 2,
      tolerance: null,
      a: { ...MEASURE, kind: 'head-body' },
      b: { ...MEASURE, kind: 'wingspan' },
    })
    const nulled = asMatchScaleSolution({
      factor: 2,
      tolerance: null,
      a: { ...MEASURE, kind: null },
      b: null,
    })

    expect(kept?.a?.kind).toBe('head-body')
    expect(kept?.b).toEqual(MEASURE)
    expect(kept?.b?.kind).toBeUndefined()
    expect(nulled?.a).toEqual(MEASURE)
  })

  it('keeps a subject, drops a blank or junk one, not the measure', () => {
    const solution = asMatchScaleSolution({
      factor: 2,
      tolerance: null,
      a: { ...MEASURE, kind: 'diameter', subject: 'Alpha Mk II' },
      b: { ...MEASURE, subject: 3 },
    })

    expect(solution?.a).toEqual({ ...MEASURE, kind: 'diameter', subject: 'Alpha Mk II' })
    expect(solution?.b).toEqual(MEASURE)
  })

  it.each([
    ['missing', undefined],
    ['not an object', 'x'],
    ['unknown axis', { ...MEASURE, axis: 'width' }],
    ['zero metres', { ...MEASURE, metres: 0 }],
    ['NaN metres', { ...MEASURE, metres: NaN }],
    ['numeric source', { ...MEASURE, source: 3 }],
  ])('narrows a junk measure to null, keeps the round: %s', (_label, measure) => {
    const solution = asMatchScaleSolution({
      factor: 2,
      tolerance: null,
      a: measure,
      b: MEASURE,
    })

    expect(solution?.a).toBeNull()
    expect(solution?.b).toEqual(MEASURE)
  })

  it.each([
    ['null', null],
    ['no tolerance key', { factor: 2 }],
    ['zero factor', { factor: 0, tolerance: null }],
    ['NaN factor', { factor: NaN, tolerance: null }],
    ['string factor', { factor: '2', tolerance: null }],
  ])('drops junk: %s', (_label, value) => {
    expect(asMatchScaleSolution(value)).toBeNull()
  })
})

describe('asMatchScaleOutcome', () => {
  it('accepts a judged outcome, gated or not', () => {
    expect(asMatchScaleOutcome({ scale: 2, deviation: 0.1, withinTolerance: true })).toEqual({
      scale: 2,
      deviation: 0.1,
      withinTolerance: true,
    })
    expect(
      asMatchScaleOutcome({ scale: 2, deviation: 0.1, withinTolerance: null })?.withinTolerance,
    ).toBeNull()
  })

  it.each([
    ['null', null],
    ['zero scale', { scale: 0, deviation: 0, withinTolerance: null }],
    ['string scale', { scale: '2', deviation: 0, withinTolerance: null }],
    ['NaN deviation', { scale: 2, deviation: NaN, withinTolerance: null }],
    ['no gate key', { scale: 2, deviation: 0 }],
  ])('drops junk: %s', (_label, value) => {
    expect(asMatchScaleOutcome(value)).toBeNull()
  })
})

describe('scaleOf', () => {
  it('reads a positive finite scale', () => {
    expect(scaleOf({ scale: 1.5 })).toBe(1.5)
  })

  it.each([null, 3, {}, { scale: 0 }, { scale: -1 }, { scale: NaN }, { scale: '2' }])(
    'gives null for %j',
    (guess) => {
      expect(scaleOf(guess)).toBeNull()
    },
  )
})
