import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GameHeader from '@/ui/GameHeader.vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { BAND_PAD } from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'
import { _resetSharedClock } from '@/ui/sharedClock'

// Fixed so the reading is a fixed string. The board's own boot animation is irrelevant here — the
// value is read off the component's props, which hold it whatever phase the dots are in.
const NOW = Date.parse('2026-06-15T06:45:27Z')
const END = '2026-06-15T09:00:00Z'

function mountHeader(props: Partial<InstanceType<typeof GameHeader>['$props']> = {}) {
  return mount(GameHeader, {
    props: { roundNumber: 5, title: 'Farbausmalung', endsAt: END, ...props },
  })
}

const clockOf = (w: ReturnType<typeof mountHeader>) => w.getComponent(FlipDotBoard).props()

enableAutoUnmount(afterEach)

describe('GameHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
    _resetSharedClock()
  })
  afterEach(() => {
    _resetSharedClock()
    vi.useRealTimers()
  })

  it('shows the round number as it stands, so T- and T+ rounds stay distinguishable', () => {
    expect(mountHeader({ roundNumber: 5 }).get('[data-test="game-header-round"]').text()).toContain(
      '5',
    )
    expect(
      mountHeader({ roundNumber: -3 }).get('[data-test="game-header-round"]').text(),
    ).toContain('-3')
  })

  // The bare number carries no meaning to a screen reader, and the band is the only place the
  // round is named at all.
  it('names the number for a screen reader', () => {
    expect(mountHeader().get('[data-test="game-header-round"]').text()).toContain('Runde')
  })

  it("carries the game's name as the page's heading, since nothing else on the page does", () => {
    const heading = mountHeader().get('h1')

    expect(heading.attributes('data-test')).toBe('game-header-title')
    expect(heading.text()).toBe('Farbausmalung')
  })

  it('reads the time left of the round off the shared clock', () => {
    expect(clockOf(mountHeader()).text).toBe('02:14:33')
  })

  it('speaks the readout, because the dots themselves say nothing', () => {
    expect(clockOf(mountHeader()).label).toBe(
      'Noch 2 Stunden, 14 Minuten, 33 Sekunden in dieser Runde',
    )
  })

  it('ticks down with the shared clock', async () => {
    const w = mountHeader()

    vi.advanceTimersByTime(2000)
    await nextTick()

    expect(clockOf(w).text).toBe('02:14:31')
  })

  // A round with no readable end is the lab's case, and a band that loses its height there would
  // move the game underneath it.
  it('drops the board but keeps the band when there is no end to count to', () => {
    const w = mountHeader({ endsAt: null })

    expect(w.findComponent(FlipDotBoard).exists()).toBe(false)
    expect(w.get('[data-test="game-header"]').classes()).toContain('h-9')
  })

  it('leaves out the number when there is none, rather than printing an empty slot', () => {
    expect(
      mountHeader({ roundNumber: null }).find('[data-test="game-header-round"]').exists(),
    ).toBe(false)
  })

  // The phase mark sits on the number at the left; the clock mark sits in the field at the
  // right. The dots stay untouched on purpose: the running stopwatch is already amber, and a
  // timed play only exists in phase two — if both were amber, colour would no longer tell the
  // two apart.
  it('marks a phase two round on its number and nowhere else', () => {
    const w = mountHeader({ phaseTwo: true })

    expect(w.get('[data-test="game-header-round"]').classes()).toContain('text-phase-two')
    expect(w.get('[data-test="game-header-round"]').classes()).not.toContain('text-stone-400')
    expect(clockOf(w).tone).toBe('default')
  })

  it('leaves the number alone in phase one', () => {
    expect(mountHeader().get('[data-test="game-header-round"]').classes()).toContain(
      'text-stone-400',
    )
  })

  // Softer than the app header's stone-900 on purpose, and NOT stone-800: DOT_OFF is #292524,
  // which is stone-800 exactly — on that background the unlit dots would vanish into the band and
  // the matrix with them.
  it('sits on a band one step softer than the app header, and not on the dots own colour', () => {
    const classes = mountHeader().get('[data-test="game-header"]').classes()

    expect(classes).toContain('bg-stone-700')
    expect(classes).not.toContain('bg-stone-800')
    expect(classes).not.toContain('bg-stone-900')
  })

  // happy-dom computes no layout, so the only assertable form of "the clock never gets squeezed
  // out by a long game name" is that the two boxes declare opposite intentions.
  it('gives up title width before it gives up the clock', () => {
    const w = mountHeader()

    expect(w.get('[data-test="game-header-title"]').classes()).toEqual(
      expect.arrayContaining(['truncate', 'min-w-0']),
    )
    expect(w.getComponent(FlipDotBoard).classes()).toContain('shrink-0')
  })

  // A bare digit: all three beats are one glyph wide, so the board flips from beat to beat
  // instead of relighting itself three times in three seconds.
  it('shows the start signal on the beat the page is playing', () => {
    const w = mountHeader({ play: { phase: 'start', beat: '3' } })

    expect(clockOf(w).text).toBe('3')
    expect(clockOf(w).label).toBe('Start in 3 Sekunden')
    expect(clockOf(w).tone).toBe('alarm')
    expect(clockOf(w).solid).toBe(false)
  })

  it('speaks the last beat in the singular', () => {
    const w = mountHeader({ play: { phase: 'start', beat: '1' } })

    expect(clockOf(w).label).toBe('Start in 1 Sekunde')
  })

  // The reveal is in flight: the board says so by lighting its whole field, and it is already the
  // width of the clock underneath, so the answer flips the digits out instead of resizing again.
  it('holds a solid field while the reveal is on its way', () => {
    const w = mountHeader({ play: { phase: 'waiting' } })

    expect(clockOf(w).solid).toBe(true)
    expect(clockOf(w).text).toBe('00:00')
    expect(clockOf(w).tone).toBe('alarm')
    expect(clockOf(w).label).toBe('Wird aufgedeckt')
  })

  it('gives the waiting field the width the running clock will have', () => {
    const waiting = mountHeader({ play: { phase: 'waiting' } })
    const running = mountHeader({ play: { phase: 'running', since: '2026-06-15T06:44:22Z' } })

    expect(bitmap(clockOf(waiting).text).cols).toBe(bitmap(clockOf(running).text).cols)
  })

  it('shows the play own clock once it is running, in the timed tone', () => {
    const w = mountHeader({ play: { phase: 'running', since: '2026-06-15T06:44:22Z' } })

    expect(clockOf(w).text).toBe('01:05')
    expect(clockOf(w).label).toBe('Deine Zeit: 1 Minute, 5 Sekunden')
    expect(clockOf(w).tone).toBe('alarm')
  })

  it('counts the play up with the shared clock', async () => {
    const w = mountHeader({ play: { phase: 'running', since: '2026-06-15T06:44:22Z' } })

    vi.advanceTimersByTime(2000)
    await nextTick()

    expect(clockOf(w).text).toBe('01:07')
  })

  it('is the round countdown in the plain tone when no play is running', () => {
    expect(clockOf(mountHeader()).text).toBe('02:14:33')
    expect(clockOf(mountHeader()).tone).toBe('default')
  })

  // The dark dots sit close enough to the band's own colour that a field stopping short of the
  // edges reads as a badly cut sticker. It runs into the corner instead, and the blank columns on
  // its right are what keep the last digit clear of the card's radius.
  it('pads the board so it fills the band and runs into its corner', () => {
    const w = mountHeader()

    expect(clockOf(w).pad).toEqual(BAND_PAD)
    expect(w.getComponent(FlipDotBoard).classes()).toContain('h-full')
    expect(w.get('[data-test="game-header"]').classes()).toContain('pl-4')
    expect(w.get('[data-test="game-header"]').classes()).not.toContain('pr-4')
  })

  it('keeps a gutter on the right where there is no board to fill it', () => {
    const w = mountHeader({ endsAt: null })

    expect(w.get('[data-test="game-header"]').classes()).toContain('pr-4')
  })
})
