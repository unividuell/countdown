import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import type { RevealGuess } from '@/games/guesshue/reveal'
import { playMarker } from '@/games/guesshue/turnSound'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { playVerdict } from '@/ui/verdictSound'
import { soundOnStage } from '@/ui/useSoundAwake'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

vi.mock('@/games/guesshue/turnSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/guesshue/turnSound')>()),
  playMarker: vi.fn(),
}))

enableAutoUnmount(afterEach)

const guess = (userId: string, revealDelayMs: number): RevealGuess => ({
  userId,
  hue: 100,
  colorHex: '#9fb0c8',
  revealDelayMs,
})

/** Mine is on the wheel from the start; the other two land 120 ms apart. */
const GUESSES = [guess('me', 1945), guess('fry', 1945), guess('leela', 2065)]

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
    vi.useFakeTimers()
    vi.mocked(playVerdict).mockClear()
    vi.mocked(playMarker).mockClear()
    stopVerdict.mockClear()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('plays my verdict when the solution appears', () => {
    mountReveal({ won: false })
    vi.advanceTimersByTime(SOLUTION_DELAY_MS - 1)
    expect(playVerdict).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

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
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('stays silent without a verdict on a tip of mine', () => {
    mountReveal({ won: null })
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('stays silent in a background tab', () => {
    setHidden(true)
    mountReveal()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('leaves the sound switch to the header, and asks it to wake the graph while here', () => {
    expect(mountReveal().find('button[aria-label="Ton"]').exists()).toBe(false)
    expect(soundOnStage.value).toBe(true)
  })

  it('leaving cuts a verdict that is sounding', () => {
    const w = mountReveal()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)
    w.unmount()

    expect(stopVerdict).toHaveBeenCalledOnce()
  })

  it('leaving before the solution appears plays nothing', () => {
    mountReveal().unmount()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  describe('markers', () => {
    it('knocks once for every other player, as their marker lands', () => {
      mountReveal({ guesses: GUESSES })
      vi.advanceTimersByTime(1944)
      expect(playMarker).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(playMarker).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(120)
      expect(playMarker).toHaveBeenCalledTimes(2)
    })

    it('does not knock for mine: it is the knob, already there', () => {
      mountReveal({ guesses: [guess('me', 1945)] })
      vi.advanceTimersByTime(3000)

      expect(playMarker).not.toHaveBeenCalled()
    })

    it('stays silent where nothing moves: all markers are there at once', () => {
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
      mountReveal({ guesses: GUESSES })
      vi.advanceTimersByTime(3000)

      expect(playMarker).not.toHaveBeenCalled()
    })

    it('stays silent on a reload into a round already revealed', () => {
      mountReveal({ guesses: GUESSES, animate: false })
      vi.advanceTimersByTime(3000)

      expect(playMarker).not.toHaveBeenCalled()
    })

    it('leaving the reveal drops the knocks still to come', () => {
      mountReveal({ guesses: GUESSES }).unmount()
      vi.advanceTimersByTime(3000)

      expect(playMarker).not.toHaveBeenCalled()
    })
  })
})
