import { describe, expect, it } from 'vitest'
import { addStroke, EMPTY_PAINT, redo, showsTemplate, undo } from '@/games/paintratio/paintHistory'
import type { Stroke } from '@/games/paintratio/types'

const dot = (x: number): Stroke => ({ brush: 0, color: '#3049e8', points: [x, x] })

describe('paintHistory', () => {
  it('starts bare and shows the template', () => {
    expect(EMPTY_PAINT).toEqual({ strokes: [], redo: [] })
    expect(showsTemplate(EMPTY_PAINT)).toBe(true)
  })

  it('hides the template with the first stroke and brings it back on undoing the last', () => {
    const one = addStroke(EMPTY_PAINT, dot(1))
    const two = addStroke(one, dot(2))

    expect(showsTemplate(one)).toBe(false)
    expect(showsTemplate(undo(two))).toBe(false)
    expect(showsTemplate(undo(undo(two)))).toBe(true)
  })

  it('redo brings the last undone stroke back', () => {
    const two = addStroke(addStroke(EMPTY_PAINT, dot(1)), dot(2))
    const undone = undo(undo(two))

    expect(undone).toEqual({ strokes: [], redo: [dot(2), dot(1)] })
    expect(redo(undone)).toEqual({ strokes: [dot(1)], redo: [dot(2)] })
    expect(redo(redo(undone))).toEqual({ strokes: [dot(1), dot(2)], redo: [] })
    expect(showsTemplate(redo(undone))).toBe(false)
  })

  it('a new stroke empties redo', () => {
    const undone = undo(addStroke(addStroke(EMPTY_PAINT, dot(1)), dot(2)))

    expect(undone.redo).toEqual([dot(2)])
    expect(addStroke(undone, dot(3))).toEqual({ strokes: [dot(1), dot(3)], redo: [] })
  })

  it('undo without strokes changes nothing', () => {
    expect(undo(EMPTY_PAINT)).toBe(EMPTY_PAINT)

    const undone = undo(addStroke(EMPTY_PAINT, dot(1)))
    expect(undo(undone)).toBe(undone)
  })

  it('redo without anything undone changes nothing', () => {
    expect(redo(EMPTY_PAINT)).toBe(EMPTY_PAINT)

    const painted = addStroke(EMPTY_PAINT, dot(1))
    expect(redo(painted)).toBe(painted)
  })

  it('leaves the state it was given untouched', () => {
    const painted = addStroke(EMPTY_PAINT, dot(1))
    const copy = structuredClone(painted)

    undo(painted)
    addStroke(painted, dot(2))

    expect(painted).toEqual(copy)
    expect(EMPTY_PAINT).toEqual({ strokes: [], redo: [] })
  })
})
