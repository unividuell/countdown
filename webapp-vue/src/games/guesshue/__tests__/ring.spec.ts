import { describe, expect, it } from 'vitest'
import { OUTLINE_FRACTION, ringOutline, ringStyle } from '@/games/guesshue/ring'

const BASE = { saturation: 0.6, lightness: 0.45, innerFraction: 0.78, sweep: null }

describe('ringStyle', () => {
  it('cuts the disc into a band at the inner edge it was given', () => {
    const style = ringStyle(BASE)

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 77.4%, #000 78%)')
    expect(style.WebkitMask).toBe(style.mask)
  })

  it('follows the inner edge inward as the band grows', () => {
    // The edge is animated frame by frame, and 0.78 - 0.1 answers 0.6799999999999999 in IEEE754 —
    // rounding is what keeps a fifteen-digit number out of the mask.
    const style = ringStyle({ ...BASE, innerFraction: 0.78 - 0.1 })

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 67.4%, #000 68%)')
  })

  it('composes the entrance mask with the band instead of replacing it', () => {
    // Replacing it would reveal a full disc that only narrows once the sweep is done.
    const style = ringStyle({ ...BASE, sweep: { fromDeg: 210, paintedDeg: 90 } })

    expect(style.mask).toBe(
      'conic-gradient(from 210deg, #000 0deg 90deg, transparent 0deg), ' +
        'radial-gradient(closest-side, transparent 77.4%, #000 78%)',
    )
    // Two mask layers default to `add`; only `intersect` means "painted so far" AND "inside the
    // band", and without it the sweep goes on painting the disc's dead centre.
    expect(style).toMatchObject({ maskComposite: 'intersect', WebkitMaskComposite: 'source-in' })
  })

  it('drops the entrance mask once the ring is fully painted', () => {
    const style = ringStyle({ ...BASE, sweep: { fromDeg: 210, paintedDeg: 360 } })

    expect(style.mask).toBe('radial-gradient(closest-side, transparent 77.4%, #000 78%)')
    expect(style).not.toHaveProperty('maskComposite')
  })

  it('never greys the band out', () => {
    // The grayscale filter was a stand-in for "round spent". That state is now a different card,
    // and `disabled` means only "takes no input right now" — which the centre button already says.
    expect(JSON.stringify(ringStyle(BASE))).not.toContain('grayscale')
    expect(ringStyle(BASE)).not.toHaveProperty('filter')
  })

  it('paints the rainbow in the saturation and lightness it was given', () => {
    const style = ringStyle({ ...BASE, saturation: 0.5, lightness: 0.4 })

    expect(String(style.backgroundImage)).toContain('hsl(0 50% 40%)')
    expect(String(style.backgroundImage)).toContain('in hsl longer hue')
  })
})

describe('ringOutline', () => {
  it('lays the outer line inside the wheel’s edge', () => {
    const { outer, width } = ringOutline(0.78)

    expect(width).toBe(OUTLINE_FRACTION)
    expect(outer + width / 2).toBe(1)
  })

  // The band fades in over the stroke's own width, so the inner line covers exactly that fade:
  // no gap between line and colour, and none of the fade shows past the line.
  it('lays the inner line over the band’s faded edge', () => {
    const { inner, width } = ringOutline(0.78)
    const mask = String(ringStyle(BASE).mask)

    expect(mask).toContain(`transparent ${Math.round((inner - width / 2) * 1000) / 10}%`)
    expect(mask).toContain(`#000 ${Math.round((inner + width / 2) * 1000) / 10}%`)
  })

  it('follows the inner edge as the band grows', () => {
    expect(ringOutline(0.78 - 0.1).inner).toBe(0.677)
  })
})
