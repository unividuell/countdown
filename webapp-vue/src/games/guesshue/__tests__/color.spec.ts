import { describe, expect, it } from 'vitest'
import { hslToHex } from '@/games/guesshue/color'

describe('hslToHex', () => {
  it('maps the primaries at full saturation and half lightness', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff')
  })

  it('folds an angle outside [0, 360) onto the circle', () => {
    // The scoreboard is handed hues straight off the wire; a wheel does not stop at 360.
    expect(hslToHex(360, 1, 0.5)).toBe(hslToHex(0, 1, 0.5))
    expect(hslToHex(-120, 1, 0.5)).toBe(hslToHex(240, 1, 0.5))
  })

  it('is grey at zero saturation, whatever the angle', () => {
    expect(hslToHex(200, 0, 0.5)).toBe('#808080')
    expect(hslToHex(20, 0, 0.5)).toBe('#808080')
  })

  it('pads every channel to two digits', () => {
    // `toString(16)` on a small channel yields one digit; an unpadded "#f0000" is not a colour.
    expect(hslToHex(0, 1, 0.02)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
