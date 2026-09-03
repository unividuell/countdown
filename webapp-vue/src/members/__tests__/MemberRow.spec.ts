import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { RosterMemberResponse } from '@/api/types'
import MemberRow from '../MemberRow.vue'
import * as swarmModule from '../swarm'
import { RISER_SEEK, YIELD_SEEK } from '../reorder'

function member(over: Partial<RosterMemberResponse> = {}): RosterMemberResponse {
  return {
    userId: '0190f1b2-0000-7000-8000-000000000001',
    shortName: 'AMY',
    fullName: 'amy',
    bgColorHex: '#8e44ad',
    points: { stable: 3 },
    ...over,
  }
}

function reduceMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

/**
 * happy-dom computes no layout, so every rect would be zero and nobody would ever have moved.
 * This models the only geometry the row has: fixed-width columns, so a member's place follows
 * its place in the DOM — which is exactly what a reorder changes.
 */
function stubRowGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const item = this.closest('[data-swarm-item]')
    if (!item?.parentElement) return { left: 0, top: 0, width: 0, height: 0 } as DOMRect
    const index = [...item.parentElement.children].indexOf(item)
    return { left: 40 * index, top: 100, width: 48, height: 48 } as DOMRect
  })
}

interface FakeSwarm {
  options: swarmModule.SwarmOptions
  done: boolean
}

/** Captures what the row asked for, and lets the test decide when the movement is over. */
function captureSwarms(): FakeSwarm[] {
  const created: FakeSwarm[] = []
  vi.spyOn(swarmModule, 'createSwarm').mockImplementation((options) => {
    const fake: FakeSwarm = { options, done: false }
    created.push(fake)
    return {
      particles: options.targets.map((t) => ({
        x: t.start?.x ?? t.x,
        y: t.start?.y ?? t.y,
        vx: 0,
        vy: 0,
        tx: t.x,
        ty: t.y,
        seekScale: t.seekScale ?? 1,
        detour: t.detour ?? { x: 0, y: 0 },
        tilt: 0,
        wander: 0,
      })),
      get finished() {
        return fake.done
      },
      step: () => {},
    }
  })
  return created
}

async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(() => r(null)))
}

const ROW = [
  member({ userId: 'a', shortName: 'A', fullName: 'Anna', points: { stable: 9 } }),
  member({ userId: 'b', shortName: 'B', fullName: 'Bea', points: { stable: 6 } }),
  member({ userId: 'me', shortName: 'ME', fullName: 'Ich', points: { stable: 3 } }),
]
/** „me“ overtakes Bea. */
const RISEN = [ROW[0]!, ROW[2]!, ROW[1]!]

describe('MemberRow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one circle per member, in the order the server sent', () => {
    reduceMotion(true)
    const w = mount(MemberRow, {
      props: {
        members: [
          member({
            userId: 'a',
            shortName: 'BNDR',
            fullName: 'Bender',
            bgColorHex: '#8e44ad',
            points: { stable: 10 },
          }),
          member({ userId: 'b', shortName: 'AMY', fullName: 'amy', points: { stable: 3 } }),
        ],
      },
    })
    const items = w.findAll('[data-swarm-item]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('BNDR')
    expect(items[1]?.text()).toContain('AMY')

    // Proof that the shared Avatar still draws the roster the way it used to: the DOM may hand
    // back an inline colour either as written or normalised to rgb() (see Avatar.spec.ts).
    const circle = w.find('[data-swarm-circle]')
    expect(circle.attributes('style')).toMatch(/#8e44ad|rgb\(142, 68, 173\)/)
    expect(circle.classes()).toContain('size-12')
  })

  it('names each circle for assistive technology', () => {
    reduceMotion(true)
    const w = mount(MemberRow, {
      props: {
        members: [
          member({ fullName: 'Turanga Leela', points: { stable: 3 } }),
          member({
            userId: 'b',
            fullName: 'Philip J. Fry',
            points: { stable: 7, live: { points: 5, provisional: true } },
          }),
        ],
      },
    })
    const items = w.findAll('[data-swarm-item]')
    // A plain <div>'s implicit role is `generic`, for which ARIA prohibits an author-supplied
    // name — without `role="img"`, aria-label is silently dropped from the accessibility tree.
    expect(items[0]?.attributes('role')).toBe('img')
    expect(items[0]?.attributes('title')).toContain('Turanga Leela')
    // `role="img"` also prunes descendant text from the accessibility tree, so a member with no
    // live points must get no dangling suffix...
    expect(items[0]?.attributes('aria-label')).toBe('Turanga Leela, 3 Punkte')
    // ...while one with live points must have them folded into the label, since the `+N` badge's
    // text node is no longer exposed to assistive technology. „vorläufig“ belongs in there too: the
    // colour and the pulse that carry it visually say nothing to a screen reader.
    expect(items[1]?.attributes('aria-label')).toBe(
      'Philip J. Fry, 7 Punkte, diese Runde vorläufig +5',
    )
  })

  it('spells out a settled round and an empty one for assistive technology', () => {
    reduceMotion(true)
    const w = mount(MemberRow, {
      props: {
        members: [
          member({
            fullName: 'Hermes',
            points: { stable: 7, live: { points: 5, provisional: false } },
          }),
          member({
            userId: 'b',
            fullName: 'Zoidberg',
            points: { stable: 2, live: { points: 0, provisional: false } },
          }),
        ],
      },
    })
    const items = w.findAll('[data-swarm-item]')
    expect(items[0]?.attributes('aria-label')).toBe('Hermes, 7 Punkte, diese Runde +5')
    expect(items[1]?.attributes('aria-label')).toBe('Zoidberg, 2 Punkte, diese Runde ohne Punkte')
  })

  it('shows the live chip for everyone who played, a scoreless round included', () => {
    reduceMotion(true)
    const with_ = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 5, provisional: true } } })],
      },
    })
    expect(with_.find('[data-test="live-points"]').text()).toBe('+5')

    // Played and came away empty is a result the row has to say out loud — the old `v-if` on the
    // number itself swallowed it, because `0` is falsy.
    const empty = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 0, provisional: false } } })],
      },
    })
    expect(empty.find('[data-test="live-points"]').text()).toBe('💀')
  })

  it('pulses only while the points can still be taken away', () => {
    reduceMotion(true)
    const provisional = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 5, provisional: true } } })],
      },
    })
    expect(provisional.find('[data-test="live-points"]').classes()).toContain('animate-pulse')

    // Settled points hold still and go dark — a chip that keeps pulsing after the number is final
    // promises a change that cannot come, and one in the badge's yellow stacks into it.
    const settled = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 5, provisional: false } } })],
      },
    })
    const classes = settled.find('[data-test="live-points"]').classes()
    expect(classes).not.toContain('animate-pulse')
    expect(classes).toContain('bg-neutral-900')
    expect(classes).not.toContain('bg-yellow-400')

    // Scored or scoreless, a finished round is the same state and wears the same chip.
    const empty = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 0, provisional: false } } })],
      },
    })
    expect(empty.find('[data-test="live-points"]').classes()).toContain('bg-neutral-900')
  })

  it('paints a provisional chip in the shared live colour, not a local one', () => {
    reduceMotion(true)
    // One meaning, one colour: the scoreboard's live chip uses the same token. A raw `bg-rose-600`
    // here is how the two would drift the first time either is touched.
    const provisional = mount(MemberRow, {
      props: {
        members: [member({ points: { stable: 3, live: { points: 2, provisional: true } } })],
      },
    })

    expect(provisional.get('[data-test="live-points"]').classes()).toContain('bg-live')
  })

  it('keeps the chip line for members who have not played, so the row cannot jump', () => {
    reduceMotion(true)
    // The chip is hidden, not absent: dropping it out of the flow shortens the row by its own
    // height, and the surrounding section centres what is left — which is the vertical jump the
    // roster made the moment the first live points landed.
    const w = mount(MemberRow, { props: { members: [member()] } })
    const chip = w.find('[data-test="live-points"]')
    expect(chip.exists()).toBe(true)
    expect(chip.classes()).toContain('invisible')
  })

  it('does not animate when the viewer asked for reduced motion', async () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 20))
    expect(w.find('[data-swarm-item]').attributes('style') ?? '').not.toContain('translate3d')
    expect(w.find('[data-test="row"]').attributes('style') ?? '').toContain('visible')
  })

  it('does not clip while flying, then goes auto once settled', async () => {
    // The row itself must never clip mid-flight — circles travel far outside it, across the
    // whole viewport. Horizontal containment during the flight lives on the app root instead
    // (see App.vue), not here.
    reduceMotion(false)
    const flying = mount(MemberRow, { props: { members: [member()] } })
    const flyingClasses = flying.find('[data-test="row"]').classes()
    expect(flyingClasses).toContain('overflow-visible')
    expect(flyingClasses).not.toContain('overflow-x-clip')
    expect(flyingClasses).not.toContain('overflow-y-visible')
    flying.unmount()

    // The reduced-motion path settles in `onMounted` itself; still a tick away from the DOM
    // because the `settled` ref's class update is applied via Vue's reactive render, not
    // written imperatively like the `visibility` style is.
    reduceMotion(true)
    const settled = mount(MemberRow, { props: { members: [member()] } })
    await nextTick()
    expect(settled.find('[data-test="row"]').classes()).toContain('overflow-x-auto')
  })

  // Firefox restores a scroll container's offset from session history on reload, and applies it
  // when the element becomes one — which here is the moment the fly-in settles and the row turns
  // `overflow-x: auto`. Both settle paths must therefore take the scroll position back: the row is
  // a ranking, so a refresh has to show the leader, not wherever the reader left off.
  async function afterSettle(w: ReturnType<typeof mount>, restored: number): Promise<HTMLElement> {
    const el = w.find('[data-test="row"]').element as HTMLElement
    // Stand in for the browser's restore, which lands in the reflow that first builds the
    // scroll frame — i.e. after the class flip, before the row's own correction.
    el.scrollLeft = restored
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    return el
  }

  it('scrolls back to the leader when the flight settles', async () => {
    reduceMotion(false)
    vi.spyOn(swarmModule, 'createSwarm').mockReturnValue({
      particles: [
        {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          tx: 0,
          ty: 0,
          seekScale: 1,
          detour: { x: 0, y: 0 },
          tilt: 0,
          wander: 0,
        },
      ],
      finished: true,
      step: () => {},
    })
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })

    const el = await afterSettle(w, 149)

    expect(w.find('[data-test="row"]').classes()).toContain('overflow-x-auto')
    expect(el.scrollLeft).toBe(0)
    w.unmount()
  })

  it('scrolls back to the leader under reduced motion, where there is no flight', async () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })

    const el = await afterSettle(w, 149)

    expect(el.scrollLeft).toBe(0)
    w.unmount()
  })

  it('cancels its animation frame when unmounted mid-flight', async () => {
    reduceMotion(false)
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame')
    // A single member: with happy-dom zeroing getBoundingClientRect, several members would all
    // share the target (0, 0) and sit inside each other's collision radius forever, which is
    // noise this lifecycle test doesn't need.
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 0))
    expect(rafSpy).toHaveBeenCalled()

    w.unmount()
    expect(cafSpy).toHaveBeenCalled()
  })

  it('feeds the swarm the layout viewport and a margin that clears the tilted column', () => {
    reduceMotion(false)
    // happy-dom zeroes every getBoundingClientRect, so stub a realistic geometry: a 48x58
    // column with its 48x48 circle flush against the top (the shape a `+N` live badge produces).
    const colRect = { left: 100, top: 100, width: 48, height: 58 } as DOMRect
    const circleRect = { left: 100, top: 100, width: 48, height: 48 } as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-swarm-circle')) return circleRect
      if (this.hasAttribute('data-swarm-item')) return colRect
      return { left: 0, top: 0, width: 0, height: 0 } as DOMRect
    })
    const spy = vi.spyOn(swarmModule, 'createSwarm')

    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })

    expect(spy).toHaveBeenCalledTimes(1)
    const options = spy.mock.calls[0]?.[0]
    expect(options?.stage).toEqual({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    })
    // hw=24, hh=29, tilt=18°: hw2≈31.8, hh2≈35.0, circle centred 5px above the column centre
    // (d=(0,5)) — so the binding constraint is the vertical one, margin = hh2 + 5 = 40.
    expect(options?.tuning.wallRadius).toBeCloseTo(40, 0)

    w.unmount()
  })

  describe('rearranging after new points', () => {
    /**
     * Mounted under reduced motion so the entrance is out of the way and every swarm captured
     * below is the rearrangement's. The two are independent questions asked at their own moments
     * (see `ui/motion.ts`), which is why the row still rearranges once the answer changes.
     */
    async function mountSettled(meId?: string) {
      reduceMotion(true)
      const w = mount(MemberRow, { props: { members: ROW, meId }, attachTo: document.body })
      await nextTick()
      reduceMotion(false)
      return w
    }

    /**
     * The browser drains all of this before it paints; a test has to walk it tick by tick. One for
     * the reorder itself, which the pre-flush watcher defers until the new order is in the DOM,
     * and one for the lifted stacking order it then asks Vue to render.
     */
    async function rearrangeTo(w: ReturnType<typeof mount>, members: RosterMemberResponse[]) {
      await w.setProps({ members })
      await nextTick()
      await nextTick()
    }

    function zOf(w: ReturnType<typeof mount>, id: string): number {
      const style = w.find(`[data-member-id="${id}"]`).attributes('style') ?? ''
      return Number(/z-index:\s*(\d+)/.exec(style)?.[1])
    }

    it('travels from the places the members held to the ones they now hold', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')

      await rearrangeTo(w, RISEN)

      expect(swarms).toHaveLength(1)
      // Particles follow the new order: a, me, b. „me“ comes from the third place it stood in.
      expect(swarms[0]!.options.targets.map((t) => [t.start, { x: t.x, y: t.y }])).toEqual([
        [
          { x: 24, y: 124 },
          { x: 24, y: 124 },
        ],
        [
          { x: 104, y: 124 },
          { x: 64, y: 124 },
        ],
        [
          { x: 64, y: 124 },
          { x: 104, y: 124 },
        ],
      ])
      w.unmount()
    })

    it('hands my own rise the spring that boxes, and the row it comes through the one that yields', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')

      await rearrangeTo(w, RISEN)

      // Wiring only — which spring belongs to whom is settled in reorder.spec.ts.
      expect(swarms[0]!.options.targets.map((t) => t.seekScale ?? 1)).toEqual([
        1,
        RISER_SEEK,
        YIELD_SEEK,
      ])
      w.unmount()
    })

    it('leaves the rise to glide when the row is not mine to box through', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled(undefined)

      await rearrangeTo(w, RISEN)

      expect(swarms[0]!.options.targets.map((t) => t.seekScale ?? 1)).toEqual([1, 1, 1])
      w.unmount()
    })

    it('lifts whoever moves over the members standing still, my own rise on top', async () => {
      stubRowGeometry()
      captureSwarms()
      const w = await mountSettled('me')

      await rearrangeTo(w, RISEN)

      // Otherwise the riser slides *under* the members it overtakes: the resting row stacks
      // leader-first, so everyone it passes is painted above it.
      expect(zOf(w, 'me')).toBeGreaterThan(zOf(w, 'b'))
      expect(zOf(w, 'b')).toBeGreaterThan(zOf(w, 'a'))
      w.unmount()
    })

    it('puts the row back down once the movement is over', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')
      await rearrangeTo(w, RISEN)

      swarms[0]!.done = true
      await frames(2)

      expect(zOf(w, 'me')).toBe(2)
      expect(w.find('[data-member-id="me"]').attributes('style') ?? '').not.toContain('translate3d')
      w.unmount()
    })

    it('stops clipping while the row rearranges, and holds the reader where they were', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')
      const el = w.find('[data-test="row"]').element as HTMLElement
      el.scrollLeft = 60

      await rearrangeTo(w, RISEN)

      // `overflow-x: auto` computes `overflow-y` to `auto` as well, which would cut the banking
      // off at the 72px band. Dropping it costs the row its scroll offset, so the track carries it.
      expect(w.find('[data-test="row"]').classes()).toContain('overflow-visible')
      expect(w.find('[data-test="track"]').attributes('style')).toContain('translateX(-60px)')

      swarms[0]!.done = true
      await frames(2)

      expect(w.find('[data-test="row"]').classes()).toContain('overflow-x-auto')
      expect(w.find('[data-test="track"]').attributes('style') ?? '').not.toContain('translateX')
      expect(el.scrollLeft).toBe(60)
      w.unmount()
    })

    it('does not leave a second animation loop running when a refresh lands mid-movement', async () => {
      // Every frame schedules the next one, so a movement started while another is still going
      // leaves two chains stepping the same swarm — twice the speed, and neither ever stops.
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')
      await rearrangeTo(w, RISEN)
      const caf = vi.spyOn(window, 'cancelAnimationFrame')

      await rearrangeTo(w, ROW)

      expect(swarms).toHaveLength(2)
      expect(caf).toHaveBeenCalled()
      w.unmount()
    })

    it('jumps to the new order when the viewer asked for reduced motion', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      reduceMotion(true)
      const w = mount(MemberRow, {
        props: { members: ROW, meId: 'me' },
        attachTo: document.body,
      })
      await nextTick()

      await rearrangeTo(w, RISEN)

      expect(swarms).toHaveLength(0)
      expect(w.findAll('[data-swarm-item]').map((i) => i.attributes('data-member-id'))).toEqual([
        'a',
        'me',
        'b',
      ])
      w.unmount()
    })

    it('does not rearrange in a background tab, where there is nobody to see it', async () => {
      stubRowGeometry()
      const swarms = captureSwarms()
      const w = await mountSettled('me')
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

      await rearrangeTo(w, RISEN)

      expect(swarms).toHaveLength(0)
      w.unmount()
    })

    it('ends the entrance rather than pulling at the same avatars twice', async () => {
      // The fly-in measured its resting places on mount and cannot be re-aimed mid-air, so a
      // roster that changes underneath it ends it: the row comes to rest in the new order.
      stubRowGeometry()
      const swarms = captureSwarms()
      reduceMotion(false)
      const w = mount(MemberRow, {
        props: { members: ROW, meId: 'me' },
        attachTo: document.body,
      })
      await nextTick()
      expect(swarms).toHaveLength(1)

      await rearrangeTo(w, RISEN)
      await frames(1)

      expect(swarms).toHaveLength(1)
      expect(w.find('[data-test="row"]').classes()).toContain('overflow-x-auto')
      w.unmount()
    })
  })
})
