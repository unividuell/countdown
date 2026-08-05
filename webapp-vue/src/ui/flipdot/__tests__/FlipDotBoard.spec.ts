import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { BOOT_DARK_MS, BOOT_HOLD_MS, BOOT_RESOLVE_AT_MS, DOT_OFF, DOT_ON } from '@/ui/flipdot/board'
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

// Every dot starts lit, so the boot resolve flips exactly the dots that are dark at rest.
function indicesDark(text: string): number[] {
  return bitmap(text).on.flatMap((on, i) => (on ? [] : [i]))
}

async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
  await nextTick()
}

// Staged, not one 400 ms jump: bulk-advancing fake timers runs both boot callbacks before any
// microtask, so the white-up's flip would see the already-resolved board as its target. Real timers
// always drain microtasks between callbacks.
async function bootDone(): Promise<void> {
  await advance(BOOT_DARK_MS)
  await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
}

function fills(w: VueWrapper): (string | undefined)[] {
  return w.findAll('circle').map((c) => c.attributes('fill'))
}

function delays(animate: ReturnType<typeof vi.fn>): number[] {
  return animate.mock.calls.map((call) => (call[1] as { delay: number }).delay)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('FlipDotBoard', () => {
  it('renders one circle per grid cell', () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    expect(w.findAll('circle').length).toBe(5 * 7)
  })

  it('fills the lit dots with the on colour and the rest with the off colour', async () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    await bootDone()
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
    expect(fills(w).filter((f) => f === DOT_OFF).length).toBe(5 * 7 - 10)
  })

  it('exposes the text to assistive tech, which cannot read a dot matrix', async () => {
    const w = mount(FlipDotBoard, { props: { text: '58', label: '58 Tage bis zum Start' } })
    expect(w.attributes('role')).toBe('img')
    // Also during the boot's white phase: a screen reader is never told the board is blank.
    expect(w.attributes('aria-label')).toBe('58 Tage bis zum Start')
    await bootDone()
    expect(w.attributes('aria-label')).toBe('58 Tage bis zum Start')
  })

  it('mounts without a Web Animations API', () => {
    expect(() => mount(FlipDotBoard, { props: { text: '00', label: 'x' } })).not.toThrow()
  })

  it('boots without a Web Animations API', async () => {
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await bootDone()
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(bitmap('00').on.filter(Boolean).length)
  })

  it('flips without a Web Animations API', async () => {
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await bootDone()
    await expect(w.setProps({ text: '01' })).resolves.toBeUndefined()
    await nextTick()
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(bitmap('01').on.filter(Boolean).length)
  })

  it('animates exactly the dots that changed', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await bootDone()
    animate.mockClear()
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(diffCount('00', '01'))
  })

  it('runs the wave right to left, the direction a countdown borrows in', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await bootDone()
    animate.mockClear()
    await w.setProps({ text: '01' })
    await nextTick()
    const cols = bitmap('01').cols
    const byColumn = animate.mock.calls.map((call, n) => ({
      col: indicesChanged('00', '01')[n]! % cols,
      delay: (call[1] as { delay: number }).delay,
    }))
    // Without this, an empty call list would satisfy every assertion below: Math.max of nothing is
    // -Infinity, [].every() is true, and the loop never runs.
    expect(byColumn).toHaveLength(diffCount('00', '01'))
    const rightmost = Math.max(...byColumn.map((d) => d.col))
    expect(byColumn.filter((d) => d.col === rightmost).every((d) => d.delay === 0)).toBe(true)
    for (const d of byColumn) {
      expect(d.delay).toBe((rightmost - d.col) * 9)
    }
  })

  it('measures the delay from the changed columns, not from the board edge', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00:00:00', label: 'x' } })
    await bootDone()
    animate.mockClear()
    await w.setProps({ text: '00:00:01' })
    await nextTick()
    // Only the last digit changed. It sits at columns 42-46 of 47, so an absolute offset would
    // have delayed the first dot by 42 * 9 ms while nothing else on the board moved.
    expect(Math.min(...delays(animate))).toBe(0)
    expect(Math.max(...delays(animate))).toBeLessThanOrEqual(4 * 9)
  })

  it('does not animate when the grid geometry changes', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await bootDone()
    animate.mockClear()
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
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(bitmap('01').on.filter(Boolean).length)
  })

  describe('switching on', () => {
    it('starts dark at mount, at the resting board size', () => {
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      const box = w.attributes('viewBox')
      expect(fills(w).length).toBe(5 * 7)
      expect(fills(w).every((f) => f === DOT_OFF)).toBe(true)
      expect(box).toBe(`0 0 ${5 * 4 - 1} ${7 * 4 - 1}`)
    })

    // The slam is a phase change, not an animation: a simultaneous kick reads as nothing, and the
    // flip would cost one concurrent fill animation per dot in a single frame. So the assertion is
    // that every dot is lit *and* that this cost nothing.
    it('slams the whole board on after the dark phase, without animating', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(animate).not.toHaveBeenCalled()

      await advance(BOOT_DARK_MS - 1)
      expect(fills(w).every((f) => f === DOT_OFF)).toBe(true)
      expect(animate).not.toHaveBeenCalled()

      await advance(1)
      expect(fills(w).length).toBe(5 * 7)
      expect(fills(w).every((f) => f === DOT_ON)).toBe(true)
      expect(animate).not.toHaveBeenCalled()
    })

    it('holds the white field, then resolves the digits out of it', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      animate.mockClear()

      await advance(BOOT_HOLD_MS - 1)
      expect(fills(w).every((f) => f === DOT_ON)).toBe(true)
      expect(animate).not.toHaveBeenCalled()

      await advance(1)
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
      expect(animate).toHaveBeenCalledTimes(5 * 7 - 10)
    })

    it('resolves right to left, starting at the rightmost changed column', async () => {
      const animate = stubAnimate()
      mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      animate.mockClear()
      await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
      const cols = bitmap('1').cols
      const dark = indicesDark('1')
      const byColumn = animate.mock.calls.map((call, n) => ({
        col: dark[n]! % cols,
        delay: (call[1] as { delay: number }).delay,
      }))
      expect(byColumn).toHaveLength(dark.length)
      const rightmost = Math.max(...byColumn.map((d) => d.col))
      expect(rightmost).toBe(cols - 1)
      expect(byColumn.filter((d) => d.col === rightmost).every((d) => d.delay === 0)).toBe(true)
      for (const d of byColumn) {
        expect(d.delay).toBe((rightmost - d.col) * 9)
      }
    })

    it('announces the resolve, so followers need no clock of their own', async () => {
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      expect(w.emitted('resolve')).toBeUndefined()
      await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
      expect(w.emitted('resolve')).toHaveLength(1)
    })

    it('is skipped entirely under prefers-reduced-motion — no phases, no timer', async () => {
      const animate = stubAnimate()
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
      expect(vi.getTimerCount()).toBe(0)
      expect(w.emitted('resolve')).toHaveLength(1)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
    })

    it('fires no timer after being unmounted inside the dark phase', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(vi.getTimerCount()).toBe(2)
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
      expect(w.emitted('resolve')).toBeUndefined()
    })

    it('resolves to the value that arrived during the hold, not the one it booted with', async () => {
      const w = mount(FlipDotBoard, { props: { text: '58', label: 'x' } })
      await advance(BOOT_DARK_MS)
      await w.setProps({ text: '57' })
      await nextTick()
      // Still the white field — a value arriving mid-boot must not short-circuit the sequence.
      expect(fills(w).every((f) => f === DOT_ON)).toBe(true)

      await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
        bitmap('57').on.filter(Boolean).length,
      )
    })

    it('fires no timer after being unmounted inside the hold', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      animate.mockClear()
      expect(vi.getTimerCount()).toBe(1)
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
      expect(w.emitted('resolve')).toBeUndefined()
    })
  })
})
