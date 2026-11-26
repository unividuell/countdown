import { describe, expect, it } from 'vitest'
import { HUE_STEP, barFill, barHue } from '@/games/stackfloor/colors'

describe('colors', () => {
  it('steps round the colour wheel', () => {
    expect(HUE_STEP).toBe(12)
    expect(barHue(350, 0)).toBe(350)
    expect(barHue(350, 2)).toBe(14)
  })

  it('is lighter by day than by night', () => {
    expect(barFill(14, false)).toBe('oklch(70% 0.13 14)')
    expect(barFill(14, true)).toBe('oklch(62% 0.13 14)')
  })
})
