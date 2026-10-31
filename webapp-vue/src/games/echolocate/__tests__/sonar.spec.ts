import { describe, expect, it } from 'vitest'
import { ringRadius, toCell, waveRadius } from '@/games/echolocate/sonar'

const SPEED = 3
const REACH = 12

describe('waveRadius', () => {
  it('grows the wave at its speed and stops at its reach', () => {
    expect(waveRadius(1000, 1000, SPEED, REACH)).toBe(0)
    expect(waveRadius(1000, 3000, SPEED, REACH)).toBe(6)
    // 4 s × 3 cells/s is exactly the reach: the wave is still there
    expect(waveRadius(1000, 5000, SPEED, REACH)).toBe(12)
    // 4.1 s × 3 cells/s is past it
    expect(waveRadius(1000, 5100, SPEED, REACH)).toBeNull()
  })

  it('has no wave before its start', () => {
    expect(waveRadius(1000, 999, SPEED, REACH)).toBeNull()
    expect(waveRadius(1000, 0, SPEED, REACH)).toBeNull()
  })
})

describe('ringRadius', () => {
  it('turns a tap time into a ring radius', () => {
    expect(ringRadius(1000, 2500, SPEED)).toBe(4.5)
    expect(ringRadius(1000, 1000, SPEED)).toBe(0)
  })

  it('has no ring before the start', () => {
    expect(ringRadius(1000, 999, SPEED)).toBeNull()
  })

  it('lets a tap after the wave reach past it, as the server allows', () => {
    expect(ringRadius(0, 4500, SPEED)).toBe(13.5)
  })
})

describe('toCell', () => {
  const rect = new DOMRect(10, 20, 200, 100)

  it('maps a pointer to cell units, the field’s top-left being the origin', () => {
    expect(toCell(10, 20, rect, 20)).toEqual({ x: 0, y: 0 })
    expect(toCell(110, 70, rect, 20)).toEqual({ x: 10, y: 10 })
    expect(toCell(210, 120, rect, 20)).toEqual({ x: 20, y: 20 })
    expect(toCell(35, 45, rect, 20)).toEqual({ x: 2.5, y: 5 })
  })

  it('clamps a pointer outside the field to its edge', () => {
    expect(toCell(0, 0, rect, 20)).toEqual({ x: 0, y: 0 })
    expect(toCell(500, 500, rect, 20)).toEqual({ x: 20, y: 20 })
    expect(toCell(110, 500, rect, 20)).toEqual({ x: 10, y: 20 })
  })

  it('never answers NaN, even from a field that has no size yet', () => {
    expect(toCell(5, 5, new DOMRect(0, 0, 0, 0), 20)).toEqual({ x: 0, y: 0 })
  })
})
