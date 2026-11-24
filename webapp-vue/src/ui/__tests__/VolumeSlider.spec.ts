import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { unlockSound } from '@/ui/audio'
import SoundOffNotice from '@/ui/SoundOffNotice.vue'
import { useGameSound } from '@/ui/useGameSound'
import { GAME_VOLUME_KEY, useGameVolume } from '@/ui/useGameVolume'
import { useSoundStage } from '@/ui/useSoundAwake'
import VolumeSlider from '@/ui/VolumeSlider.vue'

vi.mock('@/ui/audio', () => ({ unlockSound: vi.fn() }))

enableAutoUnmount(afterEach)

/** A board that knocks, on screen. */
const Stage = defineComponent({
  setup() {
    useSoundStage()
    return () => null
  },
})

describe('VolumeSlider', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(unlockSound).mockClear()
  })

  it('shows the stored volume', () => {
    localStorage.setItem(GAME_VOLUME_KEY, '0.3')
    const w = mount(VolumeSlider)

    expect(w.get<HTMLInputElement>('input[type=range]').element.value).toBe('0.3')
    expect(w.get('input').attributes('aria-label')).toBe('Lautstärke')
  })

  it('sets the volume for every game and says it moved', async () => {
    const w = mount(VolumeSlider)

    await w.get('input').setValue('0.5')
    await nextTick()

    expect(localStorage.getItem(GAME_VOLUME_KEY)).toBe('0.5')
    expect(w.emitted('adjust')).toHaveLength(1)
  })

  it('down to zero is mute', async () => {
    const w = mount(VolumeSlider)

    await w.get('input').setValue('0')
    await nextTick()

    expect(useGameSound().value).toBe(false)
  })

  it('follows the mute switch', async () => {
    const w = mount(VolumeSlider)

    useGameSound().value = false
    await nextTick()
    await nextTick()

    expect(w.get<HTMLInputElement>('input').element.value).toBe('0')
  })

  it('wakes the graph on release while a board is on screen', async () => {
    mount(Stage)
    const w = mount(VolumeSlider)

    await w.get('input').trigger('change')

    expect(unlockSound).toHaveBeenCalled()
  })

  it('wakes nothing off stage', async () => {
    const w = mount(VolumeSlider)

    await w.get('input').trigger('change')

    expect(unlockSound).not.toHaveBeenCalled()
  })
})

describe('SoundOffNotice', () => {
  beforeEach(() => localStorage.clear())

  it('says so at zero', async () => {
    const w = mount(SoundOffNotice)
    useGameVolume().value = 0
    await nextTick()
    await nextTick()

    expect(w.get('[data-test="sound-off"]').text()).toBe('Ton ist aus')
  })

  it('is gone while there is any volume', () => {
    localStorage.setItem(GAME_VOLUME_KEY, '0.3')
    const w = mount(SoundOffNotice)

    expect(w.find('[data-test="sound-off"]').exists()).toBe(false)
  })
})
