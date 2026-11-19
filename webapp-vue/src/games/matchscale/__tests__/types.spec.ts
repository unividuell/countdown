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
const PAYLOAD = { categoryName: 'Flächen', a: SILHOUETTE, b: SILHOUETTE, toleranceFactor: 1.1 }

describe('asMatchScalePayload', () => {
  it('accepts a valid payload, with or without a tolerance and attribution', () => {
    expect(asMatchScalePayload(PAYLOAD)).toEqual(PAYLOAD)
    expect(asMatchScalePayload({ ...PAYLOAD, toleranceFactor: null })).toEqual({
      ...PAYLOAD,
      toleranceFactor: null,
    })

    const credited = { ...SILHOUETTE, attribution: 'Someone, CC BY' }
    expect(asMatchScalePayload({ ...PAYLOAD, a: credited })?.a.attribution).toBe('Someone, CC BY')
  })

  it.each([
    ['not an object', 7],
    ['null', null],
    ['no tolerance key', { ...PAYLOAD, toleranceFactor: undefined }],
    ['NaN tolerance', { ...PAYLOAD, toleranceFactor: NaN }],
    ['string tolerance', { ...PAYLOAD, toleranceFactor: '1.1' }],
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

describe('asMatchScaleSolution', () => {
  it('accepts a factor with or without a tolerance', () => {
    expect(asMatchScaleSolution({ factor: 2.5, toleranceFactor: 1.1 })).toEqual({
      factor: 2.5,
      toleranceFactor: 1.1,
    })
    expect(asMatchScaleSolution({ factor: 2.5, toleranceFactor: null })?.toleranceFactor).toBeNull()
  })

  it.each([
    ['null', null],
    ['no tolerance key', { factor: 2 }],
    ['zero factor', { factor: 0, toleranceFactor: null }],
    ['NaN factor', { factor: NaN, toleranceFactor: null }],
    ['string factor', { factor: '2', toleranceFactor: null }],
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
