import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternGrid from '@/games/findpattern/PatternGrid.vue'

const IMAGE = 'data:image/png;base64,AAA'

function mountGrid(props: Partial<InstanceType<typeof PatternGrid>['$props']> = {}) {
  return mount(PatternGrid, {
    props: {
      image: IMAGE,
      cols: 4,
      rows: 2,
      outlines: [],
      numbers: [],
      interactive: true,
      ...props,
    },
  })
}

describe('PatternGrid', () => {
  it('lays one cell over every block of the image', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('[data-test^="pattern-cell-"]')).toHaveLength(8)
    expect(wrapper.get('img').attributes('src')).toBe(IMAGE)
  })

  it('reports the index of a tapped cell', async () => {
    const wrapper = mountGrid()

    await wrapper.get('[data-test="pattern-cell-5"]').trigger('click')

    expect(wrapper.emitted('cell')).toEqual([[5]])
  })

  it('renders an outline per mark, in its own colour', () => {
    const wrapper = mountGrid({
      outlines: [{ index: 2, colorHex: '#ff0000', insetPx: 2, delayMs: 0 }],
    })

    const outline = wrapper.get('[data-test="pattern-outline-2"]')
    expect(outline.attributes('style')).toContain('#ff0000')
  })

  /**
   * The border is always 2px wide regardless of inset, so a bare `toContain('2px')` would pass
   * even if [insetPx] were ignored entirely — this pins the inset itself, distinctly per source.
   */
  it('renders each stacked outline at its own inset', () => {
    const wrapper = mountGrid({
      outlines: [
        { index: 2, colorHex: '#f00', insetPx: 0, delayMs: 0 },
        { index: 2, colorHex: '#0f0', insetPx: 2, delayMs: 500 },
      ],
    })

    const outlines = wrapper.findAll('[data-test="pattern-outline-2"]')
    expect(outlines).toHaveLength(2)
    expect(outlines[0]?.attributes('style')).toContain('top: 0px')
    expect(outlines[1]?.attributes('style')).toContain('top: 2px')
  })

  it('renders a number where one was handed in', () => {
    const wrapper = mountGrid({ numbers: [{ index: 3, value: 2, ink: '#111111' }] })

    expect(wrapper.get('[data-test="pattern-number-3"]').text()).toBe('2')
    expect(wrapper.find('[data-test="pattern-number-1"]').exists()).toBe(false)
  })

  it('offers no button when it is not interactive', () => {
    const wrapper = mountGrid({ interactive: false })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('gives each interactive cell its own accessible name', () => {
    const wrapper = mountGrid()

    expect(wrapper.get('[data-test="pattern-cell-5"]').attributes('aria-label')).toBe('Zelle 6')
  })

  it('gives a non-interactive cell no accessible name', () => {
    const wrapper = mountGrid({ interactive: false })

    expect(wrapper.get('[data-test="pattern-cell-5"]').attributes('aria-label')).toBeUndefined()
  })
})
