/**
 * The field's geometry. World units are cells, y points up, the ground line is y = 0:
 *
 *   y=7  ┌─────────────────┐  top    (zoom 1: x 0..9, y -2..7)
 *        │   A       B     │
 *   y=0  │ ──■▀▀▀──────■▀▀─│  ground
 *   y=-2 └─────────────────┘
 *
 * Pure, so a test can assert on it; happy-dom computes no layout.
 */
import type { Silhouette } from './types'

export const FIELD_CELLS = 9
/**
 * The field's side in SVG user units. The SVG scales to the card's width, so every "px" here is one
 * of these — the view and the draft stay the same whatever the phone measures.
 */
export const FIELD_PX = 360
export const GROUND_OFFSET = 2
/** Longest side of a silhouette at scale 1, in cells. */
export const START_CELLS = 3
/** The longest side of a silhouette's bbox, in the path's normalised units. */
const PATH_UNITS = 1000
export const SCALE_MIN = 0.05
export const SCALE_MAX = 20
/** Zoom relative to the start size. */
export const ZOOM_MIN = 1 / 8
export const ZOOM_MAX = 8

/**
 * `screen`: lines stay one base cell apart on screen; `world`: one cell apart in the world;
 * `stepped`: 2^k cells, so the spacing on screen stays within [24, 48) px.
 */
export type GridMode = 'screen' | 'world' | 'stepped'
export const GRID_MODE: GridMode = 'stepped'

const STEP_MIN_PX = 24

export interface Point {
  x: number
  y: number
}

/** The world point at the field's top left, and the pixels one cell takes. */
export interface View {
  left: number
  top: number
  cellPx: number
}

/** Bottom left corner in the world, and the factor against the silhouette's start size. */
export interface Placement {
  x: number
  y: number
  scale: number
}

/** What the board showed as the tip went in: the reveal's tip travels from there. */
export interface Submitted {
  view: View
  b: Placement
}

/** World rectangle, `x`/`y` bottom left. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function baseCellPx(fieldPx: number): number {
  return fieldPx / FIELD_CELLS
}

export function initialView(fieldPx: number): View {
  return { left: 0, top: FIELD_CELLS - GROUND_OFFSET, cellPx: baseCellPx(fieldPx) }
}

export function toScreen(view: View, p: Point): Point {
  return { x: (p.x - view.left) * view.cellPx, y: (view.top - p.y) * view.cellPx }
}

export function toWorld(view: View, p: Point): Point {
  return { x: view.left + p.x / view.cellPx, y: view.top - p.y / view.cellPx }
}

export function sizeAt(s: Silhouette, scale: number): { w: number; h: number } {
  return {
    w: (START_CELLS * s.width * scale) / PATH_UNITS,
    h: (START_CELLS * s.height * scale) / PATH_UNITS,
  }
}

export function initialPlacements(a: Silhouette): { a: Placement; b: Placement } {
  return {
    a: { x: 1, y: 0, scale: 1 },
    b: { x: 2 + sizeAt(a, 1).w, y: 0, scale: 1 },
  }
}

/** What a draft keeps of a view: independent of the field's size. */
export interface Framing {
  zoom: number
  centre: Point
}

export function framingOf(view: View, fieldPx: number): Framing {
  return {
    zoom: view.cellPx / baseCellPx(fieldPx),
    centre: toWorld(view, { x: fieldPx / 2, y: fieldPx / 2 }),
  }
}

export function viewAt(framing: Framing, fieldPx: number): View {
  const cellPx = clampCellPx(baseCellPx(fieldPx) * framing.zoom, fieldPx)
  const half = fieldPx / cellPx / 2

  return { left: framing.centre.x - half, top: framing.centre.y + half, cellPx }
}

/** Drag by screen pixels: the content follows the finger. */
export function pan(view: View, dx: number, dy: number): View {
  return { ...view, left: view.left - dx / view.cellPx, top: view.top + dy / view.cellPx }
}

function clampCellPx(cellPx: number, fieldPx: number): number {
  const base = baseCellPx(fieldPx)

  return Math.min(Math.max(cellPx, base * ZOOM_MIN), base * ZOOM_MAX)
}

/** Keeps the world point under `screenPoint` where it is. */
export function zoomAt(view: View, screenPoint: Point, factor: number, fieldPx: number): View {
  const cellPx = clampCellPx(view.cellPx * factor, fieldPx)
  const anchor = toWorld(view, screenPoint)

  return {
    left: anchor.x - screenPoint.x / cellPx,
    top: anchor.y + screenPoint.y / cellPx,
    cellPx,
  }
}

/** Two fingers: the midpoint's world point follows the midpoint, the spread zooms. */
export function pinch(view: View, from: [Point, Point], to: [Point, Point], fieldPx: number): View {
  const spreadFrom = Math.hypot(from[0].x - from[1].x, from[0].y - from[1].y)
  const spreadTo = Math.hypot(to[0].x - to[1].x, to[0].y - to[1].y)
  const factor = spreadFrom > 0 ? spreadTo / spreadFrom : 1

  const cellPx = clampCellPx(view.cellPx * factor, fieldPx)
  const anchor = toWorld(view, mid(from))
  const target = mid(to)

  return { left: anchor.x - target.x / cellPx, top: anchor.y + target.y / cellPx, cellPx }
}

function mid(pair: [Point, Point]): Point {
  return { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 }
}

export function moveBy(placement: Placement, dx: number, dy: number): Placement {
  return { ...placement, x: placement.x + dx, y: placement.y + dy }
}

/**
 * The handle sits on the top right corner. Its projection onto the diagonal (bottom left to top
 * right at scale 1) is the scale; the bottom left corner stays put, so the aspect ratio holds.
 */
export function scaleToHandle(
  placement: Placement,
  silhouette: Silhouette,
  handleWorld: Point,
): Placement {
  const { w, h } = sizeAt(silhouette, 1)
  const along =
    ((handleWorld.x - placement.x) * w + (handleWorld.y - placement.y) * h) / (w * w + h * h)

  return { ...placement, scale: Math.min(Math.max(along, SCALE_MIN), SCALE_MAX) }
}

const FIT_MARGIN_CELLS = 0.5

/** The view that holds every box, centred, with half a cell to spare. */
export function fitView(boxes: readonly Box[], fieldPx: number): View {
  const minX = Math.min(...boxes.map((b) => b.x))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))

  const span = Math.max(maxX - minX, maxY - minY) + 2 * FIT_MARGIN_CELLS
  const cellPx = clampCellPx(fieldPx / span, fieldPx)
  const half = fieldPx / cellPx / 2

  return { left: (minX + maxX) / 2 - half, top: (minY + maxY) / 2 + half, cellPx }
}

/** World coordinates of the grid lines inside the field. */
export function gridLines(
  view: View,
  fieldPx: number,
  mode: GridMode,
): { xs: number[]; ys: number[] } {
  const spacing = spacingOf(view, fieldPx, mode)
  const extent = fieldPx / view.cellPx

  return {
    xs: multiples(view.left, view.left + extent, spacing),
    ys: multiples(view.top - extent, view.top, spacing),
  }
}

function spacingOf(view: View, fieldPx: number, mode: GridMode): number {
  if (mode === 'world') return 1
  if (mode === 'screen') return baseCellPx(fieldPx) / view.cellPx

  let k = Math.ceil(Math.log2(STEP_MIN_PX / view.cellPx))
  while (view.cellPx * 2 ** k < STEP_MIN_PX) k++
  while (view.cellPx * 2 ** (k - 1) >= STEP_MIN_PX) k--

  return 2 ** k
}

function multiples(from: number, to: number, spacing: number): number[] {
  const lines: number[] = []
  for (let i = Math.ceil(from / spacing); i * spacing <= to; i++) lines.push(i * spacing)

  return lines
}
