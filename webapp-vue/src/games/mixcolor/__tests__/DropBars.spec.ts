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

const count = (w: ReturnType<typeof mountBars>, key: string, half: 'mix' | 'target') =>
  w.get(`[data-test="row-${key}"]`).findAll(`[data-test="${half}-drop"]`).length

describe('DropBars', () => {
  it('gives each row a text alternative', () => {
    const w = mountBars({ c: 2 })

    expect(w.get('[data-test="row-c"]').attributes('aria-label')).toBe(
      'Cyan: Mix 2, Ziel 3 Tropfen',
    )
  })

  it('lists every pigment, empty or not, in payload order', () => {
    const w = mountBars({ c: 2 })

    const rows = w.findAll('[data-test^="row-"]').map((row) => row.attributes('data-test'))
    expect(rows).toEqual(['row-c', 'row-m', 'row-y', 'row-w', 'row-k'])
  })

  it('fills the upper halves with the mix, the lower with the target', () => {
    const w = mountBars({ c: 2, y: 1 })

    expect(count(w, 'c', 'mix')).toBe(2)
    expect(count(w, 'c', 'target')).toBe(3)
    expect(count(w, 'm', 'mix')).toBe(0)
    expect(count(w, 'm', 'target')).toBe(1)
    expect(count(w, 'y', 'mix')).toBe(1)
    expect(count(w, 'y', 'target')).toBe(0)
    expect(count(w, 'k', 'mix')).toBe(0)
    expect(count(w, 'k', 'target')).toBe(0)
  })

  it('draws drops in the pigment colour', () => {
    const w = mountBars(null)

    expect(w.get('[data-test="row-c"] [data-test="target-drop"]').attributes('style')).toContain(
      '#00AEEF',
    )
  })

  it('without a player recipe the upper halves stay empty', () => {
    const w = mountBars(null)

    expect(w.findAll('[data-test="mix-drop"]')).toHaveLength(0)
    expect(w.get('[data-test="row-c"]').attributes('aria-label')).toBe('Cyan, Ziel: 3 Tropfen')
  })
})
