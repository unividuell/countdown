import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Legal from '@/pages/legal.vue'

describe('legal', () => {
  it('binds the reader to Google’s terms of service', () => {
    const wrapper = mount(Legal)

    expect(wrapper.html()).toContain('https://policies.google.com/terms')
  })

  it('points at Google’s privacy policy', () => {
    expect(mount(Legal).html()).toContain('https://policies.google.com/privacy')
  })

  it('opens both links away from the app', () => {
    const links = mount(Legal).findAll('a[href^="https://policies.google.com"]')

    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toContain('noopener')
    }
  })

  it('states what is stored for a submitted tip, and that the position is resolved but not stored', () => {
    const html = mount(Legal).html()

    expect(html).toContain('Panorama-ID')
    expect(html).toMatch(/Position/)
    expect(html).toContain('nicht gespeichert')
    // No coordinate is ever entered by a player — only a panorama id crosses the wire.
    expect(html).not.toMatch(/eingegebene Koordinate/)
  })
})
