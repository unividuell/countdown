import { describe, expect, it } from 'vitest'
import {
  baseCellPx,
  FIELD_PX,
  fitView,
  framingOf,
  gridLines,
  initialPlacements,
  initialView,
  moveBy,
  revealPlacements,
  pan,
  pinch,
  scaleToHandle,
  sizeAt,
  toScreen,
  toWorld,
  viewAt,
  zoomAt,
  type Placement,
} from '@/games/matchscale/gestures'
import type { Silhouette } from '@/games/matchscale/types'

const FIELD = 360
const BASE = baseCellPx(FIELD)

const WIDE: Silhouette = { name: 'w', path: 'M0 0', width: 1000, height: 500, attribution: null }
const TALL: Silhouette = { name: 't', path: 'M0 0', width: 400, height: 1000, attribution: null }

function spacingPx(view: ReturnType<typeof initialView>, mode: 'screen' | 'world' | 'stepped') {
  const { xs } = gridLines(view, FIELD, mode)
  return (xs[1]! - xs[0]!) * view.cellPx
}

describe('view', () => {
  it('shows nine cells across and y from -2 to 7 over the whole height', () => {
    const view = initialView(FIELD)

    expect(view.cellPx).toBeCloseTo(40)
    expect(toWorld(view, { x: 0, y: 0 })).toEqual({ x: 0, y: 7 })
    expect(toWorld(view, { x: FIELD, y: FIELD }).y).toBeCloseTo(-2)
    expect(toWorld(view, { x: FIELD, y: FIELD }).x).toBeCloseTo(9)
  })

  it('maps world to screen and back', () => {
    const view = { left: 1.5, top: 4, cellPx: 17 }
    const p = { x: 3.25, y: -0.5 }

    const back = toWorld(view, toScreen(view, p))

    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('pans by screen pixels, dragging the content along', () => {
    const view = pan(initialView(FIELD), 40, -80)

    expect(view.left).toBeCloseTo(-1)
    expect(view.top).toBeCloseTo(5)
  })

  it('zooms around the pointer, keeping its world point', () => {
    const view = initialView(FIELD)
    const pointer = { x: 100, y: 250 }
    const before = toWorld(view, pointer)

    const zoomed = zoomAt(view, pointer, 2, FIELD)
    const after = toWorld(zoomed, pointer)

    expect(zoomed.cellPx).toBeCloseTo(view.cellPx * 2)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom to one eighth and eight times the base', () => {
    const view = initialView(FIELD)

    expect(zoomAt(view, { x: 0, y: 0 }, 1000, FIELD).cellPx).toBeCloseTo(BASE * 8)
    expect(zoomAt(view, { x: 0, y: 0 }, 0.0001, FIELD).cellPx).toBeCloseTo(BASE / 8)
  })

  it('pinches: equal spread only moves, wider spread zooms', () => {
    const view = initialView(FIELD)
    const from: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]

    const moved = pinch(
      view,
      from,
      [
        { x: 130, y: 120 },
        { x: 230, y: 120 },
      ],
      FIELD,
    )
    expect(moved.cellPx).toBeCloseTo(view.cellPx)
    expect(moved.left).toBeCloseTo(view.left - 30 / view.cellPx)
    expect(moved.top).toBeCloseTo(view.top + 20 / view.cellPx)

    const mid = { x: 150, y: 100 }
    const wide = pinch(
      view,
      from,
      [
        { x: 50, y: 100 },
        { x: 250, y: 100 },
      ],
      FIELD,
    )
    expect(wide.cellPx).toBeCloseTo(view.cellPx * 2)
    expect(toWorld(wide, mid).x).toBeCloseTo(toWorld(view, mid).x)
  })

  it('fits every box into the field', () => {
    const boxes = [
      { x: -3, y: 0, w: 2, h: 1 },
      { x: 10, y: 4, w: 5, h: 8 },
    ]

    const view = fitView(boxes, FIELD)

    for (const box of boxes) {
      const bottomLeft = toScreen(view, { x: box.x, y: box.y })
      const topRight = toScreen(view, { x: box.x + box.w, y: box.y + box.h })
      expect(bottomLeft.x).toBeGreaterThanOrEqual(0)
      expect(bottomLeft.y).toBeLessThanOrEqual(FIELD)
      expect(topRight.x).toBeLessThanOrEqual(FIELD)
      expect(topRight.y).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('framing', () => {
  it('draws the field 360 units wide', () => {
    expect(FIELD_PX).toBe(360)
  })

  it('reads zoom and centre off a view, and builds the same view back', () => {
    const view = { left: -1, top: 9, cellPx: BASE * 2 }

    const framing = framingOf(view, FIELD)

    expect(framing.zoom).toBeCloseTo(2)
    expect(framing.centre.x).toBeCloseTo(-1 + 4.5 / 2)
    expect(framing.centre.y).toBeCloseTo(9 - 4.5 / 2)
    const back = viewAt(framing, FIELD)
    expect(back.left).toBeCloseTo(view.left)
    expect(back.top).toBeCloseTo(view.top)
    expect(back.cellPx).toBeCloseTo(view.cellPx)
  })

  it('frames the start view at zoom 1 around its middle', () => {
    expect(framingOf(initialView(FIELD), FIELD)).toEqual({ zoom: 1, centre: { x: 4.5, y: 2.5 } })
  })

  it('clamps a stored zoom to the zoom range', () => {
    expect(viewAt({ zoom: 100, centre: { x: 0, y: 0 } }, FIELD).cellPx).toBeCloseTo(BASE * 8)
  })
})

describe('grid', () => {
  it.each([1 / 8, 1, 8])('steps by powers of two to 24..48 px at zoom %f', (zoom) => {
    const view = { ...initialView(FIELD), cellPx: BASE * zoom }

    const px = spacingPx(view, 'stepped')

    expect(px).toBeGreaterThanOrEqual(24)
    expect(px).toBeLessThan(48)
  })

  it('keeps a constant screen spacing of one base cell in screen mode', () => {
    for (const zoom of [1 / 8, 1, 8]) {
      const view = { ...initialView(FIELD), cellPx: BASE * zoom }
      expect(spacingPx(view, 'screen')).toBeCloseTo(BASE)
    }
  })

  it('keeps one world cell in world mode', () => {
    const view = { ...initialView(FIELD), cellPx: BASE * 2 }
    const { xs } = gridLines(view, FIELD, 'world')

    expect(xs[1]! - xs[0]!).toBeCloseTo(1)
  })

  it('covers the visible area with lines on multiples of the spacing', () => {
    const { xs, ys } = gridLines(initialView(FIELD), FIELD, 'world')

    expect(xs[0]).toBeLessThanOrEqual(0.0001)
    expect(xs.at(-1)).toBeGreaterThanOrEqual(8.9999)
    expect(ys).toContain(0)
    expect(ys[0]).toBeLessThanOrEqual(-1.9999)
  })
})

describe('placements', () => {
  it('measures a silhouette in cells, longest side three', () => {
    expect(sizeAt(WIDE, 1)).toEqual({ w: 3, h: 1.5 })
    expect(sizeAt(TALL, 2)).toEqual({ w: 2.4, h: 6 })
  })

  it('puts A at (1, 0) and B beside it, both unscaled', () => {
    const { a, b } = initialPlacements(WIDE)

    expect(a).toEqual({ x: 1, y: 0, scale: 1 })
    expect(b).toEqual({ x: 2 + 3, y: 0, scale: 1 })
  })

  it('closes the reveal gap to a tenth of the larger shape', () => {
    // A 3 wide, true B 2.4 × 6: the gap is 0.6.
    const { a, b } = revealPlacements(WIDE, TALL, 2)

    expect(a).toEqual({ x: 1, y: 0, scale: 1 })
    expect(b.x).toBeCloseTo(1 + 3 + 0.6)
    expect(b).toMatchObject({ y: 0, scale: 1 })
  })

  it('keeps the reveal gap in step with a tiny B', () => {
    // True B 0.3 × 0.15 beside A 3 wide: the gap follows A, not B.
    const { b } = revealPlacements(WIDE, WIDE, 0.1)

    expect(b.x).toBeCloseTo(1 + 3 + 0.3)
  })

  it('moves without touching the scale', () => {
    const p: Placement = { x: 1, y: 0, scale: 1.7 }

    expect(moveBy(p, 0.5, -2)).toEqual({ x: 1.5, y: -2, scale: 1.7 })
  })

  it('scales by projecting the handle onto the diagonal, bottom-left fixed', () => {
    const p: Placement = { x: 2, y: 1, scale: 1 }
    const { w, h } = sizeAt(WIDE, 1)

    const doubled = scaleToHandle(p, WIDE, { x: 2 + 2 * w, y: 1 + 2 * h })

    expect(doubled.scale).toBeCloseTo(2)
    expect(doubled.x).toBe(2)
    expect(doubled.y).toBe(1)

    // Off the diagonal: only the component along it counts.
    const off = scaleToHandle(p, WIDE, { x: 2 + w, y: 1 + h + 0.3 })
    expect(off.scale).toBeGreaterThan(1)
    expect(off.scale).toBeLessThan(1.1)
  })

  it('clamps the scale to 0.05..20', () => {
    const p: Placement = { x: 0, y: 0, scale: 1 }

    expect(scaleToHandle(p, WIDE, { x: 1000, y: 1000 }).scale).toBe(20)
    expect(scaleToHandle(p, WIDE, { x: -5, y: -5 }).scale).toBe(0.05)
  })
})
