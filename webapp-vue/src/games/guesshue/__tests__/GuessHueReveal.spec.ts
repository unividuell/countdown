import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import GuessHueReveal from '@/games/guesshue/GuessHueReveal.vue'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'
import { GAME_SOUND_KEY } from '@/ui/useGameSound'
import { playVerdict } from '@/ui/verdictSound'

const stopVerdict = vi.fn()
vi.mock('@/ui/verdictSound', () => ({ playVerdict: vi.fn(() => ({ stop: stopVerdict })) }))

enableAutoUnmount(afterEach)

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
    stopVerdict.mockClear()
    localStorage.removeItem(GAME_SOUND_KEY)
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

  it('honours the shared mute', () => {
    localStorage.setItem(GAME_SOUND_KEY, 'false')
    mountReveal()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })

  it('muting cuts a verdict that is sounding', async () => {
    const w = mountReveal()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    await w.get('button[aria-label="Ton"]').trigger('click')

    expect(stopVerdict).toHaveBeenCalledOnce()
  })

  it('leaving before the solution appears plays nothing', () => {
    mountReveal().unmount()
    vi.advanceTimersByTime(SOLUTION_DELAY_MS)

    expect(playVerdict).not.toHaveBeenCalled()
  })
})
