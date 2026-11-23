import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import StreakMark from '../StreakMark.vue'

describe('StreakMark', () => {
  let animate: ReturnType<typeof vi.fn>

  // Observing the flare, not its frames: happy-dom would otherwise run it.
  beforeEach(() => {
    animate = vi.fn(() => ({ finished: Promise.resolve() }))
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
  })

  it('draws nothing below three', () => {
    const w = mount(StreakMark, { props: { streak: 2 } })

    expect(w.find('[data-test="streak-mark"]').exists()).toBe(false)
  })

  it('draws the band of the streak at its size', () => {
    const w = mount(StreakMark, { props: { streak: 10 } })
    const mark = w.get<HTMLElement>('[data-test="streak-mark"]')

    expect(mark.attributes('data-band')).toBe('flame-blue')
    expect(parseFloat(mark.element.style.width)).toBeCloseTo(20.45, 2)
  })

  it('flares when the streak rises, not when it mounts', async () => {
    const w = mount(StreakMark, { props: { streak: 10 } })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()

    await w.setProps({ streak: 11 })
    await nextTick()

    expect(animate).toHaveBeenCalledTimes(1)
  })
})
