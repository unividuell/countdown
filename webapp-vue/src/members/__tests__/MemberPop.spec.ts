import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { RosterMemberResponse } from '@/api/types'
import MemberPop, { POP_MS, SWAP_MS } from '../MemberPop.vue'

const before: RosterMemberResponse = {
  userId: 'me',
  shortName: 'BNDR',
  fullName: 'Bender',
  bgColorHex: '#8e44ad',
  points: { stable: 4 },
  streak: 9,
}
const after: RosterMemberResponse = {
  ...before,
  points: { stable: 4, live: { points: 7, provisional: false } },
  streak: 10,
}

describe('MemberPop', () => {
  let animate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    animate = vi.fn(() => ({ finished: Promise.resolve() }))
    Object.defineProperty(Element.prototype, 'animate', {
      value: animate,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(Element.prototype, 'animate')
  })

  const props = { before, after, streak: 9, x: 120, y: 150 }
  const live = (w: ReturnType<typeof mount>) => w.get('[data-test="live-points"]').text()

  // Shown at the verdict, so the points change happens in view.
  it('shows the standing before the verdict, then after it', async () => {
    const w = mount(MemberPop, { props })
    expect(w.text()).toContain('BNDR')
    expect(live(w)).toBe('')

    vi.advanceTimersByTime(SWAP_MS)
    await nextTick()
    expect(live(w)).toBe('+7')
    w.unmount()
  })

  it('flares when the row lets the streak rise', async () => {
    const w = mount(MemberPop, { props })
    await w.setProps({ streak: 10 })
    await nextTick()

    const mark = w.get('[data-test="streak-mark"]')
    expect(mark.attributes('data-band')).toBe('flame-blue')
    expect(animate.mock.contexts).toContain(mark.element)
    w.unmount()
  })

  it('stands centred on the given spot, at one and a half', () => {
    const w = mount(MemberPop, { props })
    const pop = w.get<HTMLElement>('[data-test="member-pop"]').element
    const box = w.get<HTMLElement>('[data-test="member-pop-box"]').element

    expect(pop.style.left).toBe('120px')
    expect(pop.style.top).toBe('150px')
    expect(pop.style.transform).toBe('scale(1.5)')
    expect(box.style.left).toBe('-24px')
    expect(box.style.top).toBe('-24px')
    w.unmount()
  })

  it('is done once it has faded out', () => {
    const w = mount(MemberPop, { props })

    vi.advanceTimersByTime(POP_MS - 1)
    expect(w.emitted('done')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(w.emitted('done')).toHaveLength(1)
    w.unmount()
  })

  it('leaves no timer behind when it unmounts early', () => {
    const w = mount(MemberPop, { props })
    w.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
