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

// Ascending, which is the order the component animates in — so the nth animate() call belongs to
// the nth entry here.
function indicesChanged(a: string, b: string): number[] {
  const x = bitmap(a).on
  const y = bitmap(b).on
  return x.flatMap((on, i) => (on === (y[i] ?? false) ? [] : [i]))
}

function diffCount(a: string, b: string): number {
  return indicesChanged(a, b).length
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

  it('flips without a Web Animations API', async () => {
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await expect(w.setProps({ text: '01' })).resolves.toBeUndefined()
    await nextTick()
    const fills = w.findAll('circle').map((c) => c.attributes('fill'))
    expect(fills.filter((f) => f === DOT_ON).length).toBe(bitmap('01').on.filter(Boolean).length)
  })

  it('animates exactly the dots that changed', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    expect(animate).not.toHaveBeenCalled()
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(diffCount('00', '01'))
  })

  it('runs the wave right to left, the direction a countdown borrows in', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await w.setProps({ text: '01' })
    await nextTick()
    const cols = bitmap('01').cols
    const byColumn = animate.mock.calls.map((call, n) => ({
      col: indicesChanged('00', '01')[n]! % cols,
      delay: (call[1] as { delay: number }).delay,
    }))
    const rightmost = Math.max(...byColumn.map((d) => d.col))
    expect(byColumn.filter((d) => d.col === rightmost).every((d) => d.delay === 0)).toBe(true)
    for (const d of byColumn) {
      expect(d.delay).toBe((rightmost - d.col) * 9)
    }
  })

  it('measures the delay from the changed columns, not from the board edge', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00:00:00', label: 'x' } })
    await w.setProps({ text: '00:00:01' })
    await nextTick()
    const delays = animate.mock.calls.map((call) => (call[1] as { delay: number }).delay)
    // Only the last digit changed. It sits at columns 42-46 of 47, so an absolute offset would
    // have delayed the first dot by 42 * 9 ms while nothing else on the board moved.
    expect(Math.min(...delays)).toBe(0)
    expect(Math.max(...delays)).toBeLessThanOrEqual(4 * 9)
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
