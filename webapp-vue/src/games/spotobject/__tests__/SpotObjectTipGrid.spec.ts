import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SpotObjectTipGrid from '../SpotObjectTipGrid.vue'
import type { TipTile } from '../tips'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

function tile(over: Partial<TipTile> & { userId: string }): TipTile {
  return {
    name: over.userId,
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
    tick: 0,
    ...over,
  }
}

function mountGrid(tiles: TipTile[]) {
  return mount(SpotObjectTipGrid, {
    props: { tiles, tipPath: (userId: string) => `/tips/${userId}` },
  })
}

describe('SpotObjectTipGrid', () => {
  it('renders one tile per tip in two columns', () => {
    const wrapper = mountGrid([tile({ userId: 'a' }), tile({ userId: 'b' })])

    expect(wrapper.findAll('[data-test="tip-tile"]')).toHaveLength(2)
    expect(wrapper.get('[data-test="tip-grid"]').classes()).toContain('grid-cols-2')
  })

  it('names everybody who voted, on both sides', () => {
    const wrapper = mountGrid([
      tile({
        userId: 'a',
        confirms: [{ userId: 'b', username: 'Bianca', value: 'CONFIRM' }],
        flags: [{ userId: 'c', username: 'Caro', value: 'FLAG' }],
      }),
    ])

    expect(wrapper.text()).toContain('Bianca')
    expect(wrapper.text()).toContain('Caro')
  })

  it('marks a struck tile', () => {
    const wrapper = mountGrid([tile({ userId: 'a', struck: true })])

    expect(wrapper.find('[data-test="tip-struck"]').exists()).toBe(true)
  })

  it('says when the game master lifted a tip', () => {
    const wrapper = mountGrid([tile({ userId: 'a', adminOverride: true })])

    expect(wrapper.text()).toContain('vom Spielleiter aufgehoben')
  })

  it('links into Google without nesting it inside the tile link', () => {
    const wrapper = mountGrid([tile({ userId: 'a' })])

    expect(wrapper.findAll('a a')).toHaveLength(0)
  })

  it('opens the single-tip page for the tapped tile', async () => {
    const wrapper = mountGrid([tile({ userId: 'a' })])

    await wrapper.get('[data-test="tip-tile"]').trigger('click')

    expect(push).toHaveBeenCalledWith('/tips/a')
  })
})
