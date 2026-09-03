import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundSurface from '@/ui/RoundSurface.vue'

describe('RoundSurface', () => {
  it('renders whatever it is handed', () => {
    const w = mount(RoundSurface, { slots: { default: '<p data-test="content">Brett</p>' } })

    expect(w.get('[data-test="content"]').text()).toBe('Brett')
  })

  it('is findable, so a host can be held to mounting it', () => {
    expect(mount(RoundSurface).attributes('data-test')).toBe('round-surface')
  })

  // happy-dom computes no CSS, so the band cannot be measured here. What a spec can pin is that
  // the geometry comes from the shared utility and not from a literal margin that would drift
  // away from `main`'s padding.
  it('takes its bleed from the shared utility, never from a literal margin', () => {
    const classes = mount(RoundSurface).classes()

    expect(classes).toContain('round-bleed')
    expect(classes.join(' ')).not.toMatch(/(^|\s)-?mx-/)
  })

  // `border-y` always and `border-x` only from sm, rather than `border` plus an override: with two
  // classes competing for one property the result would depend on Tailwind's cascade order.
  it('declares the two edges separately so no two classes compete for one property', () => {
    const classes = mount(RoundSurface).classes()

    expect(classes).toContain('border-y')
    expect(classes).toContain('sm:border-x')
    expect(classes).toContain('sm:rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('rounded-xl')
  })

  // The gutter moved off the root when the header band arrived: a band that spans the card cannot
  // sit inside the padding, so the padding belongs to the body block alone.
  it('states the gutter on the body, so a game never has to and the band never inherits it', () => {
    const w = mount(RoundSurface, { slots: { default: '<p>Brett</p>' } })

    expect(w.get('[data-test="round-surface-body"]').classes()).toContain('p-4')
    expect(w.classes()).not.toContain('p-4')
  })

  it('puts the header outside the body, so the band can reach both card edges', () => {
    const w = mount(RoundSurface, {
      slots: {
        header: '<div data-test="band">Band</div>',
        default: '<p data-test="content">Brett</p>',
      },
    })

    expect(
      w.get('[data-test="band"]').element.closest('[data-test="round-surface-body"]'),
    ).toBeNull()
  })

  it('renders nothing for an absent header, rather than an empty band', () => {
    expect(mount(RoundSurface).find('[data-test="round-surface-header"]').exists()).toBe(false)
  })

  // Clipping is what lets an opaque band meet the rounded corners instead of painting over them
  // (see the overlay/stack trap in frontend-ui.md). Only from sm, because below it there is no
  // radius to clip and a clipping ancestor would only cost a game its room to animate out of.
  it('clips only where there is a corner to clip', () => {
    const classes = mount(RoundSurface).classes()

    expect(classes).toContain('sm:overflow-hidden')
    expect(classes).not.toContain('overflow-hidden')
  })
})
