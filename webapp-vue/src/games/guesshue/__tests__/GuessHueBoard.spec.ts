import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'
import { playTurn } from '@/games/guesshue/turnSound'
import HoldButton from '@/ui/HoldButton.vue'
import { soundOnStage } from '@/ui/useSoundAwake'

vi.mock('@/games/guesshue/turnSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/guesshue/turnSound')>()),
  playTurn: vi.fn(),
}))

function mountBoard(props: Partial<InstanceType<typeof GuessHueBoard>['$props']> = {}) {
  return mount(GuessHueBoard, {
    props: {
      description: 'Testbeschreibung einer Farbe.',
      initHue: 210,
      saturation: 0.6,
      lightness: 0.45,
      disabled: false,
      awardRule: null,
      awardPoints: null,
      ...props,
    },
  })
}

describe('GuessHueBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    // Reduced motion, so the wheel reports itself ready without a sweep to wait out.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('quotes the description with German quotation marks', () => {
    const w = mountBoard({ description: 'Ein Blau wie am späten Abend.' })

    expect(w.get('[data-test="hue-description"]').text()).toBe('„Ein Blau wie am späten Abend.“')
  })

  it('starts the wheel on the angle it was handed', () => {
    const w = mountBoard({ initHue: 137 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('137')
  })

  it('follows the wheel when the player turns it', async () => {
    const w = mountBoard({ initHue: 100 })

    await w.get('[data-test="hue-wheel"]').trigger('keydown', { key: 'PageUp' })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('110')
  })

  describe('turn sound', () => {
    beforeEach(() => {
      vi.mocked(playTurn).mockClear()
    })

    it('knocks once per degree the knob enters', async () => {
      const w = mountBoard({ initHue: 108 })
      const wheel = w.get('[data-test="hue-wheel"]')

      await wheel.trigger('keydown', { key: 'ArrowUp' })
      expect(playTurn).toHaveBeenCalledOnce()

      await wheel.trigger('keydown', { key: 'PageUp' })
      expect(playTurn).toHaveBeenCalledTimes(2)
    })

    it('leaves the sound switch to the header, and asks it to wake the graph while here', () => {
      expect(mountBoard().find('button[aria-label="Ton"]').exists()).toBe(false)
      expect(soundOnStage.value).toBe(true)
    })

    it('lets the confirm button knock as it charges', () => {
      expect(mountBoard().getComponent(HoldButton).props('sound')).toBe(true)
    })
  })

  it('emits the angle the wheel stands on, unrounded', async () => {
    const w = mountBoard({ initHue: 210.4 })
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(3000)

    expect(w.emitted('guess')).toEqual([[210.4]])
  })

  // The old `hue-hint` mixed two things: how to play (instructions) and what scores (award
  // box). Both halves live on, each in its own place.
  it('explains the input in the rules box and the scoring in the award box', () => {
    const w = mountBoard({ awardRule: 'ALL_QUALIFYING', awardPoints: 1 })

    expect(w.text()).toContain('Du stellst nur den Farbton ein')
    expect(w.text()).toContain('Jeder gültige Tipp: 1 Punkt')
    expect(w.find('[data-test="hue-hint"]').exists()).toBe(false)
  })

  it('phase two: the award box says winner-takes-all and spells out what "closest" means here', () => {
    const w = mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 7 })

    expect(w.text()).toContain('Winner takes it all: 7 Punkte')
    expect(w.text()).toContain('Bester Tipp: am nächsten am gesuchten Farbton')
  })

  it('locks the wheel and the button once the round is spent', () => {
    const w = mountBoard({ disabled: true })

    expect(w.get('[data-test="hue-wheel"]').attributes('tabindex')).toBe('-1')
    expect(w.get('[data-test="hold-button"]').attributes('disabled')).toBeDefined()
  })

  it('follows a new starting angle handed down after a reload', async () => {
    const w = mountBoard({ initHue: 10 })

    await w.setProps({ initHue: 300 })

    expect(w.get('[data-test="hue-wheel"]').attributes('aria-valuenow')).toBe('300')
  })

  // The frame belongs to the host now (`rounds/RoundCard.vue` and the lab's game page). A board
  // that frames itself puts a second border inside the surface — and two of them for the length of
  // the reveal crossfade.
  it('brings no frame of its own', () => {
    const classes = mountBoard().classes()

    expect(classes).not.toContain('rounded-xl')
    expect(classes).not.toContain('border')
    expect(classes).not.toContain('border-outline')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('keeps the group hook the reveal transition writes its leave class onto', () => {
    expect(mountBoard().classes()).toContain('group')
  })
})
