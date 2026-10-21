import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import StageBar from '@/games/songsnippet/StageBar.vue'
import { tailFraction } from '@/games/songsnippet/stagebar'
import { RESULTS_DELAY_MS, SOLUTION_DELAY_MS } from '@/games/revealChoreography'

const DURATIONS = [0.1, 0.5, 2, 8, 15]

/** The board's bar: the ladder IS the scale. The reveal's: 30s of hook, ladder ending at 15s. */
function mountBar(totalSeconds: number, unlockedSeconds = totalSeconds, positionSeconds = 0) {
  return mount(StageBar, {
    props: { durations: DURATIONS, totalSeconds, unlockedSeconds, positionSeconds },
  })
}

/** Where the 15s ladder ends on the reveal's 30s scale, in percent of the bar. */
const SHARE_PCT = Math.SQRT1_2 * 100

describe('StageBar', () => {
  it('floats a notice above the bar, and holds nothing open for it when there is none', () => {
    expect(mountBar(15).find('[data-test="song-notice"]').exists()).toBe(false)

    const told = mount(StageBar, {
      props: {
        durations: DURATIONS,
        totalSeconds: 15,
        unlockedSeconds: 0.5,
        positionSeconds: 0,
        notice: 'Falsch — nächste Stufe frei.',
      },
    })
    const line = told.get('[data-test="song-notice"]')

    expect(line.text()).toBe('Falsch — nächste Stufe frei.')
    // Out of the flow, in room the bar itself holds open — and deaf to taps meant for the card.
    expect(line.classes()).toContain('absolute')
    expect(line.classes()).toContain('top-0')
    expect(line.classes()).toContain('pointer-events-none')
    // Reserved on the bar, so the board and the reveal cannot drift apart over it.
    expect(told.get('[data-test="stage-bar"]').element.parentElement?.className).toContain('pt-7')
  })

  it('pins the last rung under the ladder’s round end, with the unit only where the scale ends', () => {
    const fifteen = (w: ReturnType<typeof mountBar>) =>
      w.get('[data-test="stage-steps"]').findAll('span')[4]!

    const board = fifteen(mountBar(15))
    expect(board.text()).toBe('15s')
    expect(board.classes()).toContain('-translate-x-full')

    const reveal = fifteen(mountBar(30))
    expect(reveal.text()).toBe('15')
    expect(reveal.classes()).toContain('-translate-x-full')
  })

  it('labels the end of a scale the ladder falls short of, and only then', () => {
    expect(mountBar(30).get('[data-test="stage-scale-end"]').text()).toBe('30s')
    expect(mountBar(15).find('[data-test="stage-scale-end"]').exists()).toBe(false)
  })

  it('cuts a gap at every inner boundary — the ladder ends round on both screens', () => {
    expect(mountBar(15).findAll('[data-test="stage-gap"]')).toHaveLength(4)
    expect(mountBar(30).findAll('[data-test="stage-gap"]')).toHaveLength(4)
  })

  it('gives the board’s ladder the whole bar, and no tail', () => {
    const board = mountBar(15)

    expect(board.get('[data-test="stage-ladder"]').attributes('style')).toContain('width: 100%')
    expect(board.find('[data-test="stage-tail"]').exists()).toBe(false)
  })

  it('shrinks the reveal’s ladder to its share and hangs the extra 15s behind it', () => {
    const reveal = mountBar(30)

    expect(reveal.get('[data-test="stage-ladder"]').attributes('style')).toContain(
      `width: ${SHARE_PCT}%`,
    )
    // The rung labels ride with the ladder; the scale's own end stays at the bar's.
    expect(reveal.get('[data-test="stage-ladder-steps"]').attributes('style')).toContain(
      `width: ${SHARE_PCT}%`,
    )
    // From the centre of the ladder's round end, so its hollow edge can hug that end.
    const tail = reveal.get('[data-test="stage-tail"]').attributes('style')
    expect(tail).toContain(`left: calc(${SHARE_PCT}% - 10px)`)
    expect(tail).toContain(`width: calc(${100 - SHARE_PCT}% + 10px)`)
  })

  it('fills the reveal’s ladder from the start — the reveal unlocks nothing', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    try {
      const reveal = mountBar(30)

      expect(reveal.get('[data-test="stage-unlocked"]').attributes('style')).toContain(
        'width: 100%',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs the playhead over the whole ladder and on into the tail', () => {
    const reveal = mountBar(30, 30, 22)
    const run = tailFraction(22, DURATIONS, 30)

    expect(reveal.get('[data-test="stage-playhead"]').attributes('style')).toContain('width: 100%')
    // From the hollow edge's deepest point (14px in) to the run's end.
    expect(reveal.get('[data-test="stage-tail-playhead"]').attributes('style')).toContain(
      `width: calc(${run * 100}% + ${(1 - run) * 14}px)`,
    )
  })

  it('leaves the tail’s playhead empty while the song is still on the ladder', () => {
    const reveal = mountBar(30, 30, 9)

    expect(reveal.get('[data-test="stage-tail-playhead"]').attributes('style')).toContain(
      'width: 0px',
    )
  })

  describe('as a live reveal', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    function mountLive() {
      return mount(StageBar, {
        props: {
          durations: DURATIONS,
          totalSeconds: 30,
          unlockedSeconds: 30,
          positionSeconds: 0,
          animate: true,
        },
      })
    }

    it('arrives at the board’s geometry, so the crossfade moves nothing', () => {
      const w = mountLive()

      expect(w.get('[data-test="stage-ladder"]').attributes('style')).toContain('width: 100%')
      expect(w.get('[data-test="stage-tail"]').attributes('style')).toContain('width: 0px')
    })

    it('shrinks the ladder, then grows the tail, inside the solution beat', async () => {
      const w = mountLive()
      const ladder = w.get('[data-test="stage-ladder"]')
      const tail = w.get('[data-test="stage-tail"]')
      const half = (RESULTS_DELAY_MS - SOLUTION_DELAY_MS) / 2

      expect(ladder.attributes('style')).toContain(`transition-delay: ${SOLUTION_DELAY_MS}ms`)
      expect(ladder.attributes('style')).toContain(`transition-duration: ${half}ms`)
      // Done when the results start landing.
      expect(tail.attributes('style')).toContain(`transition-delay: ${SOLUTION_DELAY_MS + half}ms`)
      expect(tail.attributes('style')).toContain(`transition-duration: ${half}ms`)

      vi.advanceTimersByTime(50)
      await w.vm.$nextTick()

      expect(ladder.attributes('style')).toContain(`width: ${SHARE_PCT}%`)
      expect(tail.attributes('style')).toContain(`width: calc(${100 - SHARE_PCT}% + 10px)`)
    })

    it('fades the scale’s end label in with the tail', async () => {
      const w = mountLive()
      const end = w.get('[data-test="stage-scale-end"]')

      expect(end.attributes('style')).toContain('opacity: 0')

      vi.advanceTimersByTime(50)
      await w.vm.$nextTick()

      expect(end.attributes('style')).toContain('opacity: 1')
    })
  })

  it('dims what is still locked and marks the stage in play', () => {
    const labels = mountBar(15, 2).get('[data-test="stage-steps"]').findAll('span')

    expect(labels[2]!.classes()).toContain('text-amber-600')
    expect(labels[3]!.classes()).toContain('text-neutral-300')
    expect(labels[1]!.classes()).toContain('text-neutral-500')
  })
})
