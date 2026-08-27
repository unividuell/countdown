import { describe, expect, it } from 'vitest'
import { isProvisional } from '@/games/awards'

describe('isProvisional', () => {
  it.each([
    [2, 'CLOSEST_ONLY' as const, true],
    // A zero cannot get better under closest-only: deviations freeze on guessing.
    [0, 'CLOSEST_ONLY' as const, false],
    [2, 'ALL_QUALIFYING' as const, false],
    [0, 'ALL_QUALIFYING' as const, false],
    [null, 'CLOSEST_ONLY' as const, false],
    [2, null, false],
  ])('is %s points under %s → %s', (points, awardRule, expected) => {
    expect(isProvisional(points, awardRule)).toBe(expected)
  })
})
