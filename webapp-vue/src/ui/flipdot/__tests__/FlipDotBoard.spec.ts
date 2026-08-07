import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import {
  BOOT_DARK_MS,
  BOOT_HOLD_MS,
  BOOT_RESOLVE_AT_MS,
  CREATE_LEAD_MS,
  DOT_OFF,
  DOT_ON,
  PITCH,
  RADIUS,
  STAGGER_MS,
} from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'

// When each animation was created, which is half of what the schedule assertions need: the board
// no longer creates them all at once, so a call's `delay` alone no longer says when it runs.
const createdAt: number[] = []

// happy-dom 20 ships no Web Animations API (measured: Element.prototype.animate is undefined),
// so a test that wants to observe the flip has to install it.
function stubAnimate(): ReturnType<typeof vi.fn> {
  const animate = vi.fn(() => {
    createdAt.push(performance.now())
  })
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

/** Column of the circle an `animate` call was made on, read back off its rendered geometry. */
function columnOf(el: Element): number {
  return (Number(el.getAttribute('cx')) - RADIUS) / PITCH
}

/**
 * When each animated dot actually starts moving, relative to `t0` — creation time plus the delay
 * the call carries. That sum is the thing the eye sees, and the thing that must not change when
 * creation moves to a later frame.
 */
function schedule(
  animate: ReturnType<typeof vi.fn>,
  t0: number,
): { col: number; start: number; createdAfter: number }[] {
  return animate.mock.calls.map((call, n) => ({
    col: columnOf(animate.mock.contexts[n] as Element),
    start: Math.round(createdAt[n]! - t0 + (call[1] as { delay: number }).delay),
    createdAfter: Math.round(createdAt[n]! - t0),
  }))
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
  createdAt.length = 0
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
    // Read the column back off the circle the call was made on: the board creates its animations
    // column by column, so the nth call is no longer the nth changed dot in index order.
    const byColumn = animate.mock.calls.map((call, n) => ({
      col: columnOf(animate.mock.contexts[n] as Element),
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
    // Only the last digit changed. It sits at columns 38-42 of 43, so an absolute offset would
    // have delayed the first dot by 38 * 9 ms while nothing else on the board moved.
    expect(Math.min(...delays(animate))).toBe(0)
    expect(Math.max(...delays(animate))).toBeLessThanOrEqual(4 * 9)
  })

  it('switches itself on again when the geometry changes, instead of jumping', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await bootDone()
    animate.mockClear()

    await w.setProps({ text: '100' })
    await nextTick()
    // White first, and already at the new size: the width change happens while nothing is legible,
    // which is what keeps it from reading as a jump.
    expect(w.findAll('circle').length).toBe(17 * 7)
    expect(fills(w).every((f) => f === DOT_ON)).toBe(true)
    expect(animate).not.toHaveBeenCalled()
    expect(w.emitted('phase')?.at(-1)).toEqual(['white'])

    await advance(BOOT_HOLD_MS)
    expect(w.emitted('phase')?.at(-1)).toEqual(['live'])

    // The relight resolves as a wave like any other, so the board is only fully out of the white
    // once the leftmost column has had its turn.
    await advance((17 - 1) * STAGGER_MS + CREATE_LEAD_MS)
    const litAtRest = bitmap('100').on.filter(Boolean).length
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(litAtRest)
    expect(animate).toHaveBeenCalledTimes(17 * 7 - litAtRest)
  })

  it('swaps a changed geometry instantly under prefers-reduced-motion', async () => {
    const animate = stubAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await w.setProps({ text: '100' })
    await nextTick()
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
      bitmap('100').on.filter(Boolean).length,
    )
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
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
        col: columnOf(animate.mock.contexts[n] as Element),
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

    it('announces every phase, so followers need no clock of their own', async () => {
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      // The dark phase is the starting state; nobody has to be told about it.
      expect(w.emitted('phase')).toBeUndefined()
      await advance(BOOT_DARK_MS)
      expect(w.emitted('phase')).toEqual([['white']])
      await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
      expect(w.emitted('phase')).toEqual([['white'], ['live']])
    })

    it('is skipped entirely under prefers-reduced-motion — no phases, no timer', async () => {
      const animate = stubAnimate()
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
      expect(vi.getTimerCount()).toBe(0)
      expect(w.emitted('phase')).toEqual([['live']])
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
      expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
    })

    it('fires no timer after being unmounted inside the dark phase', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(vi.getTimerCount()).toBe(2)
      // Asserted before the unmount: @vue/test-utils drops an instance's whole emit history inside
      // unmount(), so emitted() afterwards is undefined whatever happened — which is why the
      // assertion that used to stand at the end of this test could never have failed.
      expect(w.emitted('phase')).toBeUndefined()
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
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

    // A board the width of the header changes ~70% of its dots at the reveal. Creating one
    // animation per changed dot in a single frame is what stalled the main thread there — measured
    // at 4x CPU throttling: a 75 ms frame, and the member swarm's flight visibly stuttering with it.
    describe('spreading the reveal over frames', () => {
      const WIDE = '02:15:07:33'
      const wideDark = indicesDark(WIDE).length

      // The last column of this text is lit, so the wave leads from the board's right edge.
      const lastCol = bitmap(WIDE).cols - 1
      const startOf = (col: number) => (lastCol - col) * STAGGER_MS

      it('creates only the columns whose turn is near, not the whole board', async () => {
        const animate = stubAnimate()
        mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()

        const dueNow = indicesDark(WIDE).filter(
          (i) => startOf(i % bitmap(WIDE).cols) <= CREATE_LEAD_MS,
        ).length
        expect(animate).toHaveBeenCalledTimes(dueNow)
        expect(dueNow).toBeLessThan(wideDark / 4)
      })

      it('has created every one of them by the end of the wave', async () => {
        const animate = stubAnimate()
        mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        await advance(startOf(0) + CREATE_LEAD_MS)
        expect(animate).toHaveBeenCalledTimes(wideDark)
      })

      // The point of the whole change: nothing about the reveal may look different. A column still
      // starts exactly `(lead - col) * STAGGER_MS` after the resolve — the later creation is paid
      // for out of the delay, not out of the viewer's timing.
      it('keeps every column starting when it always did', async () => {
        const animate = stubAnimate()
        mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        const t0 = performance.now()
        await advance(startOf(0) + CREATE_LEAD_MS)

        const rows = schedule(animate, t0)
        expect(rows).toHaveLength(wideDark)
        const off = rows.filter((r) => r.start !== startOf(r.col))
        expect(off).toEqual([])
      })

      it('creates each column ahead of its turn, never after it', async () => {
        const animate = stubAnimate()
        mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        const t0 = performance.now()
        await advance(startOf(0) + CREATE_LEAD_MS)

        const late = schedule(animate, t0).filter((r) => r.createdAfter > r.start)
        expect(late).toEqual([])
      })

      // With creation deferred, the dot's own `fill` attribute is already the resolved colour while
      // its animation — which used to hold the pre-state via `fill: 'backwards'` — does not exist
      // yet. Without a hold of its own, the left of the board would show its digits before the wave
      // ever reaches it, and the flip would read as a correction rather than a reveal.
      it('holds a dot at its pre-flip colour until its own turn', async () => {
        const animate = stubAnimate()
        const w = mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()

        // Everything still white except the dots whose animation has just been created.
        expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
          bitmap(WIDE).on.length - animate.mock.calls.length,
        )

        await advance(startOf(0) + CREATE_LEAD_MS)
        expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
          bitmap(WIDE).on.filter(Boolean).length,
        )
      })

      it('stops creating after being unmounted mid-wave', async () => {
        const animate = stubAnimate()
        const w = mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        const created = animate.mock.calls.length
        w.unmount()
        await advance(startOf(0) + CREATE_LEAD_MS)
        expect(animate).toHaveBeenCalledTimes(created)
      })

      // The header's value changes every second, so a tick lands inside the ~500 ms reveal all by
      // itself — and cycling the unit by tapping does it on purpose. The reveal must not be
      // abandoned there: dropping the columns that had not had their turn made the left half of the
      // board *appear* instead of flip, which reads as the switch-on breaking off half way.
      it('keeps the wave rolling when a new value arrives mid-reveal', async () => {
        const animate = stubAnimate()
        const w = mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        await advance(4 * STAGGER_MS)
        const t0 = performance.now()

        await w.setProps({ text: '02:15:07:32' })
        await nextTick()
        await advance(startOf(0) + CREATE_LEAD_MS)

        // Every column still holding white when the new value arrived must have flipped since.
        const flipped = new Set(schedule(animate, t0).map((r) => r.col))
        const owed = new Set(
          indicesDark('02:15:07:32')
            .map((i) => i % bitmap(WIDE).cols)
            .filter((col) => startOf(col) > 4 * STAGGER_MS),
        )
        expect([...owed].filter((col) => !flipped.has(col))).toEqual([])
      })

      it('lands on the new value, not the one the reveal started with', async () => {
        stubAnimate()
        const w = mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        await advance(4 * STAGGER_MS)

        await w.setProps({ text: '02:15:07:32' })
        await nextTick()
        await advance(startOf(0) + CREATE_LEAD_MS)
        expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
          bitmap('02:15:07:32').on.filter(Boolean).length,
        )
      })

      // Vue's patch does not know about the hold — it diffs against its own previous vnode — so a
      // dot whose colour changed with the new value gets its resolved colour written straight over
      // the white it was being held at, and lights up ahead of the wave.
      it('holds the columns that have not had their turn through the change', async () => {
        stubAnimate()
        const w = mount(FlipDotBoard, { props: { text: WIDE, label: 'x' } })
        await bootDone()
        const held = fills(w).filter((f) => f === DOT_ON).length

        await w.setProps({ text: '02:15:07:32' })
        await nextTick()
        expect(fills(w).filter((f) => f === DOT_ON).length).toBe(held)
      })
    })

    it('fires no timer after being unmounted inside the hold', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      animate.mockClear()
      expect(vi.getTimerCount()).toBe(1)
      expect(w.emitted('phase')).toEqual([['white']]) // see the note above about unmount()
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
    })
  })
})
