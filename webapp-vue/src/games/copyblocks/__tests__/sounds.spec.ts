import { beforeEach, describe, expect, it, vi } from 'vitest'
import { audioGraph } from '@/ui/audio'
import {
  HIT_COUNT,
  HIT_GAIN,
  HIT_GAP_S,
  HIT_PITCH,
  PITCH,
  playSound,
  preloadSounds,
  soundPlan,
} from '@/games/copyblocks/sounds'

/** The sound switch as the player sees it. */
const sound = vi.hoisted(() => ({ on: true }))

vi.mock('@/ui/soundOutput', () => ({
  gameSoundOn: () => sound.on,
  soundOutput: (graph: { destination: unknown }) => graph.destination,
}))
vi.mock('@/ui/audio', () => ({ audioGraph: vi.fn(() => null), START_LOOKAHEAD_SECONDS: 0 }))

describe('soundPlan', () => {
  it('places with one sound of the type, pitched to 0.8 ± 5 %', () => {
    const [low] = soundPlan('place', 'DIRT', () => 0)
    const [high] = soundPlan('place', 'DIRT', () => 1)

    expect(low).toMatchObject({ set: 'gravel', gain: 1, offsetS: 0 })
    expect(low!.rate).toBeCloseTo(0.76)
    expect(high!.rate).toBeCloseTo(0.84)
    expect(soundPlan('place', 'DIRT', () => 0.5)).toHaveLength(1)
  })

  it('breaks with deep knocks from the place sound, then the break sound', () => {
    const plan = soundPlan('break', 'PACKED_ICE', () => 0.5)
    const knocks = plan.slice(0, HIT_COUNT)
    const [crack, ...rest] = plan.slice(HIT_COUNT)

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
    expect(rest).toEqual([])
  })

  it('knocks twice, deeper and quieter than the break itself', () => {
    expect(HIT_COUNT).toBe(2)
    expect(HIT_PITCH).toBeLessThan(PITCH)
    expect(HIT_GAIN).toBeLessThan(1)
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

describe('muted', () => {
  beforeEach(() => {
    vi.mocked(audioGraph).mockClear()
    sound.on = true
  })

  it('asks for no graph at all: a muted game leaves the device’s audio alone', () => {
    sound.on = false
    playSound('break', 'STONE')

    expect(audioGraph).not.toHaveBeenCalled()
  })

  it('asks for it once sound is on', () => {
    playSound('break', 'STONE')

    expect(audioGraph).toHaveBeenCalledOnce()
  })
})
