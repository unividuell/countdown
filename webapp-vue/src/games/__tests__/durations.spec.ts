import { describe, expect, it } from 'vitest'
import { durationOrder, formatDuration, hasDurations } from '@/games/durations'

describe('formatDuration', () => {
  it('is mm:ss, and minutes are not capped at 59', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(9_400)).toBe('00:09')
    expect(formatDuration(61_000)).toBe('01:01')
    expect(formatDuration(3_600_000)).toBe('60:00')
  })

  it('is null where the round did not score on time', () => {
    expect(formatDuration(null)).toBeNull()
  })
})

describe('durationOrder', () => {
  it('puts the faster first and a missing clock last', () => {
    expect(durationOrder(1_000, 2_000)).toBeLessThan(0)
    expect(durationOrder(null, 2_000)).toBeGreaterThan(0)
    expect(durationOrder(2_000, null)).toBeLessThan(0)
    expect(durationOrder(null, null)).toBe(0)
  })
})

describe('hasDurations', () => {
  it('is whether any row carries a clock', () => {
    expect(hasDurations([{ durationLabel: null }, { durationLabel: '00:09' }])).toBe(true)
    expect(hasDurations([{ durationLabel: null }])).toBe(false)
    expect(hasDurations([])).toBe(false)
  })
})
