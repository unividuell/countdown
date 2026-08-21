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

  // A comment sits above <RoundSurface> in the template for documentation, which compiles the
  // component to a multi-root fragment; the wrapper's own `.classes()`/`.attributes()` then
  // resolve to the mount container, not the surface. `.find('div')` reaches the actual root.
  it('stays square, so the page keeps its silhouette across states', () => {
    const w = mount(MessageCard, { props: { title: 'x' } })
    expect(w.find('div').classes()).toContain('aspect-square')
  })

  it('is drawn on the shared surface rather than a frame of its own', () => {
    const w = mount(MessageCard, { props: { title: 'x' } }).find('div')

    expect(w.attributes('data-test')).toBe('round-surface')
    expect(w.classes()).not.toContain('rounded-xl')
  })

  // `width: 100%` and the surface's negative inline margin are mutually exclusive: with a definite
  // width the margin equation is over-constrained, CSS drops the right margin, and the box keeps
  // its 343px and merely shifts 16px left instead of spanning 375px. Measured in Chromium.
  // happy-dom computes no layout, so the class's absence is the only thing a spec can hold.
  it('leaves its width to the bleed, so the square is the band and not a shifted box', () => {
    expect(
      mount(MessageCard, { props: { title: 'x' } })
        .find('div')
        .classes(),
    ).not.toContain('w-full')
  })
})
