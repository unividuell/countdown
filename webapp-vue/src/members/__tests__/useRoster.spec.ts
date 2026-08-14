import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, watch } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { useRoster } from '../useRoster'

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
})
