import { describe, expect, it } from 'vitest'
import { initialSeed, parseSeed, rollSeed, SEED_MAX, SEED_MIN } from '@/gamelab/seed'

function utf16CodeUnitHash(value: string): number {
  let hash = 0x811c9dc5 | 0
  for (const codeUnit of value) {
    hash ^= codeUnit.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash
}

describe('initialSeed', () => {
  it.each([
    ['sample', -1_763_474_777],
    ['guess-hue', -1_512_093_407],
    ['hütte', -965_460_697],
  ])('derives the pinned signed FNV-1a seed for %s', (gameId, expectedSeed) => {
    expect(initialSeed(gameId)).toBe(expectedSeed)
  })

  it('hashes UTF-8 bytes rather than UTF-16 code units', () => {
    expect(initialSeed('hütte')).not.toBe(utf16CodeUnitHash('hütte'))
  })
})

describe('parseSeed', () => {
  it('accepts a plain integer string', () => {
    expect(parseSeed('42')).toBe(42)
  })

  it('accepts a negative integer', () => {
    expect(parseSeed('-7')).toBe(-7)
  })

  it('accepts the int32 bounds', () => {
    expect(parseSeed(String(SEED_MIN))).toBe(SEED_MIN)
    expect(parseSeed(String(SEED_MAX))).toBe(SEED_MAX)
  })

  it('rejects a value outside int32', () => {
    // The backend takes a Kotlin Int; anything wider silently truncates there.
    expect(parseSeed(String(SEED_MAX + 1))).toBeNull()
    expect(parseSeed(String(SEED_MIN - 1))).toBeNull()
  })

  it('rejects non-integers, junk, and emptiness', () => {
    expect(parseSeed('4.2')).toBeNull()
    expect(parseSeed('abc')).toBeNull()
    expect(parseSeed('')).toBeNull()
    expect(parseSeed(' ')).toBeNull()
    expect(parseSeed(undefined)).toBeNull()
    expect(parseSeed(null)).toBeNull()
  })

  it('rejects an array, which is what a repeated query param looks like', () => {
    expect(parseSeed(['1', '2'])).toBeNull()
  })
})

describe('rollSeed', () => {
  it('always produces a parseable seed', () => {
    for (let i = 0; i < 500; i++) {
      const seed = rollSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(parseSeed(String(seed))).toBe(seed)
    }
  })

  it('does not return the same value every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => rollSeed()))
    expect(seen.size).toBeGreaterThan(1)
  })
})
