import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { defineComponent, h, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import type { RosterMemberResponse } from '@/api/types'
import { SPOILER_HOLD_MS, useRoster } from '../useRoster'

/** useRoster loads on mount, so it needs a host component. */
function host(slug = 'team') {
  const seen: { state?: string; count?: number } = {}
  let roster: ReturnType<typeof useRoster>
  const Cmp = defineComponent({
    setup() {
      roster = useRoster(slug)
      const { members, state } = roster
      return () => {
        seen.state = state.value
        seen.count = members.value.length
        return h('div')
      }
    },
  })
  return { Cmp, seen, roster: () => roster }
}

const alice = {
  userId: '0190f1b2-0000-7000-8000-000000000001',
  shortName: 'AMY',
  fullName: 'amy',
  bgColorHex: '#8e44ad',
  points: { stable: 3 },
}

describe('useRoster', () => {
  it('publishes the roster once it arrives', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([alice])
    const { Cmp, seen } = host()
    mount(Cmp)
    await flushPromises()
    expect(seen.state).toBe('ready')
    expect(seen.count).toBe(1)
  })

  it('reports failure instead of rendering an empty row', async () => {
    vi.spyOn(api, 'getRoster').mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, seen } = host()
    mount(Cmp)
    await flushPromises()
    expect(seen.state).toBe('failed')
    expect(seen.count).toBe(0)
  })

  // The consumer renders the row behind `state === 'ready'`, and MemberRow measures its fly-in once
  // on mount — so a refresh that dipped through 'loading' would unmount the row and replay the
  // flight. New numbers must arrive without that.
  it('refreshes the roster without leaving the ready state', async () => {
    const bob = { ...alice, userId: '0190f1b2-0000-7000-8000-000000000002', points: { stable: 9 } }
    const getRoster = vi
      .spyOn(api, 'getRoster')
      .mockResolvedValueOnce([alice])
      .mockResolvedValueOnce([alice, bob])
    const { Cmp, seen, roster } = host()
    mount(Cmp)
    await flushPromises()
    // This file installs its spies without restoring them, so `vi.spyOn` hands back the same spy
    // across tests and its counter carries earlier tests' calls. Clear the calls (the queued
    // `Once` implementations survive) so the count below is about this test alone.
    getRoster.mockClear()

    const states: string[] = []
    const stop = watch(roster().state, (s) => states.push(s), { flush: 'sync' })
    await roster().refresh()
    stop()

    expect(getRoster).toHaveBeenCalledTimes(1)
    expect(states).toEqual([])
    expect(seen.state).toBe('ready')
    expect(roster().members.value).toHaveLength(2)
  })

  it('keeps the roster it has when a refresh fails', async () => {
    vi.spyOn(api, 'getRoster')
      .mockResolvedValueOnce([alice])
      .mockRejectedValueOnce(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Cmp, roster } = host()
    mount(Cmp)
    await flushPromises()

    await roster().refresh()

    // Stale badges beat an error line replacing the row: the guess itself went through.
    expect(roster().state.value).toBe('ready')
    expect(roster().members.value).toEqual([alice])
  })

  it('requests the roster of the given community', async () => {
    const spy = vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const { Cmp } = host('hütte')
    mount(Cmp)
    await flushPromises()
    expect(spy).toHaveBeenCalledWith('hütte')
  })

  /**
   * The live-points chip is a spoiler of whatever the game is showing right now: the round's points
   * are in the roster's answer the moment the guess is accepted, while the reveal is still building
   * up to them. So the guess gets its own entrance that holds — see `refreshAfterGuess`.
   *
   * `advanceTimersByTimeAsync`, never the synchronous form: `getRoster` resolves through a promise
   * chain, and only the async form drains microtasks between ticks (the same reason the navigation
   * progress spec uses it). It is also how the mount's own load is settled here — `flushPromises`
   * schedules through `setImmediate`, which fake timers replace.
   */
  describe('after a guess', () => {
    let matchMedia: MockInstance | undefined

    afterEach(() => {
      vi.useRealTimers()
      // This file installs its spies without restoring them; a stubbed `matches: true` left behind
      // would silently switch every later case to the reduced-motion path.
      matchMedia?.mockRestore()
      matchMedia = undefined
    })

    /**
     * A roster on screen showing one member, with a second one waiting in the next answer — so a
     * refresh that went through is visible as a length, not only as a call count.
     *
     * `mockReset` before anything else, and a plain implementation rather than `mockResolvedValueOnce`:
     * this file installs its spies without restoring them, so the *queue* survives across tests too,
     * and an earlier case's unconsumed `Once` would be what the mount here reads.
     */
    async function mounted(): Promise<{
      roster: () => ReturnType<typeof useRoster>
      getRoster: MockInstance<typeof api.getRoster>
      unmount: () => void
    }> {
      const bob = {
        ...alice,
        userId: '0190f1b2-0000-7000-8000-000000000002',
        points: { stable: 9 },
      }
      const getRoster = vi.spyOn(api, 'getRoster')
      getRoster.mockReset()
      let answer: RosterMemberResponse[] = [alice]
      getRoster.mockImplementation(async () => answer)
      vi.useFakeTimers()
      const { Cmp, roster } = host()
      const w = mount(Cmp)
      await vi.advanceTimersByTimeAsync(0)
      getRoster.mockClear()
      answer = [alice, bob]
      return { roster, getRoster, unmount: () => w.unmount() }
    }

    it('keeps the round out of the ranking while the game is still revealing it', async () => {
      const { roster, getRoster } = await mounted()

      roster().refreshAfterGuess()
      await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS - 1)

      expect(getRoster).not.toHaveBeenCalled()
    })

    it('takes the new points once the reveal has had its say', async () => {
      const { roster, getRoster } = await mounted()

      roster().refreshAfterGuess()
      await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS)
      // The hold expiring only *asks*; the answer lands a microtask after that tick.
      await vi.advanceTimersByTimeAsync(0)

      expect(getRoster).toHaveBeenCalledTimes(1)
      expect(roster().members.value).toHaveLength(2)
    })

    it('drops a pending hold when the row leaves the page', async () => {
      const { roster, getRoster, unmount } = await mounted()

      roster().refreshAfterGuess()
      unmount()
      await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS)

      expect(getRoster).not.toHaveBeenCalled()
    })

    it('arms one hold, not two, when a guess is announced twice', async () => {
      const { roster, getRoster } = await mounted()

      roster().refreshAfterGuess()
      await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS / 2)
      roster().refreshAfterGuess()
      await vi.advanceTimersByTimeAsync(SPOILER_HOLD_MS)

      expect(getRoster).toHaveBeenCalledTimes(1)
    })

    // There is no choreography to protect when the visitor has asked for less motion — the
    // scoreboard shows its whole table at once — so holding the numbers back would be lag for
    // nothing, and exactly the wrong way round for the reader who asked for it.
    it('holds nothing back when the visitor asked for less motion', async () => {
      const { roster, getRoster } = await mounted()
      matchMedia = vi
        .spyOn(window, 'matchMedia')
        .mockReturnValue({ matches: true } as MediaQueryList)

      roster().refreshAfterGuess()
      await vi.advanceTimersByTimeAsync(0)

      expect(getRoster).toHaveBeenCalledTimes(1)
    })
  })
})
