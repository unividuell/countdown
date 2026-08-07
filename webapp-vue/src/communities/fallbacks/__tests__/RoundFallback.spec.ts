import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'
import type { CommunityResponse, CountdownResponse, RosterMemberResponse } from '@/api/types'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
import { _resetCountdownState } from '@/communities/useCountdown'

const community = (startsAt: string | null): CommunityResponse => ({
  id: 'c1',
  name: 'Team',
  slug: 'team',
  startsAt,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
})

const before: CountdownResponse = {
  serverNow: '2026-06-14T21:00:00Z',
  startsAt: '2026-08-11T09:00:00Z',
  startsAtTimezone: 'Europe/Berlin',
  round: { number: 58, label: 'T-58', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
  nextRound: null,
}

const after: CountdownResponse = {
  serverNow: '2026-06-14T21:00:00Z',
  startsAt: '2026-06-14T09:00:00Z',
  startsAtTimezone: 'Europe/Berlin',
  round: { number: -1, label: 'T+1', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
  nextRound: null,
}

function member(fullName: string, stable: number): RosterMemberResponse {
  return {
    userId: fullName,
    shortName: fullName.slice(0, 3).toUpperCase(),
    fullName,
    bgColorHex: '#8e44ad',
    points: { stable },
  }
}

// The countdown clock is a module-level singleton: a wrapper left mounted keeps reacting to it and
// would fetch inside the *next* test case.
enableAutoUnmount(afterEach)

function mountFallback(startsAt: string | null, members: RosterMemberResponse[] | null = []) {
  return mount(RoundFallback, { props: { community: community(startsAt), members } })
}

describe('RoundFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z'))
    _resetCountdownState()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says the community has no date yet, without asking the server', async () => {
    const spy = vi.spyOn(api, 'getCountdown')
    const w = mountFallback(null)
    await flushPromises()
    expect(w.find('[data-test="fallback-no-date"]').text()).toContain('Noch kein Termin')
    expect(w.text()).toContain('Diese Spielgemeinschaft entsteht gerade.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('reserves the space while the countdown is still in flight', () => {
    vi.spyOn(api, 'getCountdown').mockReturnValue(new Promise(() => {}))
    const w = mountFallback('2026-08-11T09:00:00Z')
    expect(w.find('[data-test="fallback-placeholder"]').exists()).toBe(true)
  })

  it('shows the board while the countdown runs', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(before)
    const w = mountFallback('2026-08-11T09:00:00Z')
    await flushPromises()
    expect(w.find('[data-test="countdown-card"]').exists()).toBe(true)
    expect(w.find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '58 Tage bis zum Start',
    )
  })

  it('congratulates the winner once the event runs', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 12), member('leela', 9)])
    await flushPromises()
    expect(w.find('[data-test="fallback-winner"]').text()).toContain('Herzlichen Glückwunsch, fry!')
    expect(w.text()).toContain('Und jetzt viel Spaß zusammen!')
  })

  it('names everyone tied at the top', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 12), member('leela', 12)])
    await flushPromises()
    expect(w.find('[data-test="fallback-winner"]').text()).toContain(
      'Herzlichen Glückwunsch, fry und leela!',
    )
  })

  it('congratulates nobody when nobody has scored', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 0), member('leela', 0)])
    await flushPromises()
    expect(w.find('[data-test="fallback-running"]').text()).toContain(
      'Und jetzt viel Spaß zusammen!',
    )
    expect(w.text()).not.toContain('Glückwunsch')
  })

  it('waits for the roster instead of flashing a winnerless message', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', null)
    await flushPromises()
    expect(w.find('[data-test="fallback-placeholder"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Spaß')
  })

  it('never announces that the event is running', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 0)])
    await flushPromises()
    expect(w.text()).not.toContain('Event läuft')
  })
})
