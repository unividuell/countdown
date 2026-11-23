import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import CopyBlocksReveal from '@/games/copyblocks/CopyBlocksReveal.vue'
import { fieldOf } from '@/games/copyblocks/field'
import { toGuess } from '@/games/copyblocks/fit'
import type { Fit } from '@/games/copyblocks/fit'
import type { ScoreRow } from '@/games/copyblocks/scoreboard'
import type { CopyBlocksOutcome, CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'
import { SPIN_MS, START_CAMERA } from '@/games/copyblocks/view'
import type { Camera } from '@/games/copyblocks/view'
import { SURFACE_CONTAINER } from '@/ui/surfaceTone'
import { VERDICT_AT_MS } from '@/games/__tests__/timelineTiming'
import { playVerdict } from '@/ui/verdictSound'
import { soundOnStage } from '@/ui/useSoundAwake'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import { TIMELINE_TIMERS } from '@/games/__tests__/timelineTiming'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

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
    kdLabel: null,
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
      won: null,
      ...over,
    },
    global: { stubs: { BlockScene: true } },
  })
}

const scene = (w: ReturnType<typeof mountReveal>) => w.getComponent(BlockScene)

/** Every yaw the reveal handed back up through the camera model, in order. */
const yaws = (w: ReturnType<typeof mountReveal>) =>
  (w.emitted('update:camera') ?? []).map(([camera]) => (camera as Camera).yaw)

/** A template block as the player with [fit] sees it. */
function seen(fit: Fit, b: GuessBlock): GuessBlock {
  const [x, y, z] = toGuess(fit, [b.x, b.y, b.z])
  return { x, y, z, type: b.type }
}

/** A `matchMedia` answer the scenes can also subscribe to: their ground follows the mode. */
function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as MediaQueryList
}

describe('CopyBlocksReveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('grounds the reveal in the container tone of the mode, as the board', () => {
    localStorage.setItem('color-scheme', 'dark')
    expect(scene(mountReveal()).props('background')).toBe(SURFACE_CONTAINER.dark)
    localStorage.clear()
  })

  it('keeps the camera on the submitted build, so nothing moves at the switch', async () => {
    // Grid 1: the template reaches one cell further than my build, so the two fields differ.
    const payload = { ...PAYLOAD, grid: 1 }
    const mine = fieldOf(MY_GUESS, 1)
    expect(fieldOf(PAYLOAD.blocks, 1)).not.toEqual(mine)

    const wrapper = mountReveal({ payload })
    expect(scene(wrapper).props('frame')).toEqual(mine)

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('frame')).toEqual(mine)
  })

  describe('a lone block of a type the template never uses', () => {
    // What CopyBlocksJudgeTest pins for this case: the block lands on the leftmost template block,
    // which sits one up, so the rest of the solution reaches below my floor.
    const STEPS: CopyBlocksPayload = {
      grid: 6,
      types: ['DIRT', 'BRICKS', 'LEAVES', 'PACKED_ICE', 'STONE'],
      blocks: [
        { x: 0, y: 1, z: 0, type: 'DIRT' },
        { x: 1, y: 1, z: 0, type: 'STONE' },
        { x: 1, y: 0, z: 0, type: 'BRICKS' },
      ],
    }
    const LONE: GuessBlock[] = [{ x: 3, y: 0, z: 3, type: 'LEAVES' }]
    const JUDGED: CopyBlocksOutcome = {
      correct: false,
      fit: { turns: 0, dx: -3, dy: 1, dz: -3 },
      missing: [
        { x: 1, y: 1, z: 0, type: 'STONE' },
        { x: 1, y: 0, z: 0, type: 'BRICKS' },
      ],
      extra: [],
      wrongType: [{ x: 0, y: 1, z: 0, type: 'LEAVES' }],
    }

    it('marks it as the wrong type, the rest as missing, and lays the floor under all of it', () => {
      const wrapper = mountReveal({
        payload: STEPS,
        myGuess: LONE,
        myOutcome: JUDGED,
        rows: [row('me', JUDGED)],
      })

      expect(scene(wrapper).props('blocks')).toEqual(LONE)
      expect(scene(wrapper).props('marks')).toEqual([
        { x: 4, y: 0, z: 3, type: 'STONE', kind: 'missing' },
        { x: 4, y: -1, z: 3, type: 'BRICKS', kind: 'missing' },
        { x: 3, y: 0, z: 3, type: 'LEAVES', kind: 'wrongType' },
      ])
      expect(scene(wrapper).props('field').lo[1]).toBe(-1)
      expect(scene(wrapper).props('frame')).toEqual(fieldOf(LONE, 6))
    })
  })

  describe('a tip that matched only the top of the template', () => {
    // Two stacked blocks; I built only the upper one, on my floor at y = 0.
    const STACK: CopyBlocksPayload = {
      grid: 6,
      types: ['DIRT', 'BRICKS', 'LEAVES'],
      blocks: [
        { x: 0, y: 0, z: 0, type: 'DIRT' },
        { x: 0, y: 1, z: 0, type: 'BRICKS' },
      ],
    }
    const TOP: GuessBlock[] = [{ x: 0, y: 0, z: 0, type: 'BRICKS' }]
    const LIFTED: CopyBlocksOutcome = {
      correct: false,
      fit: { turns: 0, dx: 0, dy: 1, dz: 0 },
      missing: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
      extra: [],
      wrongType: [],
    }
    const props = {
      payload: STACK,
      myGuess: TOP,
      myOutcome: LIFTED,
      rows: [row('me', LIFTED)],
    }

    it('lays the floor under the solution, not through it, and frames as before', () => {
      const wrapper = mountReveal(props)

      expect(scene(wrapper).props('field').lo[1]).toBe(-1)
      expect(scene(wrapper).props('frame')).toEqual(fieldOf(TOP, 6))
    })

    it('keeps my floor until the verdict, then lowers it with the solution', async () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
      })
      vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(false))
      const wrapper = mountReveal({ ...props, animate: true })
      expect(scene(wrapper).props('field')).toEqual(fieldOf(TOP, 6))

      vi.advanceTimersByTime(VERDICT_AT_MS + 100)
      await nextTick()

      expect(scene(wrapper).props('field').lo[1]).toBe(-1)
      expect(scene(wrapper).props('frame')).toEqual(fieldOf(TOP, 6))
    })
  })

  it('centres the view again, as on the board', async () => {
    const wrapper = mountReveal({ camera: { yaw: 2, pitch: -0.3, zoom: 0.4, target: [1, 2, 3] } })

    await wrapper.get('button[aria-label="Zentrieren"]').trigger('click')

    expect(wrapper.emitted('update:camera')).toEqual([
      [{ yaw: 2, pitch: -0.3, zoom: 1, target: null }],
    ])
  })

  it('marks the errors by default, and the box beneath the view takes them away', async () => {
    const wrapper = mountReveal()
    const box = wrapper.get<HTMLInputElement>('input[type="checkbox"]')
    expect(wrapper.get('[data-test="copy-blocks-mark-errors"]').text()).toBe('Fehler markieren')
    expect(box.element.checked).toBe(true)
    expect(scene(wrapper).props('marks')).toHaveLength(1)

    await box.setValue(false)
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)

    await box.setValue(true)
    expect(scene(wrapper).props('marks')).toHaveLength(1)
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
      vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(false))
    })

    it('shows my build as it stood, and marks the errors with the verdict', async () => {
      vi.mocked(playVerdict).mockClear()
      const wrapper = mountReveal({ animate: true, won: false })
      expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)

      vi.advanceTimersByTime(VERDICT_AT_MS - 50)
      await nextTick()
      expect(scene(wrapper).props('marks')).toEqual([])
      expect(playVerdict).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      await nextTick()

      expect(scene(wrapper).props('marks')).toHaveLength(1)
      expect(playVerdict).toHaveBeenCalledOnce()
    })

    it('turns the view once around at the verdict, and ends where it began', () => {
      const wrapper = mountReveal({ animate: true })

      vi.advanceTimersByTime(VERDICT_AT_MS - 90)
      expect(yaws(wrapper)).toEqual([])

      vi.advanceTimersByTime(90 + SPIN_MS / 2)
      expect(Math.max(...yaws(wrapper))).toBeGreaterThan(START_CAMERA.yaw + 2)

      vi.advanceTimersByTime(SPIN_MS)
      expect(yaws(wrapper).at(-1)).toBe(START_CAMERA.yaw)

      const settled = yaws(wrapper).length
      vi.advanceTimersByTime(1000)
      expect(yaws(wrapper)).toHaveLength(settled)
    })

    it('stops turning as soon as a finger touches the view', async () => {
      const wrapper = mountReveal({ animate: true })
      vi.advanceTimersByTime(VERDICT_AT_MS + 200)
      const turned = yaws(wrapper).length
      expect(turned).toBeGreaterThan(0)

      await wrapper.get('[data-test="copy-blocks-reveal-view"]').trigger('pointerdown')
      vi.advanceTimersByTime(SPIN_MS)

      expect(yaws(wrapper)).toHaveLength(turned)
    })

    it('never turns on a reload', () => {
      const wrapper = mountReveal({ animate: false })

      vi.advanceTimersByTime(VERDICT_AT_MS + 2 * SPIN_MS)

      expect(yaws(wrapper)).toEqual([])
    })

    it('stops turning when it unmounts', () => {
      const wrapper = mountReveal({ animate: true })
      vi.advanceTimersByTime(VERDICT_AT_MS + 200)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('drops the pending beat when it unmounts first', () => {
      const wrapper = mountReveal({ animate: true })
      vi.advanceTimersByTime(100)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('preselects my tip; another name shows theirs; the same name again leaves the solution alone', async () => {
    const wrapper = mountReveal()
    expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual([{ x: 1, y: 0, z: 0, type: 'BRICKS' }])

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual(PAYLOAD.blocks)
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0)
  })

  it('lets go of my own tip too, and draws the bare solution in my own coordinates', async () => {
    const turned: CopyBlocksOutcome = { ...MINE, fit: { turns: 1, dx: 2, dy: 0, dz: 0 } }
    const wrapper = mountReveal({
      myOutcome: turned,
      rows: [row('me', turned), row('them', THEIRS)],
    })

    await wrapper.get('[data-test="select-me"]').trigger('click')

    expect(scene(wrapper).props('blocks')).toEqual(PAYLOAD.blocks.map((b) => seen(turned.fit, b)))
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('false')
  })

  it('shows the template as it stands without a tip of my own, nobody selected', () => {
    const wrapper = mountReveal({ myGuess: null, myOutcome: null, mineUserId: null })

    expect(scene(wrapper).props('blocks')).toEqual(PAYLOAD.blocks)
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0)
  })

  describe('verdict', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
      })
      vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(false))
      vi.mocked(playVerdict).mockClear()
      stopVerdict.mockClear()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('plays mine at the verdict', () => {
      mountReveal({ animate: true, won: true })
      vi.advanceTimersByTime(VERDICT_AT_MS - 50)
      expect(playVerdict).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(true)
    })

    it('stays silent on a reload into a round already revealed', () => {
      mountReveal({ animate: false, won: false })
      vi.advanceTimersByTime(VERDICT_AT_MS)

      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('leaving cuts a verdict that is sounding', () => {
      const wrapper = mountReveal({ animate: true, won: false })
      vi.advanceTimersByTime(VERDICT_AT_MS)
      wrapper.unmount()

      expect(stopVerdict).toHaveBeenCalled()
    })

    it('asks the header to wake the graph while here', () => {
      mountReveal()

      expect(soundOnStage.value).toBe(true)
    })
  })

  // The rule every reveal keeps — see `judgesWithVerdict`.
  it('judges with its verdict: the error marks land with my row and its sound', async () => {
    vi.useFakeTimers({ toFake: [...TIMELINE_TIMERS, 'setInterval', 'clearInterval'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    try {
      await expectJudgesWithVerdict({
        mount: () =>
          mountReveal({
            animate: true,
            won: false,
            rows: [row('me', MINE), { ...row('them', THEIRS), tick: 1 }],
          }),
        mineUserId: 'me',
        judging: (w) => (w.getComponent(BlockScene).props('marks') as unknown[]).length > 0,
        verdict: 'sound',
      })
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
