import { describe, expect, it } from 'vitest'
import { posterOf } from '@/ui/ramp/variation'

describe('posterOf', () => {
  it.each([
    [-101, 0],
    [-100, -9],
    [-99, -9],
    [-98, 0],
    [-1, 9],
    [0, -9],
    [1, 0],
    [17, 0],
  ])('round %i', (n, tilt) => {
    expect(posterOf(n)).toEqual({ tilt })
  })
})
