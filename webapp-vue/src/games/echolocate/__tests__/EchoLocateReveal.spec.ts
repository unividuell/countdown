import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Ref } from 'vue'
import type { RoundAssets } from '@/api/assets'
import { gameEntry } from '@/games/__tests__/gameFixtures'
import EchoLocateReveal from '@/games/echolocate/EchoLocateReveal.vue'
import { scoreRows } from '@/games/echolocate/scoreboard'
import SonarField from '@/games/echolocate/SonarField.vue'
import type {
  EchoLocateGuess,
  EchoLocatePayload,
  EchoLocateSolution,
  Point,
} from '@/games/echolocate/types'
import type { GameEntry } from '@/games/GameEntry'
import { FADE_MS, SOLUTION_DELAY_MS, VERDICT_MS } from '@/games/revealChoreography'
import { TIMELINE_TIMERS, VERDICT_AT_MS } from '@/games/__tests__/timelineTiming'
import { playVerdict } from '@/ui/verdictSound'
import { soundOnStage } from '@/ui/useSoundAwake'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

const { loadSealed } = vi.hoisted(() => ({ loadSealed: vi.fn() }))
vi.mock('@/api/assets', async (original) => ({
  ...(await original<typeof import('@/api/assets')>()),
  loadSealed,
}))

/** The real composable owns an `Audio` element happy-dom cannot sound. */
const { playback } = vi.hoisted(() => ({
  playback: {} as { playing: Ref<boolean>; setSource: Mock; resume: Mock; pause: Mock },
}))
vi.mock('@/ui/usePlayback', async () => {
  const { ref } = await import('vue')
  return {
    usePlayback: () => {
      Object.assign(playback, {
        playing: ref(false),
        setSource: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      })
      return playback
    },
  }
})

enableAutoUnmount(afterEach)

const PAYLOAD: EchoLocatePayload = {
  grid: 20,
  reach: 12,
  speed: 3,
  pings: 3,
  clips: 1,
  bedDb: -24,
  noiseDb: 0,
  toleranceRadius: 1.5,
}
const TWO: EchoLocatePayload = { ...PAYLOAD, clips: 2 }
const PHASE_TWO: EchoLocatePayload = { ...PAYLOAD, toleranceRadius: null }

const SOLUTION: EchoLocateSolution = {
  targets: [{ col: 5, row: 7 }],
  noises: [
    { cell: { col: 1, row: 1 }, kind: 'BIRDS' },
    { cell: { col: 14, row: 3 }, kind: 'COW' },
  ],
  toleranceRadius: 1.5,
}
const SOLUTION_TWO: EchoLocateSolution = {
  ...SOLUTION,
  targets: [
    { col: 5, row: 7 },
    { col: 15, row: 12 },
  ],
}
const PHASE_TWO_SOLUTION: EchoLocateSolution = { ...SOLUTION, toleranceRadius: null }

const wave = (at: Point) => ({ at, startMs: null, endMs: null })

const PINGS: Record<string, Point[]> = {
  me: [
    { x: 2, y: 3 },
    { x: 8, y: 9 },
    { x: 14, y: 5 },
  ],
  anna: [
    { x: 3, y: 4 },
    { x: 9, y: 10 },
    { x: 12, y: 6 },
  ],
  bert: [
    { x: 17, y: 2 },
    { x: 11, y: 15 },
    { x: 6, y: 16 },
  ],
}
const GUESSES: Record<string, EchoLocateGuess> = {
  me: { pins: [{ x: 5.4, y: 7.2 }], rings: [[4], [2.5], []] },
  anna: { pins: [{ x: 6.1, y: 8.4 }], rings: [[3.5], [], [6]] },
  bert: { pins: [{ x: 11.5, y: 4.5 }], rings: [[], [5], [8]] },
}

const COLORS: Record<string, string> = { me: '#2563eb', anna: '#f59e0b', bert: '#111827' }

/** A player's pin as the map gets it from someone else: in that player's colour. */
const theirs = (userId: string) => ({ at: GUESSES[userId]!.pins[0], colorHex: COLORS[userId] })

/** A judged entry with its own pings, pin, rings and colour; its distance as given. */
function entry(userId: string, distance: number, over: Partial<GameEntry> = {}): GameEntry {
  return gameEntry({
    userId,
    avatar: { bgColorHex: COLORS[userId] ?? '#7c3aed' },
    guess: GUESSES[userId] ?? GUESSES['anna'],
    outcome: { distance, withinTolerance: true, pinOf: [0] },
    points: 1,
    steps: PINGS[userId] ?? PINGS['anna']!,
    ...over,
  })
}

const ENTRIES = [entry('me', 0.8), entry('anna', 1.6), entry('bert', 7.2)]

function mountReveal(over: { entries?: GameEntry[] } & Record<string, unknown> = {}) {
  const { entries = ENTRIES, ...props } = over
  const mineUserId = 'mineUserId' in props ? (props['mineUserId'] as string | null) : null
  const payload = (props['payload'] as EchoLocatePayload | undefined) ?? PAYLOAD

  return mount(EchoLocateReveal, {
    props: {
      payload,
      solution: SOLUTION,
      rows: scoreRows({ entries, awardRule: 'ALL_QUALIFYING', mineUserId, payload }),
      live: false,
      animate: false,
      mineUserId,
      won: null,
      ...props,
    },
    global: { stubs: { SonarField: true } },
  })
}

type Reveal = ReturnType<typeof mountReveal>

const fields = (w: Reveal) => w.findAllComponents(SonarField)
const map = (w: Reveal) => fields(w)[0]!

/** Taps like a finger: awaiting lets the field settle. */
async function tap(w: Reveal, userId: string) {
  await w.get(`[data-test="select-${userId}"]`).trigger('click')
}

function useBeats() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  })
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
}

describe('EchoLocateReveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('the map', () => {
    it("shows clips, the noises and every pin in its player's colour", () => {
      const wrapper = mountReveal()

      expect(fields(wrapper)).toHaveLength(1)
      expect(map(wrapper).props()).toMatchObject({
        grid: 20,
        speed: 3,
        reach: 12,
        solution: SOLUTION,
        pending: null,
        waves: [],
        rings: [],
        pins: [],
        links: [],
        otherPins: [theirs('me'), theirs('anna'), theirs('bert')],
      })
    })

    it('hands on the solution of phase two as it is, with no tolerance', () => {
      const wrapper = mountReveal({ payload: PHASE_TWO, solution: PHASE_TWO_SOLUTION })

      expect(map(wrapper).props('solution')).toEqual(PHASE_TWO_SOLUTION)
      expect(map(wrapper).props('solution')?.toleranceRadius).toBeNull()
    })

    it('leaves the pins of rows without a play off the map', () => {
      const wrapper = mountReveal({
        entries: [
          entry('anna', 1.6),
          entry('gave-up', 0, { guess: null, outcome: null, points: 0 }),
          entry('junk-guess', 3, { guess: { pins: 'x', rings: [] } }),
          entry('junk-outcome', 0, { outcome: { distance: 'x' } }),
        ],
      })

      expect(map(wrapper).props('otherPins')).toEqual([theirs('anna')])
    })
  })

  describe('a tapped name', () => {
    it('shows a tapped player`s pings, rings, pins and links, and hides them again', async () => {
      const wrapper = mountReveal()

      await tap(wrapper, 'anna')

      expect(map(wrapper).props()).toMatchObject({
        waves: PINGS['anna']!.map(wave),
        rings: GUESSES['anna']!.rings,
        pins: GUESSES['anna']!.pins,
        pinColorHex: COLORS['anna'],
        links: [[GUESSES['anna']!.pins[0], SOLUTION.targets[0]]],
        solution: SOLUTION,
        // The others stay, smaller; hers is drawn as her own, not twice.
        otherPins: [theirs('me'), theirs('bert')],
      })
      expect(wrapper.get('[data-test="select-anna"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-test="select-bert"]').attributes('aria-pressed')).toBe('false')

      await tap(wrapper, 'anna')

      expect(map(wrapper).props()).toMatchObject({ waves: [], rings: [], pins: [], links: [] })
      expect(map(wrapper).props('otherPins')).toHaveLength(3)
      expect(wrapper.get('[data-test="select-anna"]').attributes('aria-pressed')).toBe('false')
    })

    it('shows one player at a time: another name takes the place of the first', async () => {
      const wrapper = mountReveal()

      await tap(wrapper, 'anna')
      await tap(wrapper, 'bert')

      expect(map(wrapper).props('waves')).toEqual(PINGS['bert']!.map(wave))
      expect(map(wrapper).props('pins')).toEqual(GUESSES['bert']!.pins)
      expect(wrapper.get('[data-test="select-anna"]').attributes('aria-pressed')).toBe('false')
      expect(wrapper.get('[data-test="select-bert"]').attributes('aria-pressed')).toBe('true')
    })

    it('links each pin to the clip the server matched it with', async () => {
      const guess: EchoLocateGuess = {
        pins: [
          { x: 14.5, y: 12.5 },
          { x: 5.5, y: 7.5 },
        ],
        rings: [],
      }
      const wrapper = mountReveal({
        payload: TWO,
        solution: SOLUTION_TWO,
        entries: [
          entry('anna', 0.7, {
            guess,
            outcome: { distance: 0.7, withinTolerance: true, pinOf: [1, 0] },
          }),
        ],
      })

      await tap(wrapper, 'anna')

      expect(map(wrapper).props('links')).toEqual([
        [guess.pins[1], SOLUTION_TWO.targets[0]],
        [guess.pins[0], SOLUTION_TWO.targets[1]],
      ])
    })

    it('shows the pins but no pings when one ping cannot be read', async () => {
      const wrapper = mountReveal({
        entries: [entry('anna', 1.6, { steps: [{ x: 3, y: 4 }, 'junk', { x: 12, y: 6 }] })],
      })

      await tap(wrapper, 'anna')

      expect(map(wrapper).props('waves')).toEqual([])
      expect(map(wrapper).props('pins')).toEqual(GUESSES['anna']!.pins)
    })

    it('skips a selected player whose row has gone', async () => {
      const wrapper = mountReveal()
      await tap(wrapper, 'anna')

      await wrapper.setProps({
        rows: scoreRows({
          entries: [ENTRIES[0]!, ENTRIES[2]!],
          awardRule: 'ALL_QUALIFYING',
          mineUserId: null,
          payload: PAYLOAD,
        }),
      })

      expect(map(wrapper).props()).toMatchObject({ waves: [], pins: [], links: [] })
      expect(map(wrapper).props('otherPins')).toHaveLength(2)
    })
  })

  describe('listening', () => {
    const ASSETS: RoundAssets = {
      url: (name) => `/assets/${name}`,
      key: () => ({ key: 'AAAA', mediaType: 'audio/mpeg' }),
    }

    beforeEach(() => {
      loadSealed.mockReset()
      loadSealed.mockImplementation((_assets: RoundAssets, name: string) =>
        Promise.resolve(new Blob([name])),
      )
      let made = 0
      URL.createObjectURL = vi.fn(() => `blob:clip-${made++}`)
      URL.revokeObjectURL = vi.fn()
    })

    const listen = async (w: Reveal, clip: number) => {
      map(w).vm.$emit('listen', clip)
      await flushPromises()
    }

    it('lets the map hear clips only with their key', () => {
      expect(map(mountReveal({ assets: ASSETS })).props('listenable')).toBe(true)
      expect(map(mountReveal({ assets: { ...ASSETS, key: () => null } })).props('listenable')).toBe(
        false,
      )
      expect(map(mountReveal()).props('listenable')).toBe(false)
    })

    it('opens a clip on its first click and plays it', async () => {
      const wrapper = mountReveal({ solution: SOLUTION_TWO, payload: TWO, assets: ASSETS })
      expect(loadSealed).not.toHaveBeenCalled()

      await listen(wrapper, 1)

      expect(loadSealed).toHaveBeenCalledExactlyOnceWith(ASSETS, 'clip-1')
      expect(playback.setSource).toHaveBeenCalledExactlyOnceWith('blob:clip-0')
      expect(playback.resume).toHaveBeenCalledOnce()
    })

    it('pauses the clip sounding on its own click, and lights its circle meanwhile', async () => {
      const wrapper = mountReveal({ solution: SOLUTION_TWO, payload: TWO, assets: ASSETS })
      await listen(wrapper, 0)
      playback.playing.value = true
      await nextTick()
      expect(map(wrapper).props('playing')).toBe(0)

      await listen(wrapper, 0)

      expect(playback.pause).toHaveBeenCalledOnce()
      expect(playback.resume).toHaveBeenCalledOnce()
    })

    it('switches to another clip, opening each only once', async () => {
      const wrapper = mountReveal({ solution: SOLUTION_TWO, payload: TWO, assets: ASSETS })
      await listen(wrapper, 0)
      await listen(wrapper, 1)
      await listen(wrapper, 0)

      expect(loadSealed).toHaveBeenCalledTimes(2)
      expect(playback.setSource.mock.calls).toEqual([
        ['blob:clip-0'],
        ['blob:clip-1'],
        ['blob:clip-0'],
      ])
    })

    it('starts only the newest click, though an older clip loads later', async () => {
      let open!: (blob: Blob) => void
      loadSealed.mockImplementationOnce(() => new Promise((resolve) => (open = resolve)))
      const wrapper = mountReveal({ solution: SOLUTION_TWO, payload: TWO, assets: ASSETS })

      map(wrapper).vm.$emit('listen', 0)
      await listen(wrapper, 1)
      open(new Blob(['late']))
      await flushPromises()

      expect(playback.setSource.mock.calls).toEqual([['blob:clip-0']])
      expect(playback.resume).toHaveBeenCalledOnce()
    })

    it('plays nothing when a clip fails, and tries again on the next click', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      loadSealed.mockRejectedValueOnce(new Error('gone'))
      const wrapper = mountReveal({ assets: ASSETS })

      await listen(wrapper, 0)
      expect(playback.resume).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()

      await listen(wrapper, 0)
      expect(loadSealed).toHaveBeenCalledTimes(2)
      expect(playback.resume).toHaveBeenCalledOnce()
    })

    it('lets go of the opened clips when it leaves', async () => {
      const wrapper = mountReveal({ assets: ASSETS })
      await listen(wrapper, 0)

      wrapper.unmount()
      await flushPromises()

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clip-0')
    })
  })

  describe('opening', () => {
    it('opens on my own pings, rings and pin after a reload', () => {
      const wrapper = mountReveal({ mineUserId: 'me' })

      expect(fields(wrapper)).toHaveLength(1)
      expect(map(wrapper).props()).toMatchObject({
        waves: PINGS['me']!.map(wave),
        rings: GUESSES['me']!.rings,
        pins: GUESSES['me']!.pins,
        pinColorHex: COLORS['me'],
        otherPins: [theirs('anna'), theirs('bert')],
      })
      expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('true')
    })

    it('opens on the bare map without a play of mine', () => {
      const wrapper = mountReveal({
        mineUserId: 'me',
        entries: [entry('me', 0, { guess: null, outcome: null, points: 0 }), ENTRIES[1]!],
      })

      expect(map(wrapper).props()).toMatchObject({ waves: [], pins: [], links: [] })
      expect(wrapper.find('[data-test="select-me"]').exists()).toBe(false)
    })

    it('takes my name off again like any other', async () => {
      const wrapper = mountReveal({ mineUserId: 'me' })

      await tap(wrapper, 'me')

      expect(map(wrapper).props()).toMatchObject({ waves: [], pins: [], links: [] })
      expect(map(wrapper).props('otherPins')).toHaveLength(3)
    })
  })

  describe('with animation', () => {
    const own = (w: Reveal) => w.get<HTMLElement>('[data-test="echo-locate-own"]')

    it('keeps my own field, then fades the map in under it at SOLUTION_DELAY_MS', async () => {
      useBeats()
      const wrapper = mountReveal({ animate: true, mineUserId: 'me' })

      // My field alone lies over the same field on the map, which waits underneath.
      expect(fields(wrapper)).toHaveLength(2)
      expect(map(wrapper).props('solution')).toEqual(SOLUTION)
      expect(fields(wrapper)[1]!.props()).toMatchObject({
        waves: PINGS['me']!.map(wave),
        rings: GUESSES['me']!.rings,
        pins: GUESSES['me']!.pins,
        pinColorHex: COLORS['me'],
      })
      // Nothing of the solution, nobody else's pins: my field as the board left it.
      expect(fields(wrapper)[1]!.props('solution')).toBeUndefined()
      expect(fields(wrapper)[1]!.props('otherPins')).toBeUndefined()
      expect(fields(wrapper)[1]!.props('links')).toBeUndefined()
      expect(own(wrapper).element.style.opacity).toBe('1')

      vi.advanceTimersByTime(SOLUTION_DELAY_MS - 100)
      await nextTick()
      expect(own(wrapper).element.style.opacity).toBe('1')

      vi.advanceTimersByTime(200)
      await nextTick()
      expect(own(wrapper).element.style.opacity).toBe('0')
      expect(own(wrapper).element.style.transitionDuration).toBe(`${FADE_MS}ms`)
    })

    it('puts the others’ pins on the map only once my verdict has rung out', async () => {
      useBeats()
      const wrapper = mountReveal({ animate: true, mineUserId: 'me' })

      vi.advanceTimersByTime(VERDICT_AT_MS)
      await nextTick()
      expect(map(wrapper).props('otherPins')).toEqual([])

      vi.advanceTimersByTime(VERDICT_MS)
      await nextTick()
      expect(map(wrapper).props('otherPins')).toHaveLength(2)
    })

    it('lets a finger through to the map while my field covers it', () => {
      useBeats()
      const wrapper = mountReveal({ animate: true, mineUserId: 'me' })

      expect(own(wrapper).classes()).toContain('pointer-events-none')
      expect(own(wrapper).attributes('aria-hidden')).toBe('true')
    })

    it('has nothing to fade from without a play of mine', () => {
      useBeats()

      expect(fields(mountReveal({ animate: true, mineUserId: null }))).toHaveLength(1)
      expect(
        fields(
          mountReveal({
            animate: true,
            mineUserId: 'me',
            entries: [entry('me', 0, { guess: null, outcome: null, points: 0 }), ENTRIES[1]!],
          }),
        ),
      ).toHaveLength(1)
    })

    it('starts no beat that outlives it', () => {
      useBeats()
      const wrapper = mountReveal({ animate: true, mineUserId: 'me' })

      // Past the arming frames, the solution beat is waiting.
      vi.advanceTimersByTime(100)
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      wrapper.unmount()

      expect(vi.getTimerCount()).toBe(0)
    })

    it('shows the map at once under reduced motion', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] })
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)

      expect(fields(mountReveal({ animate: true, mineUserId: 'me' }))).toHaveLength(1)
    })
  })

  describe('the ranking', () => {
    it('names the table and its column', () => {
      const wrapper = mountReveal()

      expect(wrapper.get('caption').text()).toBe('Alle Peilungen der Runde, nach Abstand sortiert')
      expect(wrapper.text()).toContain('Abstand')
    })

    it('lists the distances, nearest first, with the mean of two clips marked', () => {
      const one = mountReveal({ entries: [ENTRIES[2]!, ENTRIES[1]!, ENTRIES[0]!] })

      expect(one.findAll('th[scope="row"]').map((th) => th.text())).toEqual(['me', 'anna', 'bert'])
      expect(one.get('[data-test="cell-distance-me"]').text()).toBe('0,80')
      expect(one.get('[data-test="cell-distance-bert"]').text()).toBe('7,20')

      const two = mountReveal({
        payload: TWO,
        solution: SOLUTION_TWO,
        entries: [
          entry('anna', 2.34, {
            guess: {
              pins: [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
              ],
              rings: [],
            },
            outcome: { distance: 2.34, withinTolerance: false, pinOf: [0, 1] },
          }),
        ],
      })

      expect(two.get('[data-test="cell-distance-anna"]').text()).toBe('Ø 2,34')
    })

    it('heads the distance with the tolerance in phase one only, never a cell', () => {
      const one = mountReveal()
      const two = mountReveal({ payload: PHASE_TWO, solution: PHASE_TWO_SOLUTION })

      expect(one.get('#distance-fact').text()).toBe('Toleranz')
      expect(one.get('[data-test="distance-tolerance"]').text()).toBe('≤ 1,50')
      expect(two.find('#distance-fact').exists()).toBe(false)
      expect(two.find('[data-test="distance-tolerance"]').exists()).toBe(false)

      for (const wrapper of [one, two]) {
        expect(wrapper.text()).not.toContain('Zelle')
      }
    })

    // What decides stands furthest right, next to the points: the distance, in phase two the clock.
    it('orders the columns pings, distance, clock — the clock the frame’s, before „Pkt“', () => {
      const band = (wrapper: ReturnType<typeof mountReveal>) =>
        wrapper.findAll('[data-test="scoreboard-band"] th').map((cell) => cell.text())

      expect(band(mountReveal())).toEqual(['Name', 'Pings', 'Abstand', 'Pkt'])
      expect(
        band(mountReveal({ entries: [entry('me', 0.8, { durationMs: 95_000, points: 0 })] })),
      ).toEqual(['Name', 'Pings', 'Abstand', 'Zeit', 'Pkt'])
    })

    it('keeps pings and distance narrow', () => {
      const widths = mountReveal()
        .findAll('col')
        .map((col) => col.attributes('style'))

      expect(widths.slice(1, 3)).toEqual(['width: 3rem;', 'width: 4rem;'])
    })

    it('counts every player’s pings', () => {
      const wrapper = mountReveal()

      expect(wrapper.text()).toContain('Pings')
      expect(wrapper.get('[data-test="cell-pings-me"]').text()).toBe('3')
    })

    // Phase two runs on the clock: the table adds the time, the caption says what ranks.
    it('sorts a timed round by its clock', () => {
      const wrapper = mountReveal({
        entries: [
          entry('me', 0.8, { durationMs: 95_000, points: 0 }),
          entry('anna', 1.4, { durationMs: 41_000, points: 3 }),
        ],
      })

      expect(wrapper.get('caption').text()).toBe(
        'Alle Peilungen der Runde, Treffer nach Zeit sortiert',
      )
      expect(wrapper.findAll('th[scope="row"]').map((th) => th.text())).toEqual(['anna', 'me'])
    })

    it('offers no button for a row without a play, and says nothing of its distance', () => {
      const wrapper = mountReveal({
        entries: [
          ...ENTRIES,
          entry('gave-up', 0, { guess: null, outcome: null, points: 0 }),
          entry('junk-guess', 3, { guess: { pins: 'x', rings: [] } }),
          entry('junk-outcome', 0, { outcome: { distance: 'x' } }),
        ],
      })

      const names = wrapper.findAll('th[scope="row"]').map((th) => th.text())
      expect(names).toEqual(['me', 'anna', 'bert', 'gave-up', 'junk-guess', 'junk-outcome'])
      expect(wrapper.find('[data-test="select-anna"]').exists()).toBe(true)
      for (const id of ['gave-up', 'junk-guess', 'junk-outcome']) {
        expect(wrapper.find(`[data-test="select-${id}"]`).exists()).toBe(false)
        expect(wrapper.get(`[data-test="cell-distance-${id}"]`).text()).toBe('—')
      }
    })

    it('carries the live chip when the round can still be overtaken', () => {
      expect(mountReveal().find('[data-test="scoreboard-live"]').exists()).toBe(false)
      expect(mountReveal({ live: true }).find('[data-test="scoreboard-live"]').exists()).toBe(true)
    })
  })

  describe('verdict', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
      vi.mocked(playVerdict).mockClear()
      stopVerdict.mockClear()
    })

    afterEach(() => {
      vi.useRealTimers()
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
  it('judges with its verdict: the map lands with my row and its sound', async () => {
    vi.useFakeTimers({ toFake: [...TIMELINE_TIMERS, 'setInterval', 'clearInterval'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList)
    try {
      await expectJudgesWithVerdict({
        mount: () => mountReveal({ animate: true, mineUserId: 'me', won: true }),
        mineUserId: 'me',
        judging: (w) => {
          const own = w.find<HTMLElement>('[data-test="echo-locate-own"]')
          return !own.exists() || own.element.style.opacity === '0'
        },
        verdict: 'sound',
      })
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })
})
