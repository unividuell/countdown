import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HueWheel from '@/games/guesshue/HueWheel.vue'

function mountWheel(props: Partial<InstanceType<typeof HueWheel>['$props']> = {}) {
  return mount(HueWheel, {
    props: { hue: 210, saturation: 0.6, lightness: 0.45, disabled: false, ...props },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

/**
 * happy-dom computes no layout: `getBoundingClientRect()` answers all zeroes, which makes
 * `radiusFraction` read 0 everywhere and the dead zone look like it covers the whole wheel. A
 * pointer test is worthless without a real box to measure against.
 */
function stubRect(el: Element): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    right: 200,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('HueWheel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
    vi.restoreAllMocks()
  })

  it('is one slider, named and described for a screen reader', () => {
    const w = mountWheel({ hue: 240 })
    const el = w.get('[data-test="hue-wheel"]')

    expect(el.attributes('role')).toBe('slider')
    expect(el.attributes('aria-label')).toBe('Farbton')
    expect(el.attributes('aria-roledescription')).toBe('Farbrad')
    expect(el.attributes('aria-valuemin')).toBe('0')
    expect(el.attributes('aria-valuemax')).toBe('359')
    expect(el.attributes('aria-valuenow')).toBe('240')
    expect(el.attributes('aria-valuetext')).toBe('Blau, 240 Grad')
  })

  it('rounds only what is read aloud', () => {
    const w = mountWheel({ hue: 240.7 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('241')
  })

  it('never announces a value above its own maximum', () => {
    // Rounding 359.6 up lands on 360, one past aria-valuemax — an inconsistency a screen reader
    // reports and nobody else ever sees. The circle closes after rounding, not before.
    const w = mountWheel({ hue: 359.6 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('0')
    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuetext')).toBe('Rot, 0 Grad')
  })

  it('is reachable by keyboard, and not while disabled', () => {
    expect(mountWheel().get('[data-test="hue-wheel"]').attributes('tabindex')).toBe('0')
    expect(
      mountWheel({ disabled: true }).get('[data-test="hue-wheel"]').attributes('tabindex'),
    ).toBe('-1')
  })

  it('steps by one on the arrows, in both directions', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'ArrowRight' })
    await el.trigger('keydown', { key: 'ArrowUp' })
    await el.trigger('keydown', { key: 'ArrowLeft' })
    await el.trigger('keydown', { key: 'ArrowDown' })

    expect(w.emitted('update:hue')).toEqual([[101], [101], [99], [99]])
  })

  it('steps by ten on page up and down', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'PageUp' })
    await el.trigger('keydown', { key: 'PageDown' })

    expect(w.emitted('update:hue')).toEqual([[110], [90]])
  })

  it('jumps to the ends on Home and End', async () => {
    const w = mountWheel({ hue: 100 })
    const el = w.get('[data-test="hue-wheel"]')

    await el.trigger('keydown', { key: 'Home' })
    await el.trigger('keydown', { key: 'End' })

    expect(w.emitted('update:hue')).toEqual([[0], [359]])
  })

  it('wraps around the circle rather than clamping', async () => {
    const w = mountWheel({ hue: 0 })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'ArrowDown' })

    expect(w.emitted('update:hue')).toEqual([[359]])
  })

  it('swallows the arrow key so the page does not scroll', () => {
    const w = mountWheel()
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })

    w.get('[data-test="hue-wheel"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the space key to the confirm button in its centre', () => {
    const w = mountWheel()
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })

    w.get('[data-test="hue-wheel"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(w.emitted('update:hue')).toBeUndefined()
  })

  it('ignores the keyboard while disabled', async () => {
    const w = mountWheel({ disabled: true })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'ArrowUp' })

    expect(w.emitted('update:hue')).toBeUndefined()
  })

  it('renders whatever is put in its centre', () => {
    const w = mount(HueWheel, {
      props: { hue: 10, saturation: 0.6, lightness: 0.45, disabled: false },
      slots: { center: '<b data-test="knobbly">x</b>' },
    })

    expect(w.find('[data-test="knobbly"]').exists()).toBe(true)
  })

  it('reports the ring finished right away when motion is reduced', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

    const w = mountWheel()
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })

  it('reports the ring finished right away in a background tab', async () => {
    setHidden(true)

    const w = mountWheel()
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })

  it('reports the ring finished once the sweep has run', async () => {
    const w = mountWheel()
    vi.advanceTimersByTime(2000)
    await w.vm.$nextTick()

    expect(w.emitted('boot-done')).toHaveLength(1)
  })

  describe('pointer dragging', () => {
    // A 200×200 box centred at (100, 100), radius 100 — the four points below sit exactly on the
    // ring, one per axis, so the expected angle is never in doubt.
    const UP = { clientX: 100, clientY: 0 } // straight up: 0°
    const RIGHT = { clientX: 200, clientY: 100 } // right: 90°
    const DOWN = { clientX: 100, clientY: 200 } // down: 180°
    const LEFT = { clientX: 0, clientY: 100 } // left: 270°
    const CENTRE = { clientX: 100, clientY: 100 } // dead zone

    it('follows the ring: a press then moves emit the angle the geometry says', async () => {
      const w = mountWheel()
      const el = w.get('[data-test="hue-wheel"]')
      stubRect(el.element)

      await el.trigger('pointerdown', { ...UP, pointerId: 1 })
      await el.trigger('pointermove', { ...RIGHT, pointerId: 1 })
      await el.trigger('pointermove', { ...DOWN, pointerId: 1 })
      await el.trigger('pointermove', { ...LEFT, pointerId: 1 })

      expect(w.emitted('update:hue')).toEqual([[0], [90], [180], [270]])
    })

    it('emits nothing for a press inside the dead zone', async () => {
      const w = mountWheel()
      const el = w.get('[data-test="hue-wheel"]')
      stubRect(el.element)

      await el.trigger('pointerdown', { ...CENTRE, pointerId: 1 })

      expect(w.emitted('update:hue')).toBeUndefined()
    })

    it('emits nothing for a move with no preceding press', async () => {
      const w = mountWheel()
      const el = w.get('[data-test="hue-wheel"]')
      stubRect(el.element)

      await el.trigger('pointermove', { ...RIGHT, pointerId: 1 })

      expect(w.emitted('update:hue')).toBeUndefined()
    })

    it('does not start a drag from a press that originated in the centre slot', async () => {
      // The regression test: a press on the confirm button bubbles through the wheel's own
      // `pointerdown` handler on its way up. Before the fix, that was read as a grab — capture
      // taken, `dragging` set — and a subsequent move re-aimed the wheel underneath a held button.
      const w = mount(HueWheel, {
        props: { hue: 210, saturation: 0.6, lightness: 0.45, disabled: false },
        slots: { center: '<button data-test="fake-confirm">x</button>' },
      })
      const el = w.get('[data-test="hue-wheel"]')
      stubRect(el.element)
      const button = w.get('[data-test="fake-confirm"]')
      // The button's own box sits inside the dead zone, but that is not what is under test here —
      // stubbing it separately would only prove the dead zone works twice.
      stubRect(button.element)

      await button.trigger('pointerdown', { ...CENTRE, pointerId: 1 })
      await el.trigger('pointermove', { ...RIGHT, pointerId: 1 })

      expect(w.emitted('update:hue')).toBeUndefined()
    })

    it('drags anyway when the browser refuses pointer capture', async () => {
      // `setPointerCapture` throws `NotFoundError` for a pointer the browser is not tracking.
      // Forced here regardless of what this happy-dom version happens to do natively, so the test
      // pins the try/catch rather than an implementation detail of the test environment.
      const w = mountWheel()
      const el = w.get('[data-test="hue-wheel"]')
      stubRect(el.element)
      el.element.setPointerCapture = vi.fn(() => {
        throw new DOMException('no such pointer', 'NotFoundError')
      })

      await el.trigger('pointerdown', { ...UP, pointerId: 1 })

      expect(w.emitted('update:hue')).toEqual([[0]])
    })
  })
})
