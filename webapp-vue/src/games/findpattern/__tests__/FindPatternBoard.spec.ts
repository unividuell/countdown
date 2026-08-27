import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'
import PatternGrid from '@/games/findpattern/PatternGrid.vue'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

function mountBoard(disabled = false, submittedStartIndex?: number | null) {
  return mount(FindPatternBoard, {
    props: {
      payload: PAYLOAD,
      myColorHex: '#7c3aed',
      disabled,
      ...(submittedStartIndex !== undefined ? { submittedStartIndex } : {}),
    },
  })
}

async function tap(wrapper: ReturnType<typeof mountBoard>, ...indices: number[]) {
  for (const index of indices) {
    await wrapper.get(`[data-test="pattern-cell-${index}"]`).trigger('click')
  }
}

describe('FindPatternBoard', () => {
  it('shows both server images and the rules text inside the info box', () => {
    const wrapper = mountBoard()

    const sources = wrapper.findAll('img').map((img) => img.attributes('src'))
    expect(sources).toContain(PAYLOAD.boardImage)
    expect(sources).toContain(PAYLOAD.patternImage)
    expect(wrapper.find('[data-test="info-box"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Leserichtung')
  })

  it('caps the board width even on a desktop viewport', () => {
    const wrapper = mountBoard()

    const frame = wrapper.findComponent(PatternGrid).element.parentElement
    expect(frame?.className).toContain('max-w-[22rem]')
  })

  it("marks a growing selection in the player's own colour", async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11)

    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(2)
    expect(wrapper.get('[data-test="pattern-outline-10"]').attributes('style')).toContain('#7c3aed')
  })

  it('submits by itself as soon as four blocks are selected', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('submits the lowest index however the run was walked', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 13, 12, 11, 10)

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('starts over on a cell that touches nothing, without submitting', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 40)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(1)
  })

  it('does not react at all once the round is spent', async () => {
    const wrapper = mountBoard(true)

    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(0)
  })

  it('emits one guess even if a fifth tap lands before the answer', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 12, 13, 14)

    expect(wrapper.emitted('guess')).toHaveLength(1)
  })

  it("shows a submitted tip in the player's own colour after a reload", () => {
    const wrapper = mountBoard(true, 10)

    const outlines = wrapper.findAll('[data-test^="pattern-outline-"]')
    expect(outlines.map((outline) => outline.attributes('data-test'))).toEqual([
      'pattern-outline-10',
      'pattern-outline-11',
      'pattern-outline-12',
      'pattern-outline-13',
    ])
    for (const outline of outlines) {
      expect(outline.attributes('style')).toContain('#7c3aed')
    }
  })

  it('leaves a submitted tip standing when a tap lands on it', async () => {
    const wrapper = mountBoard(true, 10)

    await tap(wrapper, 10, 11)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(4)
  })

  it('does not show a submitted tip when the prop is absent', () => {
    const wrapper = mountBoard(true)

    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(0)
  })

  it('never lets a submitted tip seed a new selection', async () => {
    const wrapper = mountBoard(false, 10)

    await tap(wrapper, 11)

    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="pattern-outline-11"]').exists()).toBe(true)
  })
})
