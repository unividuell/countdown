import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REDO_HZ, UNDO_HZ, brushHz, playBrush, playRedo, playUndo } from '../toolSound'
import { bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('brushHz', () => {
  it('sinks as the brush grows: G5, E5, C5', () => {
    expect([0, 1, 2].map((i) => Math.round(brushHz(i)))).toEqual([784, 659, 523])
  })
})

describe('playUndo, playRedo', () => {
  beforeEach(resetGraph)

  it('knocks undo below and redo above', () => {
    playUndo()
    playRedo()

    expect(bodies().map(({ hz }) => hz)).toEqual([UNDO_HZ, REDO_HZ])
    expect(UNDO_HZ).toBeLessThan(REDO_HZ)
  })
})

describe('playBrush', () => {
  beforeEach(resetGraph)

  it('knocks once at the brush’s pitch', () => {
    playBrush(2)

    expect(bodies().map(({ hz }) => hz)).toEqual([brushHz(2)])
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playBrush(0)
    resetGraph()
    sound.on = false
    playBrush(0)

    expect(started).toEqual([])
  })
})
