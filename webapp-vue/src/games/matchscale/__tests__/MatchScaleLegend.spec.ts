import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { formatMeasure } from '../measure'
import MatchScaleLegend from '../MatchScaleLegend.vue'
import type { Measure, Silhouette } from '../types'

const A: Silhouette = {
  name: 'Alpha',
  path: 'M0 0H1000V500H0Z',
  width: 1000,
  height: 500,
  attribution: 'Silhouette: Jemand, CC BY 4.0',
}
const B: Silhouette = { ...A, name: 'Beta', attribution: 'Silhouette: Niemand' }
const LENGTH: Measure = { axis: 'length', metres: 2.3, source: 'https://example.org/a' }
const HEIGHT: Measure = { axis: 'height', metres: 0.45, source: 'https://example.org/b' }

function mountLegend(measureA: Measure | null, measureB: Measure | null) {
  return mount(MatchScaleLegend, {
    props: { a: A, b: B, aColor: 'var(--a)', bColor: 'var(--b)', measureA, measureB },
  })
}

function blocks(wrapper: ReturnType<typeof mountLegend>) {
  const block = (key: string) => wrapper.get(`[data-test="match-scale-legend-${key}"]`)

  return [block('a'), block('b')] as const
}

/** Each block's lines as tags: what decides its height, apart from the text in them. */
function shape(wrapper: ReturnType<typeof mountLegend>) {
  return wrapper.findAll('li').map((li) => [...li.element.children].map((child) => child.tagName))
}

describe('formatMeasure', () => {
  it.each([
    [{ axis: 'length', metres: 2.3 }, '2,3 m Länge'],
    [{ axis: 'height', metres: 1 }, '1 m Höhe'],
    [{ axis: 'length', metres: 12.345 }, '12,35 m Länge'],
    [{ axis: 'height', metres: 0.45 }, '45 cm Höhe'],
    [{ axis: 'length', metres: 0.084 }, '8 cm Länge'],
    [{ axis: 'length', metres: 0.996 }, '1 m Länge'],
    [{ axis: 'length', metres: 0.004 }, '0,4 cm Länge'],
  ] as const)('%o reads %s', (measure, text) => {
    expect(formatMeasure({ ...measure, source: 'x' })).toBe(text)
  })
})

describe('MatchScaleLegend', () => {
  it('stacks A over B, each name in its colour, with its credit on a second line', () => {
    const wrapper = mountLegend(null, null)
    const [a, b] = blocks(wrapper)

    expect(a.get('[data-test="match-scale-label-a"]').text()).toBe('Alpha')
    expect(b.get('[data-test="match-scale-label-b"]').text()).toBe('Beta')
    expect(a.get('p').attributes('style')).toContain('color: var(--a)')
    expect(b.get('p').attributes('style')).toContain('color: var(--b)')
    expect(a.get('[data-test="match-scale-attribution"]').text()).toBe(A.attribution)
    expect(b.get('[data-test="match-scale-attribution"]').text()).toBe(B.attribution)
  })

  it('while playing names no measure', () => {
    expect(mountLegend(null, null).find('[data-test="match-scale-measure"]').exists()).toBe(false)
  })

  it('in the reveal appends each measure to its name', () => {
    const [a, b] = blocks(mountLegend(LENGTH, HEIGHT))

    expect(a.get('p').text()).toBe('Alpha · 2,3 m Länge')
    expect(b.get('p').text()).toBe('Beta · 45 cm Höhe')
  })

  it('stands as tall in the reveal as while playing: same lines, the name never wraps', () => {
    const playing = mountLegend(null, null)
    const revealed = mountLegend(LENGTH, HEIGHT)

    expect(shape(revealed)).toEqual(shape(playing))
    expect(revealed.get('[data-test="match-scale-label-a"]').classes()).toContain('truncate')
    expect(revealed.get('[data-test="match-scale-measure"]').classes()).toContain(
      'whitespace-nowrap',
    )
  })

  it('leaves out a missing measure and a missing credit', () => {
    const wrapper = mount(MatchScaleLegend, {
      props: {
        a: { ...A, attribution: null },
        b: B,
        aColor: 'var(--a)',
        bColor: 'var(--b)',
        measureA: null,
        measureB: HEIGHT,
      },
    })
    const [a] = blocks(wrapper)

    expect(a.get('p').text()).toBe('Alpha')
    expect(a.find('[data-test="match-scale-attribution"]').exists()).toBe(false)
  })
})
