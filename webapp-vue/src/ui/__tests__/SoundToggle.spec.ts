import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SoundToggle from '@/ui/SoundToggle.vue'
import { unlockSound } from '@/ui/woodKnock'

/** The app's graph as the toggle sees it: `null` is a browser without Web Audio. */
const audio = vi.hoisted(() => ({
  graph: null as (EventTarget & { state: AudioContextState }) | null,
}))

vi.mock('@/ui/audio', () => ({ audioGraph: () => audio.graph }))
vi.mock('@/ui/woodKnock', () => ({ unlockSound: vi.fn() }))

enableAutoUnmount(afterEach)

function graphIn(state: AudioContextState) {
  const graph = Object.assign(new EventTarget(), { state })
  audio.graph = graph

  return {
    become(next: AudioContextState) {
      graph.state = next
      graph.dispatchEvent(new Event('statechange'))
    },
  }
}

describe('SoundToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    audio.graph = null
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
    expect(localStorage.getItem('games:sound')).toBe('false')
  })

  it('two toggles show the same setting', async () => {
    const a = mount(SoundToggle)
    const b = mount(SoundToggle)

    await a.get('button').trigger('click')
    await nextTick()

    expect(a.get('button').attributes('aria-pressed')).toBe('false')
    expect(b.get('button').attributes('aria-pressed')).toBe('false')
  })

  describe('a graph the browser has not let start yet', () => {
    it('shows sound as on but asleep, then on once the graph runs', async () => {
      const graph = graphIn('suspended')
      const w = mount(SoundToggle)
      expect(w.get('button').attributes('data-state')).toBe('asleep')

      graph.become('running')
      await nextTick()

      expect(w.get('button').attributes('data-state')).toBe('on')
    })

    it('shows a stored mute as muted, whatever the graph does', async () => {
      localStorage.setItem('games:sound', 'false')
      const graph = graphIn('suspended')
      const w = mount(SoundToggle)
      expect(w.get('button').attributes('data-state')).toBe('off')

      graph.become('running')
      await nextTick()

      expect(w.get('button').attributes('data-state')).toBe('off')
    })

    it('a press on the sleeping toggle wakes the graph instead of muting', async () => {
      graphIn('suspended')
      const w = mount(SoundToggle)

      await w.get('button').trigger('pointerdown')
      await w.get('button').trigger('click')

      expect(unlockSound).toHaveBeenCalled()
      expect(w.get('button').attributes('aria-pressed')).toBe('true')
    })

    it('a press on the running toggle mutes', async () => {
      graphIn('running')
      const w = mount(SoundToggle)

      await w.get('button').trigger('pointerdown')
      await w.get('button').trigger('click')

      expect(w.get('button').attributes('data-state')).toBe('off')
    })

    it('unmuting wakes the graph with the same click', async () => {
      localStorage.setItem('games:sound', 'false')
      graphIn('suspended')
      const w = mount(SoundToggle)

      await w.get('button').trigger('pointerdown')
      await w.get('button').trigger('click')

      expect(unlockSound).toHaveBeenCalledOnce()
      expect(w.get('button').attributes('data-state')).toBe('asleep')
    })

    it('any tap on the page wakes it', () => {
      graphIn('suspended')
      mount(SoundToggle)

      document.dispatchEvent(new Event('pointerup'))

      expect(unlockSound).toHaveBeenCalledOnce()
    })

    it('a finger setting down does not: that is no user activation', () => {
      graphIn('suspended')
      mount(SoundToggle)

      document.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: 'touch' }))

      expect(unlockSound).not.toHaveBeenCalled()
    })

    it('a tap on a muted page wakes nothing', () => {
      localStorage.setItem('games:sound', 'false')
      graphIn('suspended')
      mount(SoundToggle)

      document.dispatchEvent(new Event('pointerup'))

      expect(unlockSound).not.toHaveBeenCalled()
    })
  })
})
