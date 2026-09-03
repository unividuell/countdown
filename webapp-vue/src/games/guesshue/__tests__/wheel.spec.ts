import { describe, expect, it } from 'vitest'
import { KNOB_TRACK_FRACTION, easeOutCubic, trackBoxStyle } from '@/games/guesshue/wheel'

describe('trackBoxStyle', () => {
  it('puts the box centre on the track, not its top edge', () => {
    // 50 × (1 − 0.89) is where the centre goes; half the box's own 9% comes off again because
    // `top` addresses the upper edge.
    expect(trackBoxStyle(KNOB_TRACK_FRACTION)).toEqual({ top: '1%', width: '9%', height: '9%' })
  })

  it('moves inward with the track', () => {
    expect(trackBoxStyle(0.79)).toEqual({ top: '6%', width: '9%', height: '9%' })
  })
})

describe('easeOutCubic', () => {
  it('starts at nothing, ends at everything, and is past halfway in the middle', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10)
  })
})
