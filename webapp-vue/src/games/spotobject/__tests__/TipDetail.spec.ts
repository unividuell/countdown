import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TipDetail from '../TipDetail.vue'
import type { TipTile } from '../tips'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a :href="to"><slot/></a>', props: ['to'] },
}))

function tile(over: Partial<TipTile> = {}): TipTile {
  return {
    userId: 'a',
    name: 'Amy',
    colorHex: '#7c3aed',
    ink: '#ffffff',
    tip: { panoId: 'pano-1', heading: 10, pitch: -5, zoom: 1 },
    country: 'DE',
    flag: '🇩🇪',
    confirms: [],
    flags: [],
    struck: false,
    adminOverride: null,
    mine: false,
    ...over,
  }
}

function mountDetail(over: Partial<InstanceType<typeof TipDetail>['$props']> = {}) {
  return mount(TipDetail, {
    props: {
      tile: tile(),
      term: 'Roter Briefkasten',
      canVote: true,
      canOverride: false,
      myVote: null,
      busy: false,
      closeTo: '/c/team/',
      error: null,
      ...over,
    },
  })
}

describe('TipDetail', () => {
  it('gives confirm and flag the same weight', () => {
    const w = mountDetail()

    const confirm = w.get('[data-test="tip-confirm"]')
    const flag = w.get('[data-test="tip-flag"]')
    // Only the colour tells them apart — everything about size and weight is shared.
    for (const cls of ['h-11', 'flex-1', 'basis-0', 'rounded-md', 'font-semibold']) {
      expect(confirm.classes()).toContain(cls)
      expect(flag.classes()).toContain(cls)
    }
  })

  it('emits the vote, and emits null when the held vote is clicked again', async () => {
    const fresh = mountDetail({ myVote: null })
    await fresh.get('[data-test="tip-confirm"]').trigger('click')
    expect(fresh.emitted('vote')).toEqual([['CONFIRM']])

    const held = mountDetail({ myVote: 'CONFIRM' })
    await held.get('[data-test="tip-confirm"]').trigger('click')
    expect(held.emitted('vote')).toEqual([[null]])
  })

  it('hides both buttons for the viewer’s own tip', () => {
    const w = mountDetail({ canVote: false })

    expect(w.find('[data-test="tip-confirm"]').exists()).toBe(false)
    expect(w.find('[data-test="tip-flag"]').exists()).toBe(false)
  })

  it('shows the override only when the viewer may set it', () => {
    expect(mountDetail({ canOverride: false }).find('[data-test="tip-override"]').exists()).toBe(
      false,
    )
    expect(mountDetail({ canOverride: true }).find('[data-test="tip-override"]').exists()).toBe(
      true,
    )
  })

  it('shows a big close control that leads back', () => {
    const w = mountDetail({ closeTo: '/c/team/' })

    const close = w.get('[data-test="tip-close"]')
    expect(close.attributes('href')).toBe('/c/team/')
    expect(close.classes()).toContain('h-11')
    expect(close.classes()).toContain('w-11')
  })

  it("shows the last action's error message, and nothing when there is none", () => {
    expect(mountDetail({ error: null }).find('[data-test="tip-action-error"]').exists()).toBe(false)

    const w = mountDetail({ error: 'Die Aktion ist fehlgeschlagen.' })
    expect(w.get('[data-test="tip-action-error"]').text()).toBe('Die Aktion ist fehlgeschlagen.')
  })

  it('links into Google’s own viewer', () => {
    const w = mountDetail()

    // Moving around and zooming happen there, not on a surface of ours.
    const link = w.get('[data-test="tip-google"]')
    expect(link.attributes('href')).toContain('google.com/maps')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })
})
