import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SoundToggle from '@/ui/SoundToggle.vue'

describe('SoundToggle', () => {
  beforeEach(() => localStorage.clear())

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
})
