import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageCard from '@/communities/fallbacks/MessageCard.vue'
import RoundSurface from '@/ui/RoundSurface.vue'

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

  it('is drawn on the shared surface rather than a frame of its own', () => {
    const w = mount(MessageCard, { props: { title: 'x' } })

    expect(w.findComponent(RoundSurface).exists()).toBe(true)
    expect(w.classes()).not.toContain('rounded-xl')
  })

  // `width: 100%` and the surface's negative inline margin are mutually exclusive: with a definite
  // width the margin equation is over-constrained, CSS drops the right margin, and the box keeps
  // its 343px and merely shifts 16px left instead of spanning 375px. Measured in Chromium.
  // happy-dom computes no layout, so the class's absence is the only thing a spec can hold.
  it('leaves its width to the bleed, so the square is the band and not a shifted box', () => {
    expect(mount(MessageCard, { props: { title: 'x' } }).classes()).not.toContain('w-full')
  })
})
