import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_VOLUME, GAME_VOLUME_KEY, useGameVolume, volumeGain } from '@/ui/useGameVolume'
import { useGameSound } from '@/ui/useGameSound'

describe('useGameVolume', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the default', () => {
    expect(useGameVolume().value).toBe(DEFAULT_VOLUME)
    expect(DEFAULT_VOLUME).toBe(0.8)
  })

  it('is remembered for every game', async () => {
    useGameVolume().value = 0.3
    await nextTick()

    expect(localStorage.getItem(GAME_VOLUME_KEY)).toBe('0.3')
  })
})

describe('volumeGain', () => {
  it('squares the value: the ear hears loudness logarithmically', () => {
    expect(volumeGain(0.8)).toBeCloseTo(0.64)
    expect(volumeGain(0)).toBe(0)
  })

  it('never leaves [0, 1]', () => {
    expect(volumeGain(1.5)).toBe(1)
    expect(volumeGain(-1)).toBe(0)
    // A hand-edited `games:volume` parses to NaN; a NaN gain throws on assignment.
    expect(volumeGain(Number.NaN)).toBe(0)
  })
})

describe('useGameSound', () => {
  beforeEach(() => localStorage.clear())

  it('is on while there is any volume', async () => {
    useGameVolume().value = 0.3
    await nextTick()

    expect(useGameSound().value).toBe(true)
  })

  it('is off at zero', async () => {
    useGameVolume().value = 0
    await nextTick()

    expect(useGameSound().value).toBe(false)
  })

  it('muting sets the volume to zero', async () => {
    useGameSound().value = false
    await nextTick()

    expect(localStorage.getItem(GAME_VOLUME_KEY)).toBe('0')
  })

  it('unmuting from zero jumps to the default, not to a sliver', async () => {
    useGameVolume().value = 0
    await nextTick()

    useGameSound().value = true
    await nextTick()

    expect(useGameVolume().value).toBe(DEFAULT_VOLUME)
  })

  it('switching on what is on keeps the volume', async () => {
    useGameVolume().value = 0.3
    await nextTick()

    useGameSound().value = true
    await nextTick()

    expect(useGameVolume().value).toBe(0.3)
  })
})
