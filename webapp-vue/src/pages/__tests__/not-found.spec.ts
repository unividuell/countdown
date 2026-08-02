import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotFound from '@/pages/[...path].vue'

const RouterLinkStub = { template: '<a :href="to"><slot/></a>', props: ['to'] }

describe('the 404 page', () => {
  it('says the address does not exist and offers a way back', () => {
    const w = mount(NotFound, { global: { stubs: { RouterLink: RouterLinkStub } } })
    expect(w.text()).toContain('Seite nicht gefunden')
    expect(w.find('a').attributes('href')).toBe('/')
  })
})
