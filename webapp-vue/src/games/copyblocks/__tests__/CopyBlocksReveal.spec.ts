import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import CopyBlocksReveal from '@/games/copyblocks/CopyBlocksReveal.vue'
import { fieldOf } from '@/games/copyblocks/field'
import type { ScoreRow } from '@/games/copyblocks/scoreboard'
import type { CopyBlocksOutcome, CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'
import { START_CAMERA } from '@/games/copyblocks/view'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [
    { x: 0, y: 0, z: 0, type: 'DIRT' },
    { x: 1, y: 0, z: 0, type: 'BRICKS' },
  ],
}
const IDENTITY = { turns: 0, dx: 0, dy: 0, dz: 0 }
const MINE: CopyBlocksOutcome = {
  correct: false,
  fit: IDENTITY,
  missing: [{ x: 1, y: 0, z: 0, type: 'BRICKS' }],
  extra: [],
  wrongType: [],
}
const THEIRS: CopyBlocksOutcome = {
  correct: false,
  fit: IDENTITY,
  missing: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
  extra: [],
  wrongType: [],
}
const MY_GUESS: GuessBlock[] = [{ x: 0, y: 0, z: 0, type: 'DIRT' }]

function row(userId: string, outcome: CopyBlocksOutcome | null): ScoreRow {
  return {
    userId,
    name: userId,
    colorHex: '#336699',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    durationLabel: null,
    outcome,
  }
}

function mountReveal(over: Record<string, unknown> = {}) {
  return mount(CopyBlocksReveal, {
    props: {
      payload: PAYLOAD,
      rows: [row('me', MINE), row('them', THEIRS)],
      mineUserId: 'me',
      myGuess: MY_GUESS,
      myOutcome: MINE,
      live: false,
      animate: false,
      camera: START_CAMERA,
      ...over,
    },
    global: { stubs: { BlockScene: true } },
  })
}

const scene = (w: ReturnType<typeof mountReveal>) => w.getComponent(BlockScene)

describe('CopyBlocksReveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the field of the submitted build, so nothing moves at the switch', async () => {
    // Grid 1: the template reaches one cell further than my build, so the two fields differ.
    const payload = { ...PAYLOAD, grid: 1 }
    const mine = fieldOf(MY_GUESS, 1)
    expect(fieldOf(PAYLOAD.blocks, 1)).not.toEqual(mine)

    const wrapper = mountReveal({ payload })
    expect(scene(wrapper).props('field')).toEqual(mine)

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('field')).toEqual(mine)
  })

  it('frames the view like the build field, cage included', () => {
    expect(scene(mountReveal()).props('build')).toBe(true)
  })

  it('marks my own tip at once on a reload', () => {
    expect(scene(mountReveal()).props('marks')).toEqual([
      { x: 1, y: 0, z: 0, type: 'BRICKS', kind: 'missing' },
    ])
  })

  describe('live', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
      })
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    })

    it('shows my build as it stood, and the solution at its beat', async () => {
      const wrapper = mountReveal({ animate: true })
      expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)
      expect(scene(wrapper).props('marks')).toEqual([])

      vi.advanceTimersByTime(SOLUTION_DELAY_MS + 100)
      await nextTick()

      expect(scene(wrapper).props('marks')).toHaveLength(1)
    })

    it('drops the pending beat when it unmounts first', () => {
      const wrapper = mountReveal({ animate: true })
      vi.advanceTimersByTime(100)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('preselects my tip; another name shows theirs; tapping it again returns to mine', async () => {
    const wrapper = mountReveal()
    expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual([{ x: 1, y: 0, z: 0, type: 'BRICKS' }])

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)
  })

  it('shows the template as it stands without a tip of my own, nobody selected', () => {
    const wrapper = mountReveal({ myGuess: null, myOutcome: null, mineUserId: null })

    expect(scene(wrapper).props('blocks')).toEqual(PAYLOAD.blocks)
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0)
  })
})
