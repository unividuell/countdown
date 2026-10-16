import { describe, expect, it } from 'vitest'
import { SPIN_MS, spunYaw } from '@/games/copyblocks/view'

describe('spunYaw', () => {
  it('starts and ends where it began, half way round at half time', () => {
    expect(spunYaw(0.6, 0)).toBe(0.6)
    expect(spunYaw(0.6, SPIN_MS / 2)).toBeCloseTo(0.6 + Math.PI)
    expect(spunYaw(0.6, SPIN_MS)).toBe(0.6)
    expect(spunYaw(0.6, 2 * SPIN_MS)).toBe(0.6)
  })

  it('only ever turns one way', () => {
    let last = -Infinity
    for (let ms = 0; ms < SPIN_MS; ms += 50) {
      const yaw = spunYaw(0, ms)
      expect(yaw).toBeGreaterThanOrEqual(last)
      last = yaw
    }
  })
})
