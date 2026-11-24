import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import RecipeBoxes from '../RecipeBoxes.vue'

enableAutoUnmount(afterEach)

const PIGMENTS = [
  { key: 'c', name: 'Cyan', hex: '#00AEEF' },
  { key: 'm', name: 'Magenta', hex: '#EC008C' },
  { key: 'y', name: 'Gelb', hex: '#FFF200' },
]

const mountBoxes = (recipe: Record<string, number>) =>
  mount(RecipeBoxes, { props: { pigments: PIGMENTS, recipe, max: 20 } })

const fill = (w: ReturnType<typeof mountBoxes>, key: string) =>
  w.get(`[data-test="box-${key}"] [data-test="box-fill"]`).attributes('style')

describe('RecipeBoxes', () => {
  it('draws one box per pigment, empty ones too, in payload order', () => {
    const w = mountBoxes({ c: 5 })

    expect(
      w
        .findAll('[data-test^="box-"]:not([data-test="box-fill"])')
        .map((b) => b.attributes('data-test')),
    ).toEqual(['box-c', 'box-m', 'box-y'])
  })

  it('fills each box from the bottom by its share of the max', () => {
    const w = mountBoxes({ c: 5, y: 20 })

    expect(fill(w, 'c')).toContain('height: 25%')
    expect(fill(w, 'm')).toContain('height: 0%')
    expect(fill(w, 'y')).toContain('height: 100%')
  })

  it('writes the drop count into every box', () => {
    const w = mountBoxes({ c: 5 })

    expect(w.get('[data-test="box-c"]').text()).toBe('5')
    expect(w.get('[data-test="box-m"]').text()).toBe('0')
  })

  it('rings every box in its pigment', () => {
    const w = mountBoxes({})

    expect(w.get('[data-test="box-m"]').attributes('style')).toContain('border-color')
  })

  it('names the recipe for a screen reader', () => {
    const w = mountBoxes({ c: 5, y: 2 })

    expect(w.get('[role="img"]').attributes('aria-label')).toBe('Cyan 5, Magenta 0, Gelb 2')
  })
})
