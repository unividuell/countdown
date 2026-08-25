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

  it('renders an outline per mark, with its inset and its colour', () => {
    const wrapper = mountGrid({
      outlines: [{ index: 2, colorHex: '#ff0000', insetPx: 2, delayMs: 0 }],
    })

    const outline = wrapper.get('[data-test="pattern-outline-2"]')
    expect(outline.attributes('style')).toContain('rgb(255, 0, 0)')
    expect(outline.attributes('style')).toContain('2px')
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
})
