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
})
