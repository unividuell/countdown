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

  it('states the gutter itself, so a game never has to', () => {
    expect(mount(RoundSurface).classes()).toContain('p-4')
  })
})
