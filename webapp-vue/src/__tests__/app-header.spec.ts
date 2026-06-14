import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import { activeCommunity } from '@/communities/context'

const stubs = {
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
  RouterView: { template: '<div />' },
  CountdownDisplay: { template: '<div data-test="countdown-widget" />', props: ['slug'] },
}

describe('App main header', () => {
  beforeEach(() => {
    activeCommunity.value = null
  })

  it('shows the app name and no countdown when no community is active', () => {
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('countdown')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('shows the community title + year suffix and the countdown when active', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain('Hütte Hütte')
    expect(w.find('a[href="/"]').text()).toContain("'26")
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(true)
  })

  it('shows the title without a year suffix and hides the countdown when startsAt is unset', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: null,
      startsAtTimezone: 'Europe/Berlin',
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toBe('Hütte Hütte')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('derives the year suffix in the community zone, not UTC (boundary case)', () => {
    // 2025-12-31T23:30Z is already 2026-01-01 00:30 in Europe/Berlin -> edition '26 (not '25)
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2025-12-31T23:30:00Z',
      startsAtTimezone: 'Europe/Berlin',
    }
    const w = mount(App, { global: { stubs } })
    expect(w.find('a[href="/"]').text()).toContain("'26")
  })
})
