import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueBoard from '@/games/guesshue/GuessHueBoard.vue'

function mountBoard(props: Partial<InstanceType<typeof GuessHueBoard>['$props']> = {}) {
  return mount(GuessHueBoard, {
    props: {
      description: 'Testbeschreibung einer Farbe.',
      initHue: 210,
      saturation: 0.6,
      lightness: 0.45,
      toleranceDeg: 10,
      disabled: false,
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

  it('emits the angle the wheel stands on, unrounded', async () => {
    const w = mountBoard({ initHue: 210.4 })
    await w.vm.$nextTick()

    await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(2000)

    expect(w.emitted('guess')).toEqual([[210.4]])
  })

  it('carries the rule where it does not compete with the wheel', () => {
    const hint = mountBoard().get('[data-test="hue-hint"]')

    expect(hint.text()).toContain('Farbton')
    // Set back deliberately: present when looked for, quiet otherwise.
    expect(hint.classes()).toContain('text-xs')
    expect(hint.classes()).toContain('text-neutral-500')
  })

  it('phase one: names the tolerance, because a small miss still counts', () => {
    const hint = mountBoard({ toleranceDeg: 10 }).get('[data-test="hue-hint"]')

    expect(hint.text()).toBe(
      'Du stellst nur den Farbton ein — Sättigung und Helligkeit sind vorgegeben. Eine kleine Abweichung ist erlaubt.',
    )
  })

  it('phase two: says only the closest guess scores, because there is no gate at all', () => {
    const hint = mountBoard({ toleranceDeg: null }).get('[data-test="hue-hint"]')

    expect(hint.text()).toBe(
      'Du stellst nur den Farbton ein — Sättigung und Helligkeit sind vorgegeben. Hier zählt nur, wer am nächsten dran liegt.',
    )
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
    expect(classes).not.toContain('border-neutral-200')
    expect(classes).not.toContain('bg-white')
    expect(classes).not.toContain('p-4')
  })

  it('keeps the group hook the reveal transition writes its leave class onto', () => {
    expect(mountBoard().classes()).toContain('group')
  })
})
