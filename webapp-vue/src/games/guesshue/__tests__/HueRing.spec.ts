import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HueRing from '@/games/guesshue/HueRing.vue'
import { ringOutline } from '@/games/guesshue/ring'

const PROPS = { saturation: 0.6, lightness: 0.2, innerFraction: 0.78, sweep: null }

describe('HueRing', () => {
  // A dark band vanishes on a dark card, a light one on a light card: the lines take the ink
  // opposite the mode, so the ring always has an edge.
  it('outlines the band inside and out in the ink opposite the mode', () => {
    const w = mount(HueRing, { props: PROPS })
    const circles = w.findAll('[data-test="hue-ring-outline"] circle')
    const { outer, inner, width } = ringOutline(0.78)

    expect(w.get('[data-test="hue-ring-outline"]').classes()).toContain('stroke-on-surface')
    expect(circles.map((c) => Number(c.attributes('r')))).toEqual([outer, inner])
    expect(circles.every((c) => Number(c.attributes('stroke-width')) === width)).toBe(true)
  })

  // The entrance paints the band behind the knob; lines standing in full ahead of it would give
  // the trick away.
  it('paints the outline with the band during the entrance', () => {
    const w = mount(HueRing, { props: { ...PROPS, sweep: { fromDeg: 210, paintedDeg: 90 } } })

    expect(w.get('[data-test="hue-ring-outline"]').attributes('style')).toContain(
      'conic-gradient(from 210deg, #000 0deg 90deg, transparent 0deg)',
    )
  })
})
