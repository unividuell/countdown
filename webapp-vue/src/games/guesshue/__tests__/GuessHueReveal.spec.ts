import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import { TIP_COLUMN, othersDelayMs } from '@/games/revealChoreography'
import { TIMELINE_TIMERS, VERDICT_AT_MS } from '@/games/__tests__/timelineTiming'
import { expectJudgesWithVerdict } from '@/games/__tests__/judgesWithVerdict'
import type { ScoreboardRow } from '@/games/guesshue/scoreboard'
import { playVerdict } from '@/ui/verdictSound'
import { soundOnStage } from '@/ui/useSoundAwake'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

enableAutoUnmount(afterEach)

const guess = (userId: string, revealDelayMs: number): RevealGuess => ({
  userId,
  hue: 100,
  colorHex: '#9fb0c8',
  revealDelayMs,
})

/** As `GuessHueGame` times them, within the `others` beat: mine is the knob, already there. */
const within = (tick: number) => othersDelayMs(tick, TIP_COLUMN, 3)
const GUESSES = [guess('me', 0), guess('fry', within(1)), guess('leela', within(2))]

function mountReveal(props: Partial<InstanceType<typeof GuessHueReveal>['$props']> = {}) {
  return mount(GuessHueReveal, {
    props: {
      description: 'Testbeschreibung einer Farbe.',
      saturation: 0.6,
      lightness: 0.45,
      targetHue: 262,
      toleranceDeg: 10,
      guesses: [],
      mineUserId: 'me',
      animate: true,
      rows: [],
      solutionCell: { hue: 262, hex: '#2e1a6b', ink: '#ffffff' },
      live: false,
      won: true,
      ...props,
    },
  })
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('GuessHueReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: TIMELINE_TIMERS })
    vi.mocked(playVerdict).mockClear()
    stopVerdict.mockClear()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('plays my verdict at the verdict beat', () => {
    mountReveal({ won: false })
    vi.advanceTimersByTime(VERDICT_AT_MS - 50)
    expect(playVerdict).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(playVerdict).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('plays it at once where nothing moves: the solution is there from the start', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    mountReveal()
    vi.advanceTimersByTime(0)

    expect(playVerdict).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('stays silent on a reload into a round already revealed', () => {
    mountReveal({ animate: false })
    vi.advanceTimersByTime(VERDICT_AT_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('stays silent without a verdict on a tip of mine', () => {
    mountReveal({ won: null })
    vi.advanceTimersByTime(VERDICT_AT_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('stays silent in a background tab', () => {
    setHidden(true)
    mountReveal()
    vi.advanceTimersByTime(VERDICT_AT_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('leaves the sound switch to the header, and asks it to wake the graph while here', () => {
    expect(mountReveal().find('button[aria-label="Ton"]').exists()).toBe(false)
    expect(soundOnStage.value).toBe(true)
  })

  it('leaving cuts a verdict that is sounding', () => {
    const w = mountReveal()
    vi.advanceTimersByTime(VERDICT_AT_MS)
    w.unmount()

    expect(stopVerdict).toHaveBeenCalledOnce()
  })

  it('leaving before the results land plays nothing', () => {
    mountReveal().unmount()
    vi.advanceTimersByTime(VERDICT_AT_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('judges with its verdict: the sector lands with my row and its sound', async () => {
    const tableRow = (userId: string, tick: number): ScoreboardRow => ({
      userId,
      name: userId,
      colorHex: '#7d2ae8',
      ink: '#ffffff',
      hue: 100,
      guessHex: '#5ce65c',
      guessInk: '#111111',
      deviationDeg: 5,
      points: 1,
      provisional: false,
      tick,
    })

    await expectJudgesWithVerdict({
      mount: () => mountReveal({ guesses: GUESSES, rows: [tableRow('fry', 1), tableRow('me', 0)] }),
      mineUserId: 'me',
      judging: (w) => w.get('[data-test="hue-sector"]').classes('opacity-100'),
      verdict: 'sound',
    })
  })
})
