import { describe, expect, it } from 'vitest'
import {
  addStroke,
  canRedo,
  EMPTY_PAINT,
  redo,
  showsTemplate,
  undo,
} from '@/games/paintratio/paintHistory'
import { MAX_PATH, MAX_POINTS, MAX_STROKES } from '@/games/paintratio/types'
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

  describe('canRedo', () => {
    /** One stroke of [count] points, one unit apart: a path of `count − 1`. */
    const line = (count: number): Stroke => ({
      brush: 0,
      color: '#3049e8',
      points: Array.from({ length: count }, (_, i) => [0, i % 2]).flat(),
    })

    /** Two points [step] apart in x: a path of [step]. */
    const jump = (step: number): Stroke => ({ brush: 0, color: '#3049e8', points: [0, 0, step, 0] })

    it('needs something undone', () => {
      expect(canRedo(EMPTY_PAINT)).toBe(false)
      expect(canRedo({ strokes: [], redo: [dot(1)] })).toBe(true)
    })

    it('refuses a stroke past the stroke limit', () => {
      const full = Array.from({ length: MAX_STROKES }, () => dot(1))

      expect(canRedo({ strokes: full, redo: [dot(2)] })).toBe(false)
      expect(canRedo({ strokes: full.slice(1), redo: [dot(2)] })).toBe(true)
    })

    it('refuses points past the point limit together with the canvas', () => {
      const painted = [line(MAX_POINTS - 10)]

      expect(canRedo({ strokes: painted, redo: [line(11)] })).toBe(false)
      expect(canRedo({ strokes: painted, redo: [line(10)] })).toBe(true)
    })

    it('refuses a path past the path limit together with the canvas', () => {
      const painted = [jump(MAX_PATH - 100)]

      expect(canRedo({ strokes: painted, redo: [jump(101)] })).toBe(false)
      expect(canRedo({ strokes: painted, redo: [jump(100)] })).toBe(true)
    })

    it('judges only the stroke redo brings back next', () => {
      const painted = [line(MAX_POINTS - 10)]

      expect(canRedo({ strokes: painted, redo: [line(20), line(5)] })).toBe(true)
    })
  })
})
