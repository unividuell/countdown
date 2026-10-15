import { describe, expect, it } from 'vitest'
import { TAP_SLOP_PX, centredAt, clamp, drag, press, release } from '@/games/placepatch/stamp'

// 40 × 30 cells of 10 px, a 10 × 10 stamp.
const BOARD = { cols: 40, rows: 30, size: 10, cellPx: 10 }

describe('stamp', () => {
  it('centres an even stamp on the nearest crossing, an odd one on the cell', () => {
    expect(centredAt(BOARD, { x: 123, y: 87 })).toEqual({ x: 7, y: 4 })
    expect(centredAt({ ...BOARD, size: 3 }, { x: 57, y: 57 })).toEqual({ x: 4, y: 4 })
  })

  it('keeps the stamp inside the board on all four sides', () => {
    expect(clamp(BOARD, { x: -3, y: -1 })).toEqual({ x: 0, y: 0 })
    expect(clamp(BOARD, { x: 35, y: 25 })).toEqual({ x: 30, y: 20 })
  })

  it('treats a lift within the slop as a tap and centres the stamp there', () => {
    const gesture = press(BOARD, null, { x: 123, y: 87 })
    const moved = drag(BOARD, gesture, { x: 123 + TAP_SLOP_PX - 1, y: 87 })

    expect(moved.stamp).toBeNull()
    expect(release(BOARD, moved.gesture, { x: 124, y: 88 }, null)).toEqual({ x: 7, y: 4 })
  })

  it('moves an existing stamp by the finger’s travel, wherever the finger is', () => {
    const gesture = press(BOARD, { x: 5, y: 5 }, { x: 300, y: 200 })

    const first = drag(BOARD, gesture, { x: 334, y: 200 })
    expect(first.stamp).toEqual({ x: 8, y: 5 })

    const second = drag(BOARD, first.gesture, { x: 339, y: 221 })
    expect(second.stamp).toEqual({ x: 9, y: 7 })
    expect(release(BOARD, second.gesture, { x: 339, y: 221 }, second.stamp)).toEqual({ x: 9, y: 7 })
  })

  it('does not stick on slow moves - travel counts from the start, not per step', () => {
    let gesture = press(BOARD, { x: 5, y: 5 }, { x: 0, y: 0 })
    let stamp = null
    for (let px = 2; px <= 16; px += 2) {
      const next = drag(BOARD, gesture, { x: px, y: 0 })
      gesture = next.gesture
      stamp = next.stamp ?? stamp
    }

    expect(stamp).toEqual({ x: 7, y: 5 })
  })

  it('starts a drag without a stamp from one centred under the finger', () => {
    const gesture = press(BOARD, null, { x: 100, y: 100 })

    expect(drag(BOARD, gesture, { x: 140, y: 100 }).stamp).toEqual({ x: 9, y: 5 })
  })

  it('stays a drag once it was one, even back inside the slop', () => {
    const gesture = press(BOARD, { x: 5, y: 5 }, { x: 0, y: 0 })
    const away = drag(BOARD, gesture, { x: 30, y: 0 })
    const back = drag(BOARD, away.gesture, { x: 2, y: 0 })

    expect(back.stamp).toEqual({ x: 5, y: 5 })
    expect(release(BOARD, back.gesture, { x: 2, y: 0 }, back.stamp)).toEqual({ x: 5, y: 5 })
  })

  it('never drags the stamp off the board', () => {
    const gesture = press(BOARD, { x: 28, y: 18 }, { x: 0, y: 0 })

    expect(drag(BOARD, gesture, { x: 200, y: 200 }).stamp).toEqual({ x: 30, y: 20 })
  })
})
