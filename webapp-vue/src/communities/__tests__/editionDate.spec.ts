import { describe, expect, it } from 'vitest'
import { targetDay, yearSuffix } from '@/communities/editionDate'

describe('edition date', () => {
  it('writes the year as two digits after an apostrophe', () => {
    expect(yearSuffix('2027-06-24T09:00:00Z', 'Europe/Berlin')).toBe(" '27")
  })

  // 23:30 UTC on New Year's Eve is already the next year in Berlin.
  it('takes year and day in the target zone, not in UTC', () => {
    expect(yearSuffix('2026-12-31T23:30:00Z', 'Europe/Berlin')).toBe(" '27")
    expect(targetDay('2026-12-31T23:30:00Z', 'Europe/Berlin')).toBe('2027-01-01')
  })
})
