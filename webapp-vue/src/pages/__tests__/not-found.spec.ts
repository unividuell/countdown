import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import NotFound from '@/pages/[...path].vue'

const RouterLinkStub = { template: '<a :href="to"><slot/></a>', props: ['to'] }

describe('the 404 page', () => {
  it('says the address does not exist and offers a way back', () => {
    const w = mount(NotFound, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('Seite nicht gefunden')
    expect(w.find('a').attributes('href')).toBe('/')
  })

  it('is public, so a mistyped URL never routes through the login round-trip', () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    expect(router.resolve('/definitely-not-a-page').meta.public).toBe(true)
  })
})
