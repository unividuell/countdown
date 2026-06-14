import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'

describe('CountdownDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z')) // 12h before round end
  })
  afterEach(() => vi.useRealTimers())

  it('renders the ticking countdown for the active community', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: { number: 9, label: 'T-9', start: '2026-06-15T09:00:00Z', end: '2026-06-16T09:00:00Z' },
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.text()).toContain('T-')
    expect(w.text()).toContain('10') // |round.number| days
    expect(w.text()).toContain('12') // hours to next boundary
  })

  it('cycles the base unit on click', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    await w.find('[data-test="countdown"]').trigger('click')
    expect(w.text()).toMatch(/\dw/) // a weeks chip appears after one cycle
  })

  it('stops fetching after unmount', async () => {
    const spy = vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: { number: 10, label: 'T-10', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
      nextRound: { number: 9, label: 'T-9', start: '2026-06-15T09:00:00Z', end: '2026-06-16T09:00:00Z' },
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
})
