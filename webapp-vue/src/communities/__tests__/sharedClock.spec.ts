import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'
import type { CommunityResponse } from '@/api/types'
import CountdownDisplay from '@/communities/CountdownDisplay.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import { _resetCountdownState } from '@/communities/useCountdown'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { BOOT_RESOLVE_AT_MS } from '@/ui/flipdot/board'

const community: CommunityResponse = {
  id: 'c1',
  name: 'Team',
  slug: 'team',
  startsAt: '2026-06-25T09:00:00Z',
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
}

// serverNow follows the fake client clock, so every load computes a skew of 0. Without that, an
// instance mounted late would offset its own late nowMs by its own skew and land on the same
// rendered second by accident — hiding exactly the desync these tests are about.
function stubCountdown() {
  return vi.spyOn(api, 'getCountdown').mockImplementation(() =>
    Promise.resolve({
      serverNow: new Date(Date.now()).toISOString(),
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    }),
  )
}

enableAutoUnmount(afterEach)

const mountHeader = () => mount(CountdownDisplay, { props: { slug: 'team' } })
const mountCard = () => mount(RoundFallback, { props: { community, members: [] } })

// The header no longer renders its digits as text — they are dots on an <svg> — so the seconds
// group is read off the board's own text prop instead of the DOM text.
function headerSeconds(w: ReturnType<typeof mountHeader>): string | undefined {
  return w.getComponent(FlipDotBoard).props('text').split(':').pop()
}

function cardSeconds(w: ReturnType<typeof mountCard>): string | undefined {
  return w.find('[data-test="countdown-strip"]').attributes('aria-label')?.slice(-2)
}

describe('countdown shared clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z')) // 12h before round end
    _resetCountdownState()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('drives both countdowns from a single interval', async () => {
    stubCountdown()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const header = mountHeader()
    await flushPromises()
    expect(headerSeconds(header)).toBe('00')

    await vi.advanceTimersByTimeAsync(500) // mid-second: the second consumer joins out of phase
    const card = mountCard()
    await flushPromises()

    expect(setIntervalSpy.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(1)
    expect(cardSeconds(card)).toBe(headerSeconds(header))

    await vi.advanceTimersByTimeAsync(500)
    expect(headerSeconds(header)).toBe('59') // the shared tick reached the header
    expect(cardSeconds(card)).toBe(headerSeconds(header))
  })

  // Both consumers mount in the same tick on a community page, and each used to ask for the same
  // slug's countdown — two XHRs a millisecond apart, measured in the browser. A load in flight is
  // joined now. What is *not* shared is the state built from the response, so the header's unit cycle
  // still cannot rewrite the card's readout.
  it('asks the backend once when both countdowns mount together', async () => {
    const spy = stubCountdown()
    const header = mountHeader()
    const card = mountCard()
    await flushPromises()

    expect(spy).toHaveBeenCalledTimes(1)
    // Both are fed by it, not just whichever one issued it.
    expect(headerSeconds(header)).toBe('00')
    expect(cardSeconds(card)).toBe('00')
  })

  it('gives a later consumer its own request rather than a settled one', async () => {
    const spy = stubCountdown()
    mountHeader()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500)
    mountCard()
    await flushPromises()

    // Joining covers a request still in flight, and nothing beyond it: a consumer arriving after the
    // first load settled must not be handed a response that has had time to go stale.
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('keeps ticking until the last consumer unmounts', async () => {
    const spy = stubCountdown()
    const header = mountHeader()
    const card = mountCard()
    await flushPromises()
    // getTimerCount() sees every pending timer, and the card's two flip-dot boards each hold the
    // timeouts of their switch-on sequence. Drain them so the count below is about the clock.
    await vi.advanceTimersByTimeAsync(BOOT_RESOLVE_AT_MS)

    header.unmount()
    expect(vi.getTimerCount()).toBe(1) // one consumer left, clock untouched

    await vi.advanceTimersByTimeAsync(1000)
    expect(cardSeconds(card)).toBe('59')

    const callsBefore = spy.mock.calls.length
    card.unmount()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(spy.mock.calls.length).toBe(callsBefore)
  })

  it('releases the clock on reset, so a later mount starts a fresh one', async () => {
    stubCountdown()
    mountHeader() // still mounted at reset time, as a leaky test case would leave it
    await flushPromises()
    // The header's own board holds boot timers of its own until it relights; drain them so the
    // count below is about the clock, not the board's switch-on sequence. Restore the system
    // clock afterwards so the drain's 400ms is invisible to the seconds arithmetic below.
    await vi.advanceTimersByTimeAsync(BOOT_RESOLVE_AT_MS)
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z'))
    expect(vi.getTimerCount()).toBe(1)

    _resetCountdownState()
    expect(vi.getTimerCount()).toBe(0)

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const card = mountCard()
    await flushPromises()
    expect(setIntervalSpy.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(cardSeconds(card)).toBe('59')
  })
})
