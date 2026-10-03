import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import DedusterMark from '../DedusterMark.vue'

enableAutoUnmount(afterEach)

/** The mark inside a button, as in the scoreboard: a click that reaches the button selects. */
const Host = defineComponent({
  components: { DedusterMark },
  setup() {
    return { selected: ref(0) }
  },
  template: `<button @click="selected++"><DedusterMark hint="Nach dem Neuladen gespielt">!</DedusterMark></button>`,
})

// happy-dom has the attribute but not the top layer.
const showPopover = vi.fn()
const hidePopover = vi.fn()

describe('DedusterMark', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    showPopover.mockClear()
    hidePopover.mockClear()
    HTMLElement.prototype.showPopover = showPopover
    HTMLElement.prototype.hidePopover = hidePopover
  })
  afterEach(() => vi.useRealTimers())

  const mark = (w: ReturnType<typeof mount>) => w.get('span[title]')
  const press = (w: ReturnType<typeof mount>) =>
    mark(w).trigger('pointerdown', { isPrimary: true, clientX: 10, clientY: 10 })

  it('names its meaning for hover and for screen readers', () => {
    const w = mount(Host)

    expect(mark(w).attributes('title')).toBe('Nach dem Neuladen gespielt')
    expect(w.get('.sr-only').text()).toBe('Nach dem Neuladen gespielt')
  })

  it('opens the hint after a hold, and the click that ends it selects nothing', async () => {
    const w = mount(Host)

    await press(w)
    vi.advanceTimersByTime(500)
    await mark(w).trigger('click')

    expect(showPopover).toHaveBeenCalledOnce()
    expect(w.get('[data-test="mark-hint"]').text()).toBe('Nach dem Neuladen gespielt')
    expect((w.vm as unknown as { selected: number }).selected).toBe(0)
  })

  it('leaves a short tap to the button', async () => {
    const w = mount(Host)

    await press(w)
    vi.advanceTimersByTime(300)
    await mark(w).trigger('pointerup')
    vi.advanceTimersByTime(500)
    await mark(w).trigger('click')

    expect(showPopover).not.toHaveBeenCalled()
    expect((w.vm as unknown as { selected: number }).selected).toBe(1)
  })

  it('closes an open hint on scroll: it is pinned to the viewport, not to the mark', async () => {
    const w = mount(Host, { attachTo: document.body })
    const hint = w.get('[data-test="mark-hint"]')

    window.dispatchEvent(new Event('scroll'))
    expect(hidePopover).not.toHaveBeenCalled()

    hint.element.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }))
    window.dispatchEvent(new Event('scroll'))
    expect(hidePopover).toHaveBeenCalledOnce()
  })

  it('takes a finger that moves for a scroll, not a hold', async () => {
    const w = mount(Host)

    await press(w)
    await mark(w).trigger('pointermove', { clientX: 10, clientY: 30 })
    vi.advanceTimersByTime(600)

    expect(showPopover).not.toHaveBeenCalled()
  })
})
