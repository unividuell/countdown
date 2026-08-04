import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { DOT_OFF, DOT_ON } from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'

// happy-dom 20 ships no Web Animations API (measured: Element.prototype.animate is undefined),
// so a test that wants to observe the flip has to install it.
function stubAnimate(): ReturnType<typeof vi.fn> {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

function diffCount(a: string, b: string): number {
  const x = bitmap(a).on
  const y = bitmap(b).on
  return x.reduce((n, on, i) => (on === (y[i] ?? false) ? n : n + 1), 0)
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
  vi.restoreAllMocks()
})

describe('FlipDotBoard', () => {
  it('renders one circle per grid cell', () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    expect(w.findAll('circle').length).toBe(5 * 7)
  })

  it('fills the lit dots with the on colour and the rest with the off colour', () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    const fills = w.findAll('circle').map((c) => c.attributes('fill'))
    expect(fills.filter((f) => f === DOT_ON).length).toBe(10)
    expect(fills.filter((f) => f === DOT_OFF).length).toBe(5 * 7 - 10)
  })

  it('exposes the text to assistive tech, which cannot read a dot matrix', () => {
    const w = mount(FlipDotBoard, { props: { text: '58', label: '58 Tage bis zum Start' } })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('58 Tage bis zum Start')
  })

  it('mounts without a Web Animations API', () => {
    expect(() => mount(FlipDotBoard, { props: { text: '00', label: 'x' } })).not.toThrow()
  })

  it('animates exactly the dots that changed', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    expect(animate).not.toHaveBeenCalled()
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(diffCount('00', '01'))
  })

  it('staggers the flip by column so the wave runs left to right', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await w.setProps({ text: '01' })
    await nextTick()
    const delays = animate.mock.calls.map((call) => (call[1] as { delay: number }).delay)
    expect(Math.min(...delays)).toBeLessThan(Math.max(...delays))
    expect(delays.every((d) => d % 9 === 0)).toBe(true)
  })

  it('does not animate when the grid geometry changes', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await w.setProps({ text: '100' })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    expect(w.findAll('circle').length).toBe(17 * 7)
  })

  it('honours prefers-reduced-motion by switching without the flip', async () => {
    const animate = stubAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    const fills = w.findAll('circle').map((c) => c.attributes('fill'))
    expect(fills.filter((f) => f === DOT_ON).length).toBe(bitmap('01').on.filter(Boolean).length)
  })
})
