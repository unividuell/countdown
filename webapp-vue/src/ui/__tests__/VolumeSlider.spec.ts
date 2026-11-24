import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { unlockSound } from '@/ui/audio'
import IconLoud from '~icons/lucide/volume-2'
import IconSoft from '~icons/lucide/volume-1'
import IconMuted from '~icons/lucide/volume-x'
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

  it('brackets a press: down on the slider, up anywhere', async () => {
    const w = mount(VolumeSlider)

    await w.get('input').trigger('pointerdown')
    expect(w.emitted('press')).toHaveLength(1)
    expect(w.emitted('release')).toBeUndefined()

    window.dispatchEvent(new Event('pointerup'))
    window.dispatchEvent(new Event('pointerup'))
    expect(w.emitted('release')).toHaveLength(1)
  })

  it('stands upright on request, with the page kept from scrolling under the finger', () => {
    const w = mount(VolumeSlider, { props: { vertical: true } })

    expect(w.get('input').classes()).toEqual(
      expect.arrayContaining(['touch-none', '[writing-mode:vertical-lr]', '[direction:rtl]']),
    )
    expect(w.get('input').attributes('aria-orientation')).toBe('vertical')
  })

  // Upright, the knob is the speaker: it says what the slider sets.
  it.each([
    ['0', IconMuted],
    ['0.5', IconSoft],
    ['1', IconLoud],
  ])('upright at %s, the knob shows the matching speaker', (stored, icon) => {
    localStorage.setItem(GAME_VOLUME_KEY, stored)
    const w = mount(VolumeSlider, { props: { vertical: true } })

    const knob = w.get('[data-test="volume-knob"]')
    expect(knob.findComponent(icon).exists()).toBe(true)
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

  // Where it sits above other content, showing and hiding it must move nothing.
  it('keeps its room while hidden, on request', () => {
    localStorage.setItem(GAME_VOLUME_KEY, '0.3')
    const w = mount(SoundOffNotice, { props: { reserve: true } })

    const line = w.get('[data-test="sound-off"]')
    expect(line.classes()).toContain('invisible')
    expect(line.attributes('aria-hidden')).toBe('true')
  })
})
