import { describe, expect, it } from 'vitest'
import { angleFromPoint, hueName, radiusFraction, wrap360 } from '@/games/guesshue/geometry'

/** A 200x200 wheel whose centre sits at (150, 250). */
const BOX = { left: 50, top: 150, width: 200, height: 200 }

describe('wrap360', () => {
  it('leaves an angle on the circle alone', () => {
    expect(wrap360(0)).toBe(0)
    expect(wrap360(359.5)).toBe(359.5)
  })

  it('folds a full turn back to zero', () => {
    expect(wrap360(360)).toBe(0)
    expect(wrap360(725)).toBe(5)
  })

  it('folds a negative angle forwards, not to a negative remainder', () => {
    // `-10 % 360` is -10 in JS; a bare modulo would put the knob nowhere.
    expect(wrap360(-10)).toBe(350)
    expect(wrap360(-370)).toBe(350)
  })
})

describe('angleFromPoint', () => {
  it('reads zero straight above the centre', () => {
    expect(angleFromPoint(150, 100, BOX)).toBe(0)
  })

  it('grows clockwise through the four axes', () => {
    expect(angleFromPoint(250, 250, BOX)).toBe(90)
    expect(angleFromPoint(150, 400, BOX)).toBe(180)
    expect(angleFromPoint(50, 250, BOX)).toBe(270)
  })

  it('reads the diagonals', () => {
    expect(angleFromPoint(250, 150, BOX)).toBeCloseTo(45)
    expect(angleFromPoint(250, 350, BOX)).toBeCloseTo(135)
    expect(angleFromPoint(50, 350, BOX)).toBeCloseTo(225)
    expect(angleFromPoint(50, 150, BOX)).toBeCloseTo(315)
  })

  it('never answers with a negative angle', () => {
    // The upper left quadrant is where atan2 goes negative.
    expect(angleFromPoint(100, 200, BOX)).toBeGreaterThanOrEqual(0)
    expect(angleFromPoint(100, 200, BOX)).toBeLessThan(360)
  })
})

describe('radiusFraction', () => {
  it('is zero at the centre', () => {
    expect(radiusFraction(150, 250, BOX)).toBe(0)
  })

  it('is one at the edge', () => {
    expect(radiusFraction(250, 250, BOX)).toBeCloseTo(1)
  })

  it('is a half half way out', () => {
    expect(radiusFraction(150, 200, BOX)).toBeCloseTo(0.5)
  })

  it('answers zero for a box without size, rather than dividing by zero', () => {
    // Exactly what happy-dom hands every component test.
    expect(radiusFraction(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBe(0)
  })
})

describe('hueName', () => {
  it('names the twelve anchors', () => {
    expect(hueName(0)).toBe('Rot')
    expect(hueName(120)).toBe('Grün')
    expect(hueName(240)).toBe('Blau')
    expect(hueName(330)).toBe('Pink')
  })

  it('snaps to the nearest anchor', () => {
    expect(hueName(14)).toBe('Rot')
    expect(hueName(16)).toBe('Orange')
  })

  it('wraps past the last anchor back to the first', () => {
    expect(hueName(350)).toBe('Rot')
    expect(hueName(359.9)).toBe('Rot')
  })

  it('accepts an angle off the circle', () => {
    expect(hueName(-10)).toBe('Rot')
    expect(hueName(480)).toBe('Grün')
  })
})
