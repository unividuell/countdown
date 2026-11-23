import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  CELL_STAGGER_MS,
  HEAD_DELAY_MS,
  ROW_STAGGER_MS,
  SOLUTION_DELAY_MS,
  VERDICT_MS,
  headDelayMs,
  othersDelayMs,
  rowStagger,
} from '@/games/revealChoreography'
import {
  provideRevealTimeline,
  useRevealTimeline,
  type Beat,
  type RevealTimeline,
} from '@/games/revealTimeline'
import { announceResults } from '@/ui/resultsLanding'
import { playVerdict } from '@/ui/verdictSound'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))
vi.mock('@/ui/resultsLanding', () => ({ announceResults: vi.fn() }))

/** Arming takes two animation frames; `open` falls inside this. */
const ARMED_MS = 40

const BEATS: Beat[] = ['open', 'head', 'story', 'verdict', 'others']

type Options = Parameters<typeof provideRevealTimeline>[0]

function host(over: Partial<Options> = {}) {
  let timeline!: RevealTimeline
  const wrapper = mount(
    defineComponent({
      setup() {
        timeline = provideRevealTimeline({ animate: true, won: () => true, ...over })
        return () => h('div')
      },
    }),
  )
  return { wrapper, timeline }
}

const reachedBeats = (t: RevealTimeline) => BEATS.filter((beat) => t.reached(beat).value)

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('revealTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    })
    vi.mocked(playVerdict).mockClear()
    vi.mocked(announceResults).mockClear()
    stopVerdict.mockClear()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setHidden(false)
  })

  describe('the beats', () => {
    it('reach in order from arming: open, head, story, verdict with it, others after the verdict', () => {
      const { timeline } = host()
      expect(reachedBeats(timeline)).toEqual([])

      vi.advanceTimersByTime(ARMED_MS)
      expect(reachedBeats(timeline)).toEqual(['open'])

      vi.advanceTimersByTime(HEAD_DELAY_MS)
      expect(reachedBeats(timeline)).toEqual(['open', 'head'])

      vi.advanceTimersByTime(SOLUTION_DELAY_MS - HEAD_DELAY_MS)
      expect(reachedBeats(timeline)).toEqual(['open', 'head', 'story', 'verdict'])

      vi.advanceTimersByTime(VERDICT_MS)
      expect(reachedBeats(timeline)).toEqual(BEATS)
    })

    it('runs a handler once at its beat, and at once for a beat already passed', () => {
      const { timeline } = host()
      const atStory = vi.fn()
      timeline.on('story', atStory)

      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)
      expect(atStory).toHaveBeenCalledOnce()

      const late = vi.fn()
      timeline.on('head', late)
      expect(late).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(VERDICT_MS)
      expect(atStory).toHaveBeenCalledOnce()
    })
  })

  describe('a story', () => {
    it('holds the verdict until every hold is released; others follow by VERDICT_MS', () => {
      const { timeline } = host()
      const water = timeline.hold()
      const count = timeline.hold()

      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS + 2000)
      expect(reachedBeats(timeline)).toEqual(['open', 'head', 'story'])

      water.release()
      expect(timeline.reached('verdict').value).toBe(false)
      count.release()
      expect(timeline.reached('verdict').value).toBe(true)
      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(true)

      vi.advanceTimersByTime(VERDICT_MS - 1)
      expect(timeline.reached('others').value).toBe(false)
      vi.advanceTimersByTime(1)
      expect(timeline.reached('others').value).toBe(true)
    })

    it('a release before the story only clears the hold: the verdict still waits for the story', () => {
      const { timeline } = host()
      timeline.hold().release()

      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS - 50)
      expect(timeline.reached('verdict').value).toBe(false)
      vi.advanceTimersByTime(50)
      expect(timeline.reached('verdict').value).toBe(true)
    })

    it('a silent release reaches the verdict without its sound', () => {
      const { timeline } = host()
      const story = timeline.hold()
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      story.releaseSilently()

      expect(timeline.reached('verdict').value).toBe(true)
      expect(playVerdict).not.toHaveBeenCalled()
      expect(announceResults).toHaveBeenCalledOnce()
    })

    it('a silent release still waits for any other hold', () => {
      const { timeline } = host()
      const first = timeline.hold()
      const second = timeline.hold()
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      first.releaseSilently()
      expect(timeline.reached('verdict').value).toBe(false)
      second.release()

      expect(timeline.reached('verdict').value).toBe(true)
      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('a hold taken after the verdict changes nothing', () => {
      const { timeline } = host()
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      const late = timeline.hold()
      late.release()
      late.releaseSilently()

      expect(timeline.reached('verdict').value).toBe(true)
      expect(playVerdict).toHaveBeenCalledOnce()
    })
  })

  describe('already judged', () => {
    it('reaches the verdict with the head, silently', () => {
      const { timeline } = host({ judged: 'before' })

      vi.advanceTimersByTime(ARMED_MS + HEAD_DELAY_MS)

      expect(reachedBeats(timeline)).toEqual(['open', 'head', 'story', 'verdict'])
      expect(playVerdict).not.toHaveBeenCalled()
    })
  })

  describe('the verdict sound and the roster', () => {
    it('plays my verdict and announces the results at the verdict', () => {
      host({ won: () => false })
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS - 50)
      expect(playVerdict).not.toHaveBeenCalled()
      expect(announceResults).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)

      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(false)
      expect(announceResults).toHaveBeenCalledOnce()
    })

    it('plays none without a verdict on a tip of mine, and still announces', () => {
      host({ won: () => null })
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      expect(playVerdict).not.toHaveBeenCalled()
      expect(announceResults).toHaveBeenCalledOnce()
    })

    it('leaving cuts a sounding verdict and fires nothing more', () => {
      const { wrapper, timeline } = host()
      const late = vi.fn()
      timeline.on('others', late)
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      wrapper.unmount()
      vi.advanceTimersByTime(VERDICT_MS)

      expect(stopVerdict).toHaveBeenCalled()
      expect(late).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('leaving mid-story releases nothing later', () => {
      const { wrapper, timeline } = host()
      const story = timeline.hold()
      vi.advanceTimersByTime(ARMED_MS + SOLUTION_DELAY_MS)

      wrapper.unmount()
      story.release()

      expect(playVerdict).not.toHaveBeenCalled()
      expect(announceResults).not.toHaveBeenCalled()
    })
  })

  describe('still', () => {
    it('a reload reaches every beat at once, silently, announcing nothing', () => {
      const { timeline } = host({ animate: false })

      expect(timeline.still).toBe(true)
      expect(reachedBeats(timeline)).toEqual(BEATS)
      expect(playVerdict).not.toHaveBeenCalled()
      expect(announceResults).not.toHaveBeenCalled()
    })

    it('reduced motion reaches every beat at once and plays the verdict at once', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      const { timeline } = host({ won: () => true })

      expect(reachedBeats(timeline)).toEqual(BEATS)
      expect(playVerdict).toHaveBeenCalledExactlyOnceWith(true)
      expect(announceResults).toHaveBeenCalledOnce()
    })

    it('a background tab reaches every beat at once and stays silent', () => {
      setHidden(true)
      const { timeline } = host()

      expect(reachedBeats(timeline)).toEqual(BEATS)
      expect(playVerdict).not.toHaveBeenCalled()
    })

    it('ignores holds: nothing is waiting to be told', () => {
      const { timeline } = host({ animate: false })

      timeline.hold()

      expect(timeline.reached('verdict').value).toBe(true)
    })

    it('runs a handler for any beat at once', () => {
      const { timeline } = host({ animate: false })
      const run = vi.fn()

      timeline.on('others', run)

      expect(run).toHaveBeenCalledOnce()
    })
  })

  describe('injection', () => {
    it('hands the provided timeline to a child', () => {
      let seen: RevealTimeline | undefined
      const Child = defineComponent({
        setup() {
          seen = useRevealTimeline()
          return () => h('span')
        },
      })
      let provided!: RevealTimeline
      mount(
        defineComponent({
          setup() {
            provided = provideRevealTimeline({ animate: false, won: () => null })
            return () => h(Child)
          },
        }),
      )

      expect(seen).toBe(provided)
    })

    it('refuses without a provider: a reveal that forgot would fall silent unnoticed', () => {
      const Orphan = defineComponent({
        setup() {
          useRevealTimeline()
          return () => h('span')
        },
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(() => mount(Orphan)).toThrow(/provideRevealTimeline/)
    })
  })
})

describe('the delays within a beat', () => {
  it('a head cell walks its row, the head rows walk down', () => {
    expect(headDelayMs(0, 0)).toBe(0)
    expect(headDelayMs(1, 2)).toBe(ROW_STAGGER_MS + 2 * CELL_STAGGER_MS)
  })

  it('the others follow from tick 1, which lands with the beat', () => {
    expect(othersDelayMs(1, 0, 3)).toBe(0)
    expect(othersDelayMs(3, 2, 4)).toBe(2 * rowStagger(4) + 2 * CELL_STAGGER_MS)
  })
})
