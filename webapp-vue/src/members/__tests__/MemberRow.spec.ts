import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { RosterMemberResponse } from '@/api/types'
import MemberRow from '../MemberRow.vue'

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
  it('renders one circle per member, in the order the server sent', () => {
    reduceMotion(true)
    const w = mount(MemberRow, {
      props: {
        members: [
          member({ userId: 'a', shortName: 'BNDR', fullName: 'Bender', points: { stable: 10 } }),
          member({ userId: 'b', shortName: 'AMY', fullName: 'amy', points: { stable: 3 } }),
        ],
      },
    })
    const items = w.findAll('[data-swarm-item]')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('BNDR')
    expect(items[1]?.text()).toContain('AMY')
  })

  it('names each circle for assistive technology', () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member({ fullName: 'Turanga Leela' })] } })
    expect(w.find('[data-swarm-item]').attributes('aria-label')).toContain('Turanga Leela')
  })

  it('shows the live badge only when live points are present', () => {
    reduceMotion(true)
    const without = mount(MemberRow, { props: { members: [member()] } })
    expect(without.find('[data-test="live-points"]').exists()).toBe(false)

    const with_ = mount(MemberRow, {
      props: { members: [member({ points: { stable: 3, live: 5 } })] },
    })
    expect(with_.find('[data-test="live-points"]').text()).toBe('+5')
  })

  it('does not animate when the viewer asked for reduced motion', async () => {
    reduceMotion(true)
    const w = mount(MemberRow, { props: { members: [member()] }, attachTo: document.body })
    await new Promise((r) => setTimeout(r, 20))
    expect(w.find('[data-swarm-item]').attributes('style') ?? '').not.toContain('translate3d')
    expect(w.find('[data-test="row"]').attributes('style') ?? '').toContain('visible')
  })
})
