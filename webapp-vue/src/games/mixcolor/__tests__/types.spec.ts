import { describe, expect, it } from 'vitest'
import {
  asMixColorOutcome,
  asMixColorPayload,
  asMixColorSolution,
  dropsOf,
  glassOf,
} from '@/games/mixcolor/types'

const PAYLOAD = {
  targetHex: '#00A0E9',
  capacity: 12,
  pigments: [
    { key: 'c', name: 'Cyan', hex: '#00AEEF' },
    { key: 'm', name: 'Magenta', hex: '#EC008C' },
  ],
}

describe('asMixColorPayload', () => {
  it('round-trips a valid payload', () => {
    expect(asMixColorPayload(PAYLOAD)).toEqual(PAYLOAD)
  })

  it('rejects junk', () => {
    expect(asMixColorPayload(null)).toBeNull()
    expect(asMixColorPayload({ ...PAYLOAD, targetHex: 'red' })).toBeNull()
    expect(asMixColorPayload({ ...PAYLOAD, capacity: 0 })).toBeNull()
    expect(asMixColorPayload({ ...PAYLOAD, capacity: 1.5 })).toBeNull()
    expect(asMixColorPayload({ ...PAYLOAD, pigments: undefined })).toBeNull()
    expect(asMixColorPayload({ ...PAYLOAD, pigments: [{ key: 'c', name: 'Cyan' }] })).toBeNull()
  })
})

describe('asMixColorSolution', () => {
  it('accepts a recipe with or without a tolerance', () => {
    expect(asMixColorSolution({ recipe: { c: 3, m: 0 }, tolerance: 4 })).toEqual({
      recipe: { c: 3, m: 0 },
      tolerance: 4,
    })
    expect(asMixColorSolution({ recipe: { c: 3 }, tolerance: null })?.tolerance).toBeNull()
  })

  it('rejects negative or fractional drops', () => {
    expect(asMixColorSolution({ recipe: { c: -1 }, tolerance: null })).toBeNull()
    expect(asMixColorSolution({ recipe: { c: 1.5 }, tolerance: null })).toBeNull()
    expect(asMixColorSolution({ recipe: null, tolerance: null })).toBeNull()
  })
})

describe('asMixColorOutcome', () => {
  const outcome = { hex: '#00A0E9', recipe: { c: 2 }, deviation: 3.2, withinTolerance: true }

  it('accepts a valid outcome', () => {
    expect(asMixColorOutcome(outcome)).toEqual(outcome)
    expect(asMixColorOutcome({ ...outcome, withinTolerance: null })).not.toBeNull()
  })

  it('rejects junk', () => {
    expect(asMixColorOutcome({ ...outcome, deviation: NaN })).toBeNull()
    expect(asMixColorOutcome({ ...outcome, hex: 'x' })).toBeNull()
    expect(asMixColorOutcome({ ...outcome, withinTolerance: 'yes' })).toBeNull()
  })
})

describe('glassOf', () => {
  it('keeps the hex', () => {
    expect(glassOf({ hex: '#00a0e9' })).toBe('#00a0e9')
  })

  it('is null for junk', () => {
    expect(glassOf({ hex: 'nope' })).toBeNull()
    expect(glassOf(null)).toBeNull()
  })
})

describe('dropsOf', () => {
  it('reads a non-negative integer', () => {
    expect(dropsOf({ drops: 7 })).toBe(7)
    expect(dropsOf({ drops: 1.5 })).toBeNull()
    expect(dropsOf(null)).toBeNull()
  })
})
