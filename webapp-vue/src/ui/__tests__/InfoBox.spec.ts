import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoBox from '@/ui/InfoBox.vue'

function mountBox(
  storageKey = 'find-pattern',
  props: { tone?: 'info' | 'phase-one' | 'phase-two' } = {},
) {
  return mount(InfoBox, {
    props: { storageKey, ...props },
    slots: { abstract: '<span>Kurzfassung</span>', default: '<p>Die ganze Erklärung</p>' },
  })
}

describe('InfoBox', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts open, because a game nobody has collapsed is a game nobody has understood yet', () => {
    const wrapper = mountBox()

    expect(wrapper.text()).toContain('Die ganze Erklärung')
    expect(wrapper.get('[data-test="info-box-toggle"]').attributes('aria-expanded')).toBe('true')
  })

  it('collapses on toggle and keeps the abstract', async () => {
    const wrapper = mountBox()

    await wrapper.get('[data-test="info-box-toggle"]').trigger('click')

    expect(wrapper.text()).not.toContain('Die ganze Erklärung')
    expect(wrapper.text()).toContain('Kurzfassung')
    expect(wrapper.get('[data-test="info-box-toggle"]').attributes('aria-expanded')).toBe('false')
  })

  /** Understanding a game is permanent, so the collapse has to outlive the round and the reload. */
  it('remembers the collapse per storage key', async () => {
    const first = mountBox('find-pattern')
    await first.get('[data-test="info-box-toggle"]').trigger('click')

    const again = mountBox('find-pattern')
    expect(again.text()).not.toContain('Die ganze Erklärung')

    const other = mountBox('guess-hue')
    expect(other.text()).toContain('Die ganze Erklärung')
  })

  // happy-dom computes no layout, so the offset cannot be measured. Instead, pin the decision
  // that created this: the 44px button with centred content in an `items-start` row must lift
  // 12px so its 20px chevron lands on the icon and heading's centre line, not 8px as `-m-2` gave.
  it('lifts the toggle so its chevron sits on the heading line', () => {
    const classes = mountBox().get('[data-test="info-box-toggle"]').classes()

    expect(classes).toEqual(expect.arrayContaining(['-mt-3', '-mb-3', '-mx-2', 'size-11']))
    expect(classes).not.toContain('-m-2')
  })

  it('wears the calm tone unless it is told otherwise', () => {
    const w = mountBox()

    expect(w.get('[data-test="info-box"]').classes()).toEqual(
      expect.arrayContaining(['border-sky-200', 'bg-sky-50/60']),
    )
    expect(w.get('[data-test="info-box-icon"]').classes()).toContain('text-sky-600')
  })

  // Teal means "phase one" — the same colour the band wears on the round number of such a round.
  it('wears the phase-one tone when it is asked for', () => {
    const w = mountBox('find-pattern', { tone: 'phase-one' })
    const classes = w.get('[data-test="info-box"]').classes()

    expect(classes).toEqual(expect.arrayContaining(['border-phase-one/30', 'bg-phase-one/10']))
    expect(classes).not.toContain('bg-sky-50/60')
    expect(w.get('[data-test="info-box-icon"]').classes()).toContain('text-phase-one')
  })

  // Amber means "phase two" — the same colour the band wears for a running play clock.
  it('wears the phase-two tone when it is asked for', () => {
    const w = mountBox('find-pattern', { tone: 'phase-two' })
    const classes = w.get('[data-test="info-box"]').classes()

    expect(classes).toEqual(expect.arrayContaining(['border-phase-two/30', 'bg-phase-two/10']))
    expect(classes).not.toContain('bg-sky-50/60')
    expect(w.get('[data-test="info-box-icon"]').classes()).toContain('text-phase-two')
  })

  it('shows the info icon by default and the caller own icon instead', () => {
    expect(mountBox().find('[data-test="info-box-icon"] svg').exists()).toBe(true)

    const own = mount(InfoBox, {
      props: { storageKey: 'x' },
      slots: {
        abstract: '<span>K</span>',
        icon: '<span data-test="own-icon">★</span>',
        default: '<p>E</p>',
      },
    })

    expect(own.find('[data-test="own-icon"]').exists()).toBe(true)
  })
})
