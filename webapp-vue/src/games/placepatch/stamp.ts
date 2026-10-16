/**
 * Placing the stamp, as arithmetic — happy-dom computes no layout, so this is the half a test can
 * drive. The board hands in pointer positions in CSS px from its top-left corner and gets cells
 * back.
 *
 * A tap puts the stamp under the finger; a drag moves it by the finger's travel, so the finger can
 * stay beside the stamp and not hide it. e.g. a stamp at (5, 5) with 10 px cells, dragged 34 px
 * right → (8, 5); the travel counts from where the drag began, so slow moves never stick.
 */
import type { Cell } from './types'

/** Travel below this is a tap — a finger never lifts exactly where it landed. */
export const TAP_SLOP_PX = 8

/** Held this long without moving, a lift is no tap: the player changed their mind. */
export const LONG_PRESS_MS = 500

export interface Board {
  cols: number
  rows: number
  size: number
  /** CSS px per cell, as the board is drawn right now. */
  cellPx: number
}

export interface Point {
  x: number
  y: number
}

export interface Gesture {
  /** Where the pointer went down. */
  start: Point
  /** The stamp's top-left when the gesture began, in cells. */
  from: Point
  /** Past [TAP_SLOP_PX] once — and a drag from then on. */
  dragging: boolean
  /** When the pointer went down, in ms. */
  at: number
}

export function clamp(board: Board, cell: Cell): Cell {
  return {
    x: Math.min(board.cols - board.size, Math.max(0, cell.x)),
    y: Math.min(board.rows - board.size, Math.max(0, cell.y)),
  }
}

/** Odd sizes centre on the cell under the point, even ones on the nearest crossing. */
export function centredAt(board: Board, point: Point): Cell {
  return clamp(board, {
    x: Math.floor(point.x / board.cellPx - (board.size - 1) / 2),
    y: Math.floor(point.y / board.cellPx - (board.size - 1) / 2),
  })
}

export function press(board: Board, stamp: Cell | null, point: Point, at: number): Gesture {
  return { start: point, from: stamp ?? centredAt(board, point), dragging: false, at }
}

/** The stamp while the pointer moves — `null` as long as this is still a tap. */
export function drag(
  board: Board,
  gesture: Gesture,
  point: Point,
): { gesture: Gesture; stamp: Cell | null } {
  const dx = point.x - gesture.start.x
  const dy = point.y - gesture.start.y
  if (!gesture.dragging && Math.hypot(dx, dy) < TAP_SLOP_PX) return { gesture, stamp: null }
  return {
    gesture: { ...gesture, dragging: true },
    stamp: clamp(board, {
      x: Math.round(gesture.from.x + dx / board.cellPx),
      y: Math.round(gesture.from.y + dy / board.cellPx),
    }),
  }
}

/**
 * Where the stamp ends up: under the finger for a tap, where it was for a drag or a long press.
 */
export function release(
  board: Board,
  gesture: Gesture,
  point: Point,
  current: Cell | null,
  at: number,
): Cell | null {
  if (gesture.dragging || at - gesture.at >= LONG_PRESS_MS) return current
  return centredAt(board, point)
}
