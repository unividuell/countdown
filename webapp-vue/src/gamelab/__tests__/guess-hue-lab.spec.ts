import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueLabGame from '@/gamelab/GuessHueLabGame.vue'
import type { GuessHuePayload } from '@/gamelab/types'

const PAYLOAD: GuessHuePayload = {
  description: 'Testbeschreibung einer Farbe.',
  initHue: 210.4,
  saturation: 0.6,
  lightness: 0.45,
}

function mountAdapter(props: Record<string, unknown> = {}) {
  return mount(GuessHueLabGame, {
    props: { payload: PAYLOAD, outcome: null, disabled: false, myGuess: null, ...props },
  })
}

describe('GuessHueLabGame', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts the wheel on the payload angle while nothing has been guessed', () => {
    const w = mountAdapter()

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })

  it('starts the wheel on my own guess once there is one', () => {
    // After a reload the payload still carries the starting angle; showing it would misreport a
    // round that is already spent.
    const w = mountAdapter({ myGuess: { hue: 42.5 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('43')
  })

  it('sends the angle as the guess the backend expects', async () => {
    const w = mountAdapter()
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown')
    vi.advanceTimersByTime(2000)

    expect(w.emitted('guess')).toEqual([[{ hue: 210.4 }]])
  })

  it('shows no second card before a guess is in', () => {
    expect(mountAdapter().find('[data-test="lab-guess-card"]').exists()).toBe(false)
  })

  it('shows the provisional card with the rounded angle once a guess is in', () => {
    const w = mountAdapter({ myGuess: { hue: 42.5 }, disabled: true })

    expect(w.get('[data-test="lab-guess-card"]').text()).toContain('43')
  })

  it('survives a guess shape it does not recognise', () => {
    // `myGuess` is `unknown` by contract; a stale round from another game must not throw.
    const w = mountAdapter({ myGuess: { value: 7 }, disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('210')
  })
})
