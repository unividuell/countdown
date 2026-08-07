import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandMark from '@/ui/BrandMark.vue'
import { PITCH, RADIUS } from '@/ui/flipdot/board'

describe('BrandMark', () => {
  it('renders one circle per lit dot of the 36x36 bitmap', () => {
    expect(mount(BrandMark).findAll('circle')).toHaveLength(720)
  })

  it('spans the same metric the flip-dot board uses', () => {
    // board.ts: width = cols * PITCH - (PITCH - 2 * RADIUS) => (36 - 1) * 4 + 3 = 143.
    // Hard-coding 143 here would pass even if the mark drifted onto its own grid.
    const side = (36 - 1) * PITCH + 2 * RADIUS
    expect(mount(BrandMark).attributes('viewBox')).toBe(`0 0 ${side} ${side}`)
  })

  it('places dots on the grid, offset by the radius like the board does', () => {
    // Row 0's first lit dot is at column 14 of the bitmap.
    const first = mount(BrandMark).findAll('circle')[0]!
    expect(Number(first.attributes('cx'))).toBeCloseTo(14 * PITCH + RADIUS, 6)
    expect(Number(first.attributes('cy'))).toBeCloseTo(0 * PITCH + RADIUS, 6)
    expect(Number(first.attributes('r'))).toBeCloseTo(RADIUS, 6)
  })

  it('inherits colour and says nothing to assistive technology', () => {
    const w = mount(BrandMark)
    expect(w.attributes('fill')).toBe('currentColor')
    expect(w.attributes('aria-hidden')).toBe('true')
  })

  it('states no size of its own, so the caller decides', () => {
    const w = mount(BrandMark)
    expect(w.attributes('width')).toBeUndefined()
    expect(w.attributes('height')).toBeUndefined()
  })
})
