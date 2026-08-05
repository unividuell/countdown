import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageCard from '@/communities/fallbacks/MessageCard.vue'

describe('MessageCard', () => {
  it('shows the title', () => {
    const w = mount(MessageCard, { props: { title: 'Noch kein Termin' } })
    expect(w.text()).toContain('Noch kein Termin')
  })

  it('shows the optional second line when given', () => {
    const w = mount(MessageCard, {
      props: { title: 'Noch kein Termin', text: 'Komm später wieder.' },
    })
    expect(w.text()).toContain('Komm später wieder.')
  })

  it('renders no second line when it is omitted', () => {
    const w = mount(MessageCard, { props: { title: 'Und jetzt viel Spaß zusammen!' } })
    expect(w.findAll('p').length).toBe(1)
  })

  it('stays square, so the page keeps its silhouette across states', () => {
    const w = mount(MessageCard, { props: { title: 'x' } })
    expect(w.classes()).toContain('aspect-square')
  })
})
