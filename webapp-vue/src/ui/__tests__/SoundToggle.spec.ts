import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { unlockSound } from '@/ui/audio'
import SoundToggle from '@/ui/SoundToggle.vue'
import { useSoundStage } from '@/ui/useSoundAwake'

vi.mock('@/ui/audio', () => ({ unlockSound: vi.fn() }))

enableAutoUnmount(afterEach)

/** A board that knocks, on screen. */
const Stage = defineComponent({
  setup() {
    useSoundStage()
    return () => null
  },
})

describe('SoundToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(unlockSound).mockClear()
  })

  it('starts on and says so', () => {
    const w = mount(SoundToggle)

    expect(w.get('button').attributes('aria-pressed')).toBe('true')
  })

  it('a click mutes and is remembered for every game', async () => {
    const w = mount(SoundToggle)

    await w.get('button').trigger('click')

    expect(w.get('button').attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('games:volume')).toBe('0')
  })

  it('two toggles show the same setting', async () => {
    const a = mount(SoundToggle)
    const b = mount(SoundToggle)

    await a.get('button').trigger('click')
    await nextTick()

    expect(a.get('button').attributes('aria-pressed')).toBe('false')
    expect(b.get('button').attributes('aria-pressed')).toBe('false')
  })

  it('shows a stored mute as muted', () => {
    localStorage.setItem('games:volume', '0')
    const w = mount(SoundToggle)

    expect(w.get('button').attributes('aria-pressed')).toBe('false')
  })

  describe('with no board that knocks on screen', () => {
    it('never wakes the graph: that would claim the audio session', async () => {
      const w = mount(SoundToggle)

      document.dispatchEvent(new Event('pointerup'))
      await w.get('button').trigger('click')
      await w.get('button').trigger('click')

      expect(unlockSound).not.toHaveBeenCalled()
    })
  })

  describe('with a board that knocks on screen', () => {
    beforeEach(() => {
      mount(Stage)
    })

    it('unmuting wakes the graph with the same click', async () => {
      localStorage.setItem('games:volume', '0')
      const w = mount(SoundToggle)

      await w.get('button').trigger('click')

      expect(unlockSound).toHaveBeenCalledOnce()
      expect(w.get('button').attributes('aria-pressed')).toBe('true')
    })

    it('muting wakes nothing', async () => {
      const w = mount(SoundToggle)

      await w.get('button').trigger('click')

      expect(unlockSound).not.toHaveBeenCalled()
    })

    it('any tap on the page wakes it', () => {
      mount(SoundToggle)

      document.dispatchEvent(new Event('pointerup'))

      expect(unlockSound).toHaveBeenCalledOnce()
    })

    it('a finger setting down does not: that is no user activation', () => {
      mount(SoundToggle)

      document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }))

      expect(unlockSound).not.toHaveBeenCalled()
    })

    it('a tap on a muted page wakes nothing', () => {
      localStorage.setItem('games:volume', '0')
      mount(SoundToggle)

      document.dispatchEvent(new Event('pointerup'))

      expect(unlockSound).not.toHaveBeenCalled()
    })
  })
})
