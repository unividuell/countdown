import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SpotObjectCompass from '../SpotObjectCompass.vue'

/** Where a point sits across the band, as a percentage of its width — 50% being the centre. */
function positions(heading: number): Record<string, number> {
  const w = mount(SpotObjectCompass, { props: { heading } })
  return Object.fromEntries(
    w.findAll('[data-test="spot-compass-point"]').map((point) => [
      point.attributes('data-point'),
      // `left: calc(50% + <offset>%)` — the offset is what the heading decides.
      Number(/calc\(50% \+ (-?[\d.]+)%\)/.exec(point.attributes('style') ?? '')?.[1]),
    ]),
  )
}

describe('SpotObjectCompass', () => {
  /** The centre of the band is the centre of the view, which is where the crosshair is. */
  it('puts the direction being faced in the middle', () => {
    expect(positions(0).N).toBe(0)
    expect(positions(90).O).toBe(0)
    expect(positions(225).SW).toBe(0)
  })

  it('lays the neighbouring points out to either side, in the order of the horizon', () => {
    const at = positions(0)

    expect(at.NO).toBeGreaterThan(0) // north-east is to the right of north
    expect(at.NW).toBeLessThan(0)
    expect(at.NO).toBe(-at.NW!)
  })

  /**
   * Turning past north is where a naive difference breaks: north would read as 350° to the right
   * instead of 10° to the left, and every label would set off the long way round.
   */
  it('takes the short way round when the view crosses north', () => {
    const at = positions(350)

    expect(at.N).toBeGreaterThan(0) // ten degrees to the right, not three hundred and fifty
    expect(at.N).toBeLessThan(20)
    expect(at.NW).toBeLessThan(0)
  })

  /** Three points at a time: enough to see the next one coming, not enough to blur while panning. */
  it('leaves out what is behind the player', () => {
    const at = positions(0)

    expect(Object.keys(at).sort()).toEqual(['N', 'NO', 'NW'])
    expect(at.S).toBeUndefined()
  })

  it('names the points in German', () => {
    expect(mount(SpotObjectCompass, { props: { heading: 90 } }).text()).toContain('O')
    expect(mount(SpotObjectCompass, { props: { heading: 135 } }).text()).toContain('SO')
  })
})
