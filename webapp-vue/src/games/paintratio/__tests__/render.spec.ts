import { describe, expect, it } from 'vitest'
import { drawSegment, drawStrokes } from '@/games/paintratio/render'
import type { Stroke } from '@/games/paintratio/types'

type Call = [name: string, ...args: unknown[]]

/** A context that writes down every call and every property set, in order. */
function recorder() {
  const log: Call[] = []
  const ctx = new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) =>
          log.push([name, ...args]),
      set: (_target, name: string, value: unknown) => {
        log.push(['set ' + name, value])
        return true
      },
    },
  ) as unknown as CanvasRenderingContext2D

  return { ctx, log }
}

const BRUSHES = [40, 80, 160]
const COLOR = '#3049e8'

describe('drawStrokes', () => {
  it('draws a stroke as one round-capped path, scaled to the canvas', () => {
    const { ctx, log } = recorder()
    const stroke: Stroke = { brush: 1, color: COLOR, points: [10, 20, 30, 40, 50, 20] }

    drawStrokes(ctx, [stroke], BRUSHES, 0.5)

    expect(log).toEqual([
      ['set strokeStyle', COLOR],
      ['set lineWidth', 40],
      ['set lineCap', 'round'],
      ['set lineJoin', 'round'],
      ['beginPath'],
      ['moveTo', 5, 10],
      ['lineTo', 15, 20],
      ['lineTo', 25, 10],
      ['stroke'],
    ])
  })

  it('draws a single point as a filled circle of the brush radius', () => {
    const { ctx, log } = recorder()

    drawStrokes(ctx, [{ brush: 2, color: COLOR, points: [100, 200] }], BRUSHES, 0.5)

    expect(log).toEqual([
      ['set fillStyle', COLOR],
      ['beginPath'],
      ['arc', 50, 100, 40, 0, 2 * Math.PI],
      ['fill'],
    ])
  })

  it('draws the strokes in order, each in its own colour and brush', () => {
    const { ctx, log } = recorder()

    drawStrokes(
      ctx,
      [
        { brush: 0, color: '#ff0000', points: [0, 0, 10, 10] },
        { brush: 2, color: '#00ff00', points: [0, 0, 10, 10] },
      ],
      BRUSHES,
      1,
    )

    expect(log.filter(([name]) => name === 'set strokeStyle' || name === 'set lineWidth')).toEqual([
      ['set strokeStyle', '#ff0000'],
      ['set lineWidth', 40],
      ['set strokeStyle', '#00ff00'],
      ['set lineWidth', 160],
    ])
  })

  it('draws nothing for no strokes', () => {
    const { ctx, log } = recorder()

    drawStrokes(ctx, [], BRUSHES, 1)

    expect(log).toEqual([])
  })

  it('skips a stroke whose brush the round does not have', () => {
    const { ctx, log } = recorder()

    drawStrokes(ctx, [{ brush: 3, color: COLOR, points: [0, 0, 10, 10] }], BRUSHES, 1)

    expect(log).toEqual([])
  })
})

describe('drawSegment', () => {
  const stroke: Stroke = { brush: 0, color: COLOR, points: [0, 0, 10, 10, 20, 0] }

  it('draws only the piece from a point on', () => {
    const { ctx, log } = recorder()

    drawSegment(ctx, stroke, 2, BRUSHES, 1)

    expect(log.filter(([name]) => name.startsWith('moveTo') || name.startsWith('lineTo'))).toEqual([
      ['moveTo', 10, 10],
      ['lineTo', 20, 0],
    ])
    expect(log.at(-1)).toEqual(['stroke'])
  })

  it('draws the whole stroke from the first point on', () => {
    const whole = recorder()
    const piece = recorder()

    drawStrokes(whole.ctx, [stroke], BRUSHES, 2)
    drawSegment(piece.ctx, stroke, 0, BRUSHES, 2)

    expect(piece.log).toEqual(whole.log)
  })

  it('draws a dot when a single point is left', () => {
    const { ctx, log } = recorder()

    drawSegment(ctx, { brush: 0, color: COLOR, points: [7, 9] }, 0, BRUSHES, 1)

    expect(log).toContainEqual(['arc', 7, 9, 20, 0, 2 * Math.PI])
    expect(log.at(-1)).toEqual(['fill'])
  })
})
