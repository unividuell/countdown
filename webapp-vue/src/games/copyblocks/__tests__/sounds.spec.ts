import { describe, expect, it } from 'vitest'
import { playSound, preloadSounds, soundPlan } from '@/games/copyblocks/sounds'

describe('soundPlan', () => {
  it('places with one sound of the type, pitched to 0.8 ± 5 %', () => {
    const [low] = soundPlan('place', 'DIRT', () => 0)
    const [high] = soundPlan('place', 'DIRT', () => 1)

    expect(low).toMatchObject({ set: 'gravel', gain: 1, offsetS: 0 })
    expect(low!.rate).toBeCloseTo(0.76)
    expect(high!.rate).toBeCloseTo(0.84)
    expect(soundPlan('place', 'DIRT', () => 0.5)).toHaveLength(1)
  })

  it('breaks with a knock from the place sound, then the break sound', () => {
    const [knock, crack, ...rest] = soundPlan('break', 'PACKED_ICE', () => 0.5)

    expect(knock).toEqual({ set: 'stone', rate: 0.5, gain: 0.25, offsetS: 0 })
    expect(crack).toMatchObject({ set: 'glass', gain: 1, offsetS: 0.06 })
    expect(crack!.rate).toBeCloseTo(0.8)
    expect(rest).toEqual([])
  })
})

describe('without Web Audio', () => {
  it('stays silent rather than failing', () => {
    expect(() => {
      preloadSounds()
      playSound('break', 'STONE')
    }).not.toThrow()
  })
})
