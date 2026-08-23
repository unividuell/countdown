import { describe, expect, it } from 'vitest'
import { labRoundEnd, labRoundNumber } from '@/gamelab/header'
import { SEED_MAX, SEED_MIN } from '@/gamelab/seed'

const NOW = Date.parse('2026-08-23T12:00:00Z')
const HOUR = 3_600_000

const SEEDS = [SEED_MIN, -7, 0, 1, 42, 140, 141, 999, 123_456_789, SEED_MAX]

describe('labRoundNumber', () => {
  // The lab repairs the seed into the URL so a reload replays the same round. A number that rolled
  // afresh on every mount would be the one thing on the page that broke that promise.
  it('follows the seed, so a reload shows the same round', () => {
    expect(labRoundNumber(42)).toBe(labRoundNumber(42))
  })

  it('stays inside the grid a real countdown has, for every seed the URL accepts', () => {
    for (const seed of SEEDS) {
      const number = labRoundNumber(seed)
      expect(number).toBeGreaterThanOrEqual(0)
      expect(number).toBeLessThanOrEqual(140)
      expect(Number.isInteger(number)).toBe(true)
    }
  })

  it('separates neighbouring seeds, so rolling visibly changes the round', () => {
    const numbers = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(labRoundNumber))

    expect(numbers.size).toBeGreaterThan(5)
  })
})

describe('labRoundEnd', () => {
  it('lands between one hour and a full day out, like a round a tester would walk into', () => {
    for (const seed of SEEDS) {
      const left = Date.parse(labRoundEnd(seed, NOW)) - NOW
      expect(left).toBeGreaterThanOrEqual(HOUR)
      expect(left).toBeLessThanOrEqual(24 * HOUR)
    }
  })

  it('takes its distance from the seed, so only the ticking moves between reloads', () => {
    expect(labRoundEnd(42, NOW)).toBe(labRoundEnd(42, NOW))
    expect(Date.parse(labRoundEnd(42, NOW + HOUR)) - Date.parse(labRoundEnd(42, NOW))).toBe(HOUR)
  })

  it('separates neighbouring seeds here too', () => {
    const ends = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((s) => labRoundEnd(s, NOW)))

    expect(ends.size).toBeGreaterThan(5)
  })
})
