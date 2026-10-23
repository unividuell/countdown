import type { Stroke } from './types'

/**
 * The canvas's own colour: an off-white (`neutral-100`), so it shows where it ends on the white card.
 */
export const CANVAS_GROUND = '#f5f5f5'

/** What a canvas layer shows: the template, or the player's strokes. */
export type CanvasLayer = { kind: 'template' } | { kind: 'strokes'; strokes: readonly Stroke[] }

/**
 * Paints [stroke] from the point at flat index [from] on. A piece of two points or more is one
 * round-capped path; a single point is a dot, as the server counts it. Round caps let a fresh
 * piece join the earlier ones without a seam, so a stroke can be drawn as it grows.
 *
 * Coordinates and brush are canvas units; [scale] is canvas pixels per unit.
 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  from: number,
  brushes: readonly number[],
  scale: number,
): void {
  const diameter = brushes[stroke.brush]
  const { points } = stroke
  if (diameter === undefined || from < 0 || from + 2 > points.length) return

  if (points.length - from === 2) {
    ctx.fillStyle = stroke.color
    ctx.beginPath()
    ctx.arc(
      points[from]! * scale,
      points[from + 1]! * scale,
      (diameter / 2) * scale,
      0,
      2 * Math.PI,
    )
    ctx.fill()
    return
  }

  ctx.strokeStyle = stroke.color
  ctx.lineWidth = diameter * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[from]! * scale, points[from + 1]! * scale)
  for (let i = from + 2; i < points.length; i += 2) {
    ctx.lineTo(points[i]! * scale, points[i + 1]! * scale)
  }
  ctx.stroke()
}

/** Paints every stroke, oldest first — later paint covers earlier. */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  brushes: readonly number[],
  scale: number,
): void {
  for (const stroke of strokes) drawSegment(ctx, stroke, 0, brushes, scale)
}
