import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

function mountBoard(disabled = false) {
  return mount(FindPatternBoard, {
    props: { payload: PAYLOAD, myColorHex: '#7c3aed', disabled },
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
})
