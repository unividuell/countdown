import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StageBar from '@/games/songsnippet/StageBar.vue'

const DURATIONS = [0.1, 0.5, 2, 8, 15]

/** The board's bar: the ladder IS the scale. The reveal's: 30s of hook, ladder ending at 15s. */
function mountBar(totalSeconds: number, unlockedSeconds = totalSeconds) {
  return mount(StageBar, {
    props: { durations: DURATIONS, totalSeconds, unlockedSeconds, positionSeconds: 0 },
  })
}

describe('StageBar', () => {
  it('pins the last rung to the right edge only when it really sits there', () => {
    const labels = (w: ReturnType<typeof mountBar>) =>
      w.get('[data-test="stage-steps"]').findAll('span')

    const board = labels(mountBar(15))
    expect(board.at(-1)!.text()).toBe('15s')
    expect(board.at(-1)!.classes()).toContain('-translate-x-full')

    // On the reveal's scale the 15s rung lands at 71%, so it is centred under its own gap like
    // every other rung — pinning it right there would leave it floating mid-bar.
    const reveal = mountBar(30)
    const fifteen = reveal.get('[data-test="stage-steps"]').findAll('span')[4]!
    expect(fifteen.text()).toBe('15')
    expect(fifteen.classes()).toContain('-translate-x-1/2')
  })

  it('labels the end of a scale the ladder falls short of, and only then', () => {
    expect(mountBar(30).get('[data-test="stage-scale-end"]').text()).toBe('30s')
    expect(mountBar(15).find('[data-test="stage-scale-end"]').exists()).toBe(false)
  })

  it('cuts a gap at every boundary except one that falls on the bar’s edge', () => {
    // The board's ladder ends the bar: four inner boundaries for five rungs.
    expect(mountBar(15).findAll('[data-test="stage-gap"]')).toHaveLength(4)
    // The reveal's bar runs past the ladder, so the 15s boundary is a gap of its own.
    expect(mountBar(30).findAll('[data-test="stage-gap"]')).toHaveLength(5)
  })

  it('dims what is still locked and marks the stage in play', () => {
    const labels = mountBar(15, 2).get('[data-test="stage-steps"]').findAll('span')

    expect(labels[2]!.classes()).toContain('text-amber-600')
    expect(labels[3]!.classes()).toContain('text-neutral-300')
    expect(labels[1]!.classes()).toContain('text-neutral-500')
  })
})
