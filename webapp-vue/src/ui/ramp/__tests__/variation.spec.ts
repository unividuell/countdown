import { describe, expect, it } from 'vitest'
import { posterOf } from '@/ui/ramp/variation'

describe('posterOf', () => {
  it.each([
    [-101, 'band', 0],
    [-100, 'band', -9],
    [-99, 'band', -9],
    [-98, 'raster', 0],
    [-12, 'raster', 9],
    [-1, 'raster', 9],
    [0, 'raster', -9],
    [1, 'raster', 0],
    [17, 'band', 0],
  ])('round %i', (n, style, tilt) => {
    expect(posterOf(n)).toEqual({ style, tilt })
  })

  it('gives both styles about as often', () => {
    const rasters = Array.from({ length: 2000 }, (_, i) => posterOf(i - 1000)).filter(
      (p) => p.style === 'raster',
    ).length

    expect(rasters).toBeGreaterThan(900)
    expect(rasters).toBeLessThan(1100)
  })
})
