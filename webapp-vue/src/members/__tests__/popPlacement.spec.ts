import { describe, expect, it } from 'vitest'
import { inView, popSpot } from '../popPlacement'

const phone = { width: 375, height: 700 }
const desktop = { width: 1280, height: 800 }
const box = (left: number, top: number, size = 48) => ({
  left,
  top,
  right: left + size,
  bottom: top + size,
})

describe('inView', () => {
  const row = { left: 16, top: 100, right: 359, bottom: 186 }

  it('sees a circle inside both the viewport and the row', () => {
    expect(inView(box(40, 120), row, phone)).toBe(true)
  })

  it('misses a circle scrolled above the viewport', () => {
    expect(inView(box(40, -60), row, phone)).toBe(false)
  })

  it('misses a circle only partly in view', () => {
    expect(inView(box(40, -10), row, phone)).toBe(false)
  })

  // The row scrolls sideways and clips what it scrolled past, though the page shows it.
  it('misses a circle the row has scrolled out sideways', () => {
    expect(inView(box(340, 120), row, phone)).toBe(false)
  })
})

describe('popSpot', () => {
  it('keeps the flaring avatar clear of the edges, in the top quarter, on a phone', () => {
    const column = { left: 16, right: 359 }
    expect(popSpot(column, phone, () => 0)).toEqual({ x: 52, y: 92 })
    expect(popSpot(column, phone, () => 1)).toEqual({ x: 316, y: 175 })
  })

  it('reaches 96px past the column on a desktop', () => {
    const column = { left: 352, right: 928 }
    expect(popSpot(column, desktop, () => 0)).toEqual({ x: 256, y: 92 })
    expect(popSpot(column, desktop, () => 1)).toEqual({ x: 1024, y: 200 })
  })

  it('centres the avatar when the viewport is too narrow for any range', () => {
    expect(popSpot({ left: 0, right: 40 }, { width: 40, height: 700 }, () => 0.3).x).toBe(20)
  })

  // A quarter shorter than the room the flare needs: the topmost spot that keeps it whole.
  it('holds the flare whole on a viewport whose top quarter is too short', () => {
    expect(popSpot({ left: 16, right: 359 }, { width: 375, height: 300 }, () => 1).y).toBe(92)
  })
})
