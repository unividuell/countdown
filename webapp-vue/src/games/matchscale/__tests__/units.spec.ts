import { describe, expect, it } from 'vitest'
import type { Measure } from '../types'
import { formatLength, formatSigned, inUnit, roundUnit } from '../units'

function m(metres: number): Measure {
  return { axis: 'length', metres, source: 'x' }
}

describe('roundUnit', () => {
  it.each([
    ['mouse vs. rat', 0.12, 0.24, 'cm'],
    ['a mouse under ten centimetres stays in cm', 0.08, 0.22, 'cm'],
    ['exactly one centimetre', 0.01, 0.05, 'cm'],
    ['elephant vs. giraffe', 3.2, 5.5, 'cm'],
    ['two countries', 12_000, 850_000, 'km'],
    ['two buildings', 15, 300, 'm'],
    ['sub-centimetre', 0.004, 0.03, 'mm'],
    ['smaller than 10 mm', 0.004, 0.006, 'mm'],
    ['exactly ten', 0.1, 1, 'cm'],
  ] as const)('%s → %s', (_, a, b, unit) => {
    expect(roundUnit(m(a), m(b))).toBe(unit)
    expect(roundUnit(m(b), m(a))).toBe(unit)
  })

  it('takes what measures there are, none gives no unit', () => {
    expect(roundUnit(null, m(2))).toBe('cm')
    expect(roundUnit(null, null)).toBeNull()
  })
})

describe('inUnit', () => {
  it('rounds to a whole number in the unit', () => {
    expect(inUnit(2.004, 'cm')).toBe(200)
    expect(inUnit(0.0036, 'mm')).toBe(4)
    expect(inUnit(12_345, 'km')).toBe(12)
  })
})

describe('formatLength', () => {
  it('writes whole numbers, groups from five digits, U+2212 for minus', () => {
    expect(formatLength(200)).toBe('200')
    expect(formatLength(2500)).toBe('2500')
    expect(formatLength(12_500)).toBe('12.500')
    expect(formatLength(-40)).toBe('−40')
    expect(formatLength(-0)).toBe('0')
  })
})

describe('formatSigned', () => {
  it('always signs, ± for an exact hit', () => {
    expect(formatSigned(50)).toBe('+50')
    expect(formatSigned(-40)).toBe('−40')
    expect(formatSigned(0)).toBe('±0')
    expect(formatSigned(-0)).toBe('±0')
  })
})
