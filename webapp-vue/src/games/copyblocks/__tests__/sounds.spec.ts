import { describe, expect, it } from 'vitest'
import {
  CRUMBLE_DELAY_S,
  CRUMBLE_DETUNE,
  CRUMBLE_GAIN,
  HIT_COUNT,
  HIT_GAIN,
  HIT_GAP_S,
  HIT_PITCH,
  PITCH,
  playSound,
  preloadSounds,
  soundPlan,
} from '@/games/copyblocks/sounds'

describe('soundPlan', () => {
  it('places with one sound of the type, pitched to 0.8 ± 5 %', () => {
    const [low] = soundPlan('place', 'DIRT', () => 0)
    const [high] = soundPlan('place', 'DIRT', () => 1)

    expect(low).toMatchObject({ set: 'gravel', gain: 1, offsetS: 0 })
    expect(low!.rate).toBeCloseTo(0.76)
    expect(high!.rate).toBeCloseTo(0.84)
    expect(soundPlan('place', 'DIRT', () => 0.5)).toHaveLength(1)
  })

  it('breaks with deep knocks from the place sound, then the break sound over a crumble', () => {
    const plan = soundPlan('break', 'PACKED_ICE', () => 0.5)
    const knocks = plan.slice(0, HIT_COUNT)
    const [crack, crumble, ...rest] = plan.slice(HIT_COUNT)

    expect(knocks).toEqual(
      Array.from({ length: HIT_COUNT }, (_, i) => ({
        set: 'stone',
        rate: HIT_PITCH,
        gain: HIT_GAIN,
        offsetS: i * HIT_GAP_S,
      })),
    )
    expect(crack).toMatchObject({ set: 'glass', gain: 1 })
    expect(crack!.offsetS).toBeCloseTo(HIT_COUNT * HIT_GAP_S)
    expect(crack!.rate).toBeCloseTo(0.8)
    expect(crumble).toMatchObject({ set: 'glass', gain: CRUMBLE_GAIN })
    expect(crumble!.offsetS).toBeCloseTo(crack!.offsetS + CRUMBLE_DELAY_S)
    expect(crumble!.rate).toBeCloseTo(0.8 * CRUMBLE_DETUNE)
    expect(rest).toEqual([])
  })

  it('starts from two to three deep, quieter knocks and a detuned, quieter crumble', () => {
    expect(HIT_COUNT).toBeGreaterThanOrEqual(2)
    expect(HIT_COUNT).toBeLessThanOrEqual(3)
    expect(HIT_PITCH).toBeLessThan(PITCH)
    expect(HIT_GAIN).toBeLessThan(1)
    expect(CRUMBLE_DETUNE).not.toBe(1)
    expect(CRUMBLE_GAIN).toBeLessThan(1)
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
