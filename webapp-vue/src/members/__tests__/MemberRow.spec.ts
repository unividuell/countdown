import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { RosterMemberResponse } from '@/api/types'
import MemberRow from '../MemberRow.vue'
import * as swarmModule from '../swarm'

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
      particles: [{ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tilt: 0, wander: 0 }],
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
})
