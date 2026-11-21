import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import type { AwardRule } from '@/api/types'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'
import { playClear, playMark } from '@/games/findpattern/markSound'
import PatternGrid from '@/games/findpattern/PatternGrid.vue'
import RevealCover from '@/ui/RevealCover.vue'

vi.mock('@/games/findpattern/markSound', () => ({ playMark: vi.fn(), playClear: vi.fn() }))

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
}

const BOARD_SRC = 'blob:board'
const PATTERN_SRC = 'blob:pattern'

const SCENE = { cols: 8, rows: 14, patternLength: 4 }

function mountBoard(
  disabled = false,
  submittedStartIndex?: number | null,
  award: { awardRule?: AwardRule | null; awardPoints?: number | null } = {},
  over: Record<string, unknown> = {},
) {
  return mount(FindPatternBoard, {
    props: {
      payload: PAYLOAD,
      sceneState: 'ready',
      boardSrc: BOARD_SRC,
      patternSrc: PATTERN_SRC,
      myColorHex: '#7c3aed',
      disabled,
      awardRule: null,
      awardPoints: null,
      ...(submittedStartIndex !== undefined ? { submittedStartIndex } : {}),
      ...award,
      ...over,
    },
  })
}

/** Under the cover: the scene instead of the payload, no picture yet. */
function mountSealed(over: Record<string, unknown> = {}) {
  return mountBoard(
    false,
    undefined,
    {},
    {
      payload: null,
      scene: SCENE,
      sealed: true,
      boardSrc: null,
      patternSrc: null,
      ...over,
    },
  )
}

async function tap(wrapper: ReturnType<typeof mountBoard>, ...indices: number[]) {
  for (const index of indices) {
    await wrapper.get(`[data-test="pattern-cell-${index}"]`).trigger('click')
  }
}

describe('FindPatternBoard', () => {
  beforeEach(() => {
    vi.mocked(playMark).mockClear()
    vi.mocked(playClear).mockClear()
  })

  it('knocks for every marked block, one step higher each, the completing one ringing', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, 10, 11, 12, 13)

    expect(vi.mocked(playMark).mock.calls).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
    ])
  })

  it('starts the scale over with a fresh selection', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, 10, 11, 40)

    expect(vi.mocked(playMark).mock.calls).toEqual([
      [1, false],
      [2, false],
      [1, false],
    ])
  })

  it('says „ba-dum“ when a tap on a marked block drops the selection', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, 10, 11, 11)

    expect(playMark).toHaveBeenCalledTimes(2)
    expect(playClear).toHaveBeenCalledOnce()
  })

  it('knocks for no tap the board does not take', async () => {
    await tap(mountBoard(true), 10)

    expect(playMark).not.toHaveBeenCalled()
  })

  it('has the sound toggle beside the instruction', () => {
    expect(mountBoard().find('button[aria-label="Ton"]').exists()).toBe(true)
  })

  it('shows both pictures from its props and the rules text inside the info box', () => {
    const wrapper = mountBoard()

    const sources = wrapper.findAll('img').map((img) => img.attributes('src'))
    expect(sources).toContain(BOARD_SRC)
    expect(sources).toContain(PATTERN_SRC)
    expect(wrapper.find('[data-test="info-box"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Leserichtung')
  })

  // Like the board's frame: in the ink opposite the mode, picture or placeholder.
  it('frames the target pattern in the ink opposite the mode', () => {
    const img = mountBoard().get('img[alt="Das gesuchte Muster"]')
    const placeholder = mountSealed().get('[data-test="pattern-image-placeholder"]')

    for (const frame of [img, placeholder]) {
      expect(frame.classes()).toContain('border-on-surface')
      expect(frame.classes()).not.toContain('border-black')
    }
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

  // Phase two gates on qualification (`Scoring.kt`: `qualifies && deviation == best`), and
  // find-pattern has one: the wrong pattern does not win even if it is fast.
  it('names both halves of the phase two rule', () => {
    const w = mountBoard(false, undefined, { awardRule: 'CLOSEST_ONLY', awardPoints: 9 })

    expect(w.text()).toContain('Winner takes it all: 9 Punkte')
    expect(w.text()).toContain('richtige Muster')
    expect(w.text()).toContain('kürzeste Zeit')
  })
})

describe('FindPatternBoard, the pictures', () => {
  it('lays the cover in the scene state it is given', () => {
    const wrapper = mountSealed({ sceneState: 'preparing' })

    expect(wrapper.findComponent(RevealCover).props('state')).toBe('preparing')
    expect(wrapper.find('[data-test="reveal-cover-preparing"]').exists()).toBe(true)
  })

  it('asks the game to retry when the failed cover is retried', async () => {
    const wrapper = mountSealed({ sceneState: 'failed' })

    await wrapper.get('[data-test="reveal-cover-retry"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('requests no picture while sealed', () => {
    expect(mountSealed().findAll('img')).toHaveLength(0)
  })

  it('takes no tap while the board picture is missing', async () => {
    const wrapper = mountBoard(false, undefined, {}, { boardSrc: null, sceneState: 'preparing' })

    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(0)
    expect(wrapper.getComponent(PatternGrid).props('interactive')).toBe(false)
  })

  it('takes taps once the board picture is here', async () => {
    const wrapper = mountBoard(false, undefined, {}, { boardSrc: null, sceneState: 'preparing' })
    await tap(wrapper, 10, 11)

    await wrapper.setProps({ boardSrc: BOARD_SRC, sceneState: 'ready' })
    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('says so when a picture does not load', async () => {
    const wrapper = mountBoard()

    await wrapper.get('img').trigger('error')

    expect(wrapper.get('[data-test="pattern-image-error"]').text()).toBe(
      'Das Bild ließ sich nicht laden.',
    )
  })

  it('says so when the board picture does not load', async () => {
    const wrapper = mountBoard()

    await wrapper.getComponent(PatternGrid).vm.$emit('imageError')

    expect(wrapper.find('[data-test="pattern-image-error"]').exists()).toBe(true)
  })

  it('says so when a picture failed on an uncovered board', () => {
    const wrapper = mountBoard(
      false,
      undefined,
      {},
      {
        sceneState: 'failed',
        boardSrc: null,
        patternSrc: null,
      },
    )

    expect(wrapper.get('[data-test="pattern-image-error"]').text()).toBe(
      'Das Bild ließ sich nicht laden.',
    )
  })

  it('leaves a failed scene to the cover while the board is sealed', () => {
    expect(
      mountSealed({ sceneState: 'failed' }).find('[data-test="pattern-image-error"]').exists(),
    ).toBe(false)
  })

  it('stays quiet while the pictures are still preparing', () => {
    const wrapper = mountBoard(
      false,
      undefined,
      {},
      {
        sceneState: 'preparing',
        boardSrc: null,
        patternSrc: null,
      },
    )

    expect(wrapper.find('[data-test="pattern-image-error"]').exists()).toBe(false)
  })
})
