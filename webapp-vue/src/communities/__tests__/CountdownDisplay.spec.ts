import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'
import { _resetCountdownState } from '@/communities/useCountdown'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'

// The countdown clock is a module-level singleton: a wrapper left mounted keeps reacting to it and
// would fetch inside the *next* test case.
enableAutoUnmount(afterEach)

describe('CountdownDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z')) // 12h before round end
    _resetCountdownState()
  })
  afterEach(() => vi.useRealTimers())

  it('renders the ticking countdown for the active community', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: {
        number: 9,
        label: 'T-9',
        start: '2026-06-15T09:00:00Z',
        end: '2026-06-16T09:00:00Z',
      },
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    // 10 days to the start, 12 hours to the round boundary. The leading group is padded so the
    // board keeps its width across a day boundary.
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('10:12:00:00')
    expect(w.getComponent(FlipDotLegend).props('labels')).toEqual(['TAGE', 'STD', 'MIN', 'SEK'])
    expect(w.getComponent(FlipDotBoard).props('label')).toContain('10 Tage')
    // The button, not the board, must carry the accessible name: Chromium doesn't pull a child
    // img's aria-label up into its role="button" ancestor's name from content.
    expect(w.find('[data-test="countdown"]').attributes('aria-label')).toContain('10 Tage')
  })

  it('cycles the base unit on click', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    await w.find('[data-test="countdown"]').trigger('click')
    // months + weeks + days now, so six groups and six labels — the widest state the board has.
    expect(w.getComponent(FlipDotLegend).props('labels')).toEqual([
      'MON',
      'WO',
      'TAGE',
      'STD',
      'MIN',
      'SEK',
    ])
    expect(w.getComponent(FlipDotBoard).props('text').split(':')).toHaveLength(6)
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('00:1:3:12:00:00')
  })

  it('stops fetching after unmount', async () => {
    const spy = vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: {
        number: 9,
        label: 'T-9',
        start: '2026-06-15T09:00:00Z',
        end: '2026-06-16T09:00:00Z',
      },
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const callsBefore = spy.mock.calls.length
    w.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    expect(spy.mock.calls.length).toBe(callsBefore) // interval cleared on unmount; no further fetches
  })

  it('degrades to hidden (no throw) when the countdown fetch fails', async () => {
    vi.spyOn(api, 'getCountdown').mockRejectedValue(new Error('offline'))
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.find('[data-test="countdown"]').exists()).toBe(false) // idle → renders nothing
  })

  it('retries a first load that failed, instead of staying idle forever', async () => {
    const spy = vi
      .spyOn(api, 'getCountdown')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        serverNow: '2026-06-14T21:00:10Z',
        startsAt: '2026-06-25T09:00:00Z',
        startsAtTimezone: 'Europe/Berlin',
        round: {
          number: 10,
          label: 'T-10',
          start: '2026-06-14T09:00:00Z',
          end: '2026-06-15T09:00:00Z',
        },
        nextRound: null,
      })
    spy.mockClear()
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.find('[data-test="countdown"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    await flushPromises()
    expect(spy.mock.calls.length).toBe(2) // retried once, not once per second
    expect(w.find('[data-test="countdown"]').exists()).toBe(true)
  })

  // Joining the shared clock writes nowMs, so a tick lands in the same frame as the mount and
  // reaches the retry branch immediately. It must not read "no attempt recorded yet" as "attempted
  // long enough ago" and fetch a second time. The clock is deliberately left stale by a full retry
  // interval: with nowMs equal to Date.now(), subscribing writes the value it already had, no
  // watcher fires, and this test could not fail. Verified against the regression it guards — moving
  // load()'s lastAttemptMs assignment after its await makes this fetch twice.
  it('fetches once on a first mount, not twice', async () => {
    const spy = vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    spy.mockClear()
    vi.setSystemTime(new Date('2026-06-14T21:00:10Z'))
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(spy.mock.calls.length).toBe(1)
  })

  it('counts up without announcing the event, which the fallback card now says', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-14T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: -1,
        label: 'T+1',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')
    expect(el.exists()).toBe(true)
    expect(w.getComponent(FlipDotBoard).props('label')).toContain('Laufzeit')
    expect(el.attributes('title')).toBeUndefined()
    // This is the state with no title fallback at all, so the aria-label is the only thing that
    // can name the button — worst off if it were ever missing.
    expect(el.attributes('aria-label')).toContain('Laufzeit')
    expect(el.attributes('aria-label')).toContain('12 Stunden')
  })

  it('pads only the leading group, so the widest state still fits the header', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 5,
        label: 'T-5',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('05:12:00:00')
  })

  it('hides the board from assistive tech, since the button now carries the reading itself', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    // Guards against a future change re-announcing the value a second time, as a separate image
    // nested inside the already-named button.
    expect(w.find('[data-test="countdown-board"]').attributes('aria-hidden')).toBe('true')
  })

  // A native button rather than a div wearing role="button": the hand-rolled version worked in
  // Chromium and was reported dead in Firefox, so click, Enter, Space, focus order and Space's
  // scroll-prevention all come from the browser now. That is what this asserts — the element's
  // identity — because the behaviours themselves are the UA's and cannot be observed in happy-dom.
  // A regression here would be someone turning it back into a div, which is exactly the shape the
  // engines disagreed about.
  it('is a real button, so the browser owns click, keyboard and focus', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')
    expect(el.element.tagName).toBe('BUTTON')
    expect(el.attributes('type')).toBe('button')
    // No hand-rolled affordances left to drift out of sync with the native ones.
    expect(el.attributes('role')).toBeUndefined()
    expect(el.attributes('tabindex')).toBeUndefined()
    // Tailwind v4's preflight gives buttons no pointer, and without one nothing marks the board as
    // a control — which is how it came to be reported as "not clickable" in the first place.
    expect(el.classes()).toContain('cursor-pointer')
  })

  // A <button>'s content model is phrasing only, so a <div> in there is invalid markup — and invalid
  // markup inside an interactive element is precisely where engines start disagreeing.
  it('keeps its contents valid inside a button', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.find('[data-test="countdown"] div').exists()).toBe(false)
  })

  it('still cycles on click', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')

    await el.trigger('click')
    expect(w.getComponent(FlipDotLegend).props('labels')).toHaveLength(6) // months + weeks + days

    await el.trigger('click')
    expect(w.getComponent(FlipDotLegend).props('labels')).toHaveLength(5) // weeks + days
  })

  it('describes what pressing the button does, not just what it is', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')
    const describedById = el.attributes('aria-describedby')
    expect(describedById).toBeTruthy()
    const hint = w.find(`#${describedById}`)
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('Zeiteinheit')
  })

  it('caps the board width instead of letting it push the header apart', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    // happy-dom computes no CSS, so the classes are the observable proxy: a fixed height with an
    // automatic width is what keeps the dot size constant, and max-w-full is the net below 360px.
    const board = w.find('[data-test="countdown-board"]')
    expect(board.classes()).toContain('h-[26px]')
    expect(board.classes()).toContain('w-auto')
    expect(board.classes()).toContain('max-w-full')
    // The board's percentage cap needs a definite width to resolve against, and the legend takes
    // its own width from the same box — so the wrapper states fit-content instead of relying on
    // shrink-to-fit.
    const wrapper = w.find('[data-test="countdown"]')
    expect(wrapper.classes()).toContain('w-fit')
    expect(wrapper.classes()).toContain('max-w-full')
  })
})
