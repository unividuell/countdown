import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoBox from '@/ui/InfoBox.vue'

function mountBox(storageKey = 'find-pattern') {
  return mount(InfoBox, {
    props: { storageKey },
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
})
