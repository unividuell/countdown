import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/communities'
import { useRoster } from '../useRoster'

/** useRoster loads on mount, so it needs a host component. */
function host(slug = 'team') {
  const seen: { state?: string; count?: number } = {}
  const Cmp = defineComponent({
    setup() {
      const { members, state } = useRoster(slug)
      return () => {
        seen.state = state.value
        seen.count = members.value.length
        return h('div')
      }
    },
  })
  return { Cmp, seen }
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

  it('requests the roster of the given community', async () => {
    const spy = vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const { Cmp } = host('hütte')
    mount(Cmp)
    await flushPromises()
    expect(spy).toHaveBeenCalledWith('hütte')
  })
})
