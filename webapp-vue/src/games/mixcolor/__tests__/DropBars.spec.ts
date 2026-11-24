import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import DropBars from '../DropBars.vue'

enableAutoUnmount(afterEach)

const PIGMENTS = [
  { key: 'c', name: 'Cyan', hex: '#00AEEF' },
  { key: 'm', name: 'Magenta', hex: '#EC008C' },
  { key: 'y', name: 'Gelb', hex: '#FFF200' },
  { key: 'w', name: 'Weiß', hex: '#FFFFFF' },
  { key: 'k', name: 'Schwarz', hex: '#111111' },
]

function mountBars(player: Record<string, number> | null) {
  return mount(DropBars, {
    props: { pigments: PIGMENTS, target: { c: 3, m: 1 }, player, capacity: 6 },
  })
}

const drops = (w: ReturnType<typeof mountBars>, lane: string) =>
  w.get(`[data-test="lane-${lane}"]`).findAll('[data-test="drop"]').length

describe('DropBars', () => {
  it('lists the pigments present in either recipe, in payload order', () => {
    const w = mountBars({ c: 2, y: 1 })

    const lanes = w.findAll('[data-test^="lane-"]').map((lane) => lane.attributes('data-test'))
    expect(lanes).toEqual([
      'lane-c-target',
      'lane-c-player',
      'lane-m-target',
      'lane-m-player',
      'lane-y-target',
      'lane-y-player',
    ])
  })

  it('draws one drop per drop in each lane', () => {
    const w = mountBars({ c: 2, y: 1 })

    expect(drops(w, 'c-target')).toBe(3)
    expect(drops(w, 'c-player')).toBe(2)
    expect(drops(w, 'm-target')).toBe(1)
    expect(drops(w, 'm-player')).toBe(0)
    expect(drops(w, 'y-target')).toBe(0)
    expect(drops(w, 'y-player')).toBe(1)
  })

  it('draws drops in the pigment colour', () => {
    const w = mountBars(null)

    expect(w.get('[data-test="lane-c-target"] [data-test="drop"]').attributes('style')).toContain(
      '#00AEEF',
    )
  })

  it('without a player recipe there is no player lane', () => {
    const w = mountBars(null)

    expect(w.find('[data-test="lane-c-player"]').exists()).toBe(false)
    expect(w.find('[data-test="lane-c-target"]').exists()).toBe(true)
  })
})
