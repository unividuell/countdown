import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import StackFloorBoard from '../StackFloorBoard.vue'
import RevealCover from '@/ui/RevealCover.vue'
import { playStop } from '../stopSound'
import type { StackFloorPayload } from '../types'
import { inBackground } from '@/ui/motion'
import { soundOnStage } from '@/ui/useSoundAwake'

vi.mock('../stopSound', () => ({ playStop: vi.fn() }))
vi.mock('@/ui/motion', () => ({
  prefersReducedMotion: vi.fn(() => false),
  inBackground: vi.fn(() => false),
}))

enableAutoUnmount(afterEach)

const SCENE = { fieldWidth: 1000, startWidth: 660, hueStart: 100 }
const PAYLOAD: StackFloorPayload = {
  ...SCENE,
  speedNum: 1,
  speedDen: 2,
  accelPercent: 3,
  pauseMs: 300,
  maxFloors: 999,
  target: 3,
}

function mountBoard(props: Partial<InstanceType<typeof StackFloorBoard>['$props']> = {}) {
  return mount(StackFloorBoard, {
    props: {
      payload: null,
      scene: SCENE,
      sealed: true,
      disabled: false,
      submitted: false,
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      ...props,
    },
  })
}

const bars = (w: ReturnType<typeof mountBoard>) => w.findAll('[data-test="bar"]')
const resend = (w: ReturnType<typeof mountBoard>) => w.find('[data-test="stack-floor-resend"]')
const tap = (w: ReturnType<typeof mountBoard>) =>
  w.get('[data-test="stack-floor-play"]').trigger('pointerdown', { isPrimary: true, button: 0 })

async function runStarted(w: ReturnType<typeof mountBoard>): Promise<void> {
  await flushPromises()
  w.getComponent(RevealCover).vm.$emit('start')
  await w.setProps({ sealed: false, payload: PAYLOAD })
}

/**
 * Clicks at 0 ms of every floor: 660 wide at x 0 on the foundation leaves 490, then 150 at the
 * right edge, then the third bar slides in at x 0 and touches nothing.
 */
async function missInThree(w: ReturnType<typeof mountBoard>): Promise<void> {
  await tap(w)
  vi.advanceTimersByTime(300)
  await tap(w)
  vi.advanceTimersByTime(300)
  await tap(w)
}

describe('StackFloorBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    })
    vi.mocked(playStop).mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('sealed shows the foundation under the cover; start emits reveal', async () => {
    const w = mountBoard()
    await flushPromises()

    expect(bars(w)).toHaveLength(1)
    const cover = w.getComponent(RevealCover)
    expect(cover.props('timed')).toBe(false)
    expect(cover.props('note')).toBeNull()

    cover.vm.$emit('start')
    await w.vm.$nextTick()

    expect(w.emitted('reveal')).toHaveLength(1)
    expect(w.findComponent(RevealCover).exists()).toBe(false)
  })

  it('a tap stops the bar with a knock', async () => {
    const w = mountBoard()
    await runStarted(w)
    vi.advanceTimersByTime(100)
    await tap(w)

    expect(playStop).toHaveBeenCalledTimes(1)
    expect(bars(w).length).toBeGreaterThan(1)
  })

  it('knocks for no tap in the pause after a stop', async () => {
    const w = mountBoard()
    await runStarted(w)
    await tap(w)
    await tap(w)

    expect(playStop).toHaveBeenCalledTimes(1)
  })

  it('knocks for no tap while the tab is in the background', async () => {
    const w = mountBoard()
    await runStarted(w)
    vi.mocked(inBackground).mockReturnValue(true)
    await tap(w)

    expect(bars(w)).toHaveLength(2)
    expect(playStop).not.toHaveBeenCalled()
    vi.mocked(inBackground).mockReturnValue(false)
  })

  it('the miss sends every click', async () => {
    const w = mountBoard()
    await runStarted(w)
    await missInThree(w)

    expect(w.emitted('guess')).toHaveLength(1)
    expect(w.emitted('guess')![0]).toEqual([{ clicks: [0, 0, 0], restarted: false }])
  })

  it('mounted with a payload and no guess, never sealed: own cover with the reload note, then restarted', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD })
    await flushPromises()

    const cover = w.getComponent(RevealCover)
    expect(cover.props('note')).toBe('Neu geladen — dein Lauf wird markiert.')

    cover.vm.$emit('start')
    await w.vm.$nextTick()
    expect(w.emitted('reveal')).toBeUndefined()

    await missInThree(w)

    expect(w.emitted('guess')![0]).toEqual([{ clicks: [0, 0, 0], restarted: true }])
  })

  it('mounted after the guess: no cover, no run', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD, submitted: true })
    await flushPromises()
    vi.advanceTimersByTime(1000)
    await tap(w)

    expect(w.findComponent(RevealCover).exists()).toBe(false)
    expect(w.emitted('guess')).toBeUndefined()
    expect(playStop).not.toHaveBeenCalled()
  })

  it('a failed send offers the same guess again', async () => {
    const w = mountBoard()
    await runStarted(w)
    await missInThree(w)
    expect(w.emitted('guess')).toHaveLength(1)
    const [first] = w.emitted('guess')![0] as [unknown]

    await w.setProps({ disabled: true })
    expect(resend(w).exists()).toBe(false)
    await w.setProps({ disabled: false })
    expect(resend(w).text()).toBe('Erneut senden')
    await resend(w).trigger('click')

    expect(w.emitted('guess')).toHaveLength(2)
    expect(w.emitted('guess')![1]).toEqual([first])
  })

  it('phase one shows the target line in the rules; phase two does not', async () => {
    const one = mountBoard({ awardRule: 'ALL_QUALIFYING' })
    const two = mountBoard({ awardRule: 'CLOSEST_ONLY' })

    expect(one.text()).toContain(
      'Ein Balken sieht anders aus. Erreichst du ihn, hast du den Punkt.',
    )
    expect(one.text()).toContain('Erreiche den besonderen Balken.')
    expect(two.text()).not.toContain('Ein Balken sieht anders aus')
    expect(two.text()).toContain('Der höchste Turm nimmt alles.')
    for (const w of [one, two]) {
      expect(w.text()).toContain('Tippen hält den Balken an.')
      expect(w.text()).toContain('Du hast genau einen Versuch.')
    }
  })

  it('asks the header to wake the graph while here', () => {
    mountBoard()

    expect(soundOnStage.value).toBe(true)
  })
})
