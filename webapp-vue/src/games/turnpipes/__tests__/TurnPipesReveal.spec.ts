import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import PipeGrid from '../PipeGrid.vue'
import { playSound, preloadSounds, startFlow } from '../sounds'
import TurnPipesReveal from '../TurnPipesReveal.vue'
import type { ScoreRow } from '../scoreboard'
import type { PipeKindCode, TurnPipesOutcome, TurnPipesPayload } from '../types'
import { waterStepMs } from '../water'

const stopFlow = vi.fn()

vi.mock('../sounds', () => ({
  playSound: vi.fn(),
  startFlow: vi.fn(() => ({ stop: stopFlow })),
  endSoundOf: ({ leak, correct }: { leak: unknown; correct: boolean }) =>
    leak ? 'leak' : correct ? 'success' : 'dry',
  preloadSounds: vi.fn(),
}))

const SIZE = 6
const STEP = waterStepMs(SIZE)
/** useRevealArming's two animation frames, with room to spare but less than a step past them. */
const ARMED_MS = 40
const KINDS: PipeKindCode[] = Array.from({ length: SIZE * SIZE }, () => 'ELBOW')
KINDS[0] = 'INLET'
KINDS[1] = 'OUTLET'
const PAYLOAD: TurnPipesPayload = {
  size: SIZE,
  kinds: KINDS,
  start: Array.from({ length: SIZE * SIZE }, () => 0),
}
const SOLUTION = {
  rotations: Array.from({ length: SIZE * SIZE }, () => 1),
  path: [0, 1, 2],
}
const MINE: TurnPipesOutcome = { correct: false, wet: [0, 1], leak: { at: 7, from: 1 } }
const THEIRS: TurnPipesOutcome = { correct: false, wet: [0], leak: null }
const MY_ROTATIONS = Array.from({ length: SIZE * SIZE }, () => 2)
const THEIR_ROTATIONS = Array.from({ length: SIZE * SIZE }, () => 3)

function row(userId: string, outcome: TurnPipesOutcome | null, rotations: number[] | null) {
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
    rotations,
  } as ScoreRow
}

function mountReveal(over: Record<string, unknown> = {}) {
  return mount(TurnPipesReveal, {
    props: {
      payload: PAYLOAD,
      solution: SOLUTION,
      rows: [row('me', MINE, MY_ROTATIONS), row('them', THEIRS, THEIR_ROTATIONS)],
      mineUserId: 'me',
      myRotations: MY_ROTATIONS,
      myOutcome: MINE,
      live: false,
      animate: false,
      ...over,
    },
  })
}

type Reveal = ReturnType<typeof mountReveal>
const grid = (w: Reveal) => w.getComponent(PipeGrid)
const wet = (w: Reveal) => [...(grid(w).props('wet') as ReadonlySet<number>)]
const puddles = (w: Reveal) => [...(grid(w).props('puddles') as ReadonlySet<number>)]
const rotationsOf = (w: Reveal) => (grid(w).props('turns') as number[]).map((t) => t % 4)

/** Lets the timers fire, then Vue render what they changed. */
async function advance(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as MediaQueryList
}

describe('TurnPipesReveal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(playSound).mockClear()
    vi.mocked(startFlow).mockClear()
    vi.mocked(preloadSounds).mockClear()
    stopFlow.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('live', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: [
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'requestAnimationFrame',
          'cancelAnimationFrame',
        ],
      })
      vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(false))
    })

    it('the water runs after SOLUTION_DELAY_MS along my wet cells, then a puddle lies at the leak', async () => {
      const wrapper = mountReveal({ animate: true })
      expect(wet(wrapper)).toEqual([])
      expect(puddles(wrapper)).toEqual([])

      await advance(SOLUTION_DELAY_MS + ARMED_MS)
      expect(wet(wrapper)).toEqual([])

      await advance(150 + STEP)
      expect(wet(wrapper)).toEqual([0])
      expect(puddles(wrapper)).toEqual([])

      await advance(STEP)
      expect(wet(wrapper)).toEqual([0, 1])
      expect(puddles(wrapper)).toEqual([7])
    })

    it('the run sounds: flow while it runs, then the end sound', async () => {
      mountReveal({ animate: true })
      await advance(SOLUTION_DELAY_MS + ARMED_MS + 150)
      expect(startFlow).toHaveBeenCalledOnce()
      expect(playSound).not.toHaveBeenCalled()

      await advance(2 * STEP)

      expect(stopFlow).toHaveBeenCalledWith(0.3)
      expect(playSound).toHaveBeenCalledExactlyOnceWith('leak')
    })

    it('stays silent when sound is off', () => {
      localStorage.setItem('games:sound', 'false')
      mountReveal({ animate: true })

      vi.advanceTimersByTime(SOLUTION_DELAY_MS + 1000)

      expect(startFlow).not.toHaveBeenCalled()
      expect(playSound).not.toHaveBeenCalled()
    })

    it('muting stops the running water at once', async () => {
      const wrapper = mountReveal({ animate: true })
      await advance(SOLUTION_DELAY_MS + ARMED_MS + 150)
      expect(startFlow).toHaveBeenCalledOnce()
      expect(stopFlow).not.toHaveBeenCalled()

      await wrapper.get('[aria-label="Ton"]').trigger('click')

      expect(stopFlow).toHaveBeenCalledExactlyOnceWith(0)
    })

    it('leaves no timer behind when it unmounts', () => {
      const wrapper = mountReveal({ animate: true })
      vi.advanceTimersByTime(SOLUTION_DELAY_MS + ARMED_MS + 150 + STEP)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('a reload shows the end at once — no run, no sound', () => {
    const wrapper = mountReveal({ animate: false })

    expect(wet(wrapper)).toEqual([0, 1])
    expect(puddles(wrapper)).toEqual([7])
    expect(startFlow).not.toHaveBeenCalled()
    expect(playSound).not.toHaveBeenCalled()
  })

  it('decodes its sounds itself — the board may not have mounted first', () => {
    mountReveal()

    expect(preloadSounds).toHaveBeenCalledOnce()
  })

  it('the grid bleeds card-wide like the board, without w-full on the bleeding box', () => {
    const box = grid(mountReveal()).element.parentElement!

    expect(box.classList).toContain('-mx-4')
    expect(box.classList).toContain('-mt-2')
    expect(box.classList).not.toContain('w-full')
  })

  it('draws the grid inert', () => {
    expect(grid(mountReveal()).props('interactive')).toBe(false)
  })

  it('tapping another name turns the grid to that tip; the same name again shows the solution', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const wrapper = mountReveal()
    expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('true')
    expect(rotationsOf(wrapper)[5]).toBe(2)

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(wet(wrapper)).toEqual([])
    await advance(150 + STEP)
    expect(startFlow).toHaveBeenCalledOnce()
    expect(rotationsOf(wrapper)[5]).toBe(3)
    expect(wet(wrapper)).toEqual([0])

    await wrapper.get('[data-test="select-them"]').trigger('click')
    await advance(150 + 3 * STEP)
    expect(startFlow).toHaveBeenCalledTimes(2)
    expect(rotationsOf(wrapper)[5]).toBe(1)
    expect(wet(wrapper)).toEqual([0, 1, 2])
    expect(puddles(wrapper)).toEqual([])
    expect(wrapper.findAll('[data-test^="select-"][aria-pressed="true"]')).toHaveLength(0)
  })

  it('an unreadable name can be tapped without error and shows the solution', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const wrapper = mountReveal({
      rows: [row('me', MINE, MY_ROTATIONS), row('them', null, null)],
    })

    await wrapper.get('[data-test="select-them"]').trigger('click')
    await advance(150 + 3 * STEP)

    expect(rotationsOf(wrapper)[5]).toBe(1)
    expect(wet(wrapper)).toEqual([0, 1, 2])
  })

  it('without a tip of my own the solution stands and nobody is selected', () => {
    const wrapper = mountReveal({ myRotations: null, myOutcome: null, mineUserId: null })

    expect(rotationsOf(wrapper)[5]).toBe(1)
    expect(wet(wrapper)).toEqual([0, 1, 2])
    expect(wrapper.findAll('[data-test^="select-"][aria-pressed="true"]')).toHaveLength(0)
  })
})
