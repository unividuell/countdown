import { describe, expect, it } from 'vitest'
import { posterOf } from '@/ui/ramp/variation'

describe('posterOf', () => {
  it.each([
    [-101, 'sheet', 0, 'fraunces-digits'],
    [-100, 'band', -9, 'system'],
    [-99, 'sheet', -9, 'system'],
    [-98, 'band', 0, 'fraunces-digits'],
    [-1, 'sheet', 9, 'system'],
    [0, 'band', -9, 'system'],
    [1, 'sheet', 0, 'fraunces-digits'],
    [17, 'sheet', 0, 'system'],
  ])('round %i', (n, style, tilt, face) => {
    expect(posterOf(n)).toEqual({ style, tilt, face })
  })

  it('never repeats a style on the next round', () => {
    let repeat: number | null = null
    for (let n = -400; n < 50; n++) if (posterOf(n).style === posterOf(n + 1).style) repeat ??= n
    expect(repeat).toBeNull()
  })
})
