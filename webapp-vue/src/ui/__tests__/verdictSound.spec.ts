import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bodies, graph, resetGraph, started } from './fakeGraph'
import { playVerdict } from '../verdictSound'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)

describe('playVerdict', () => {
  beforeEach(resetGraph)

  it('a win is a rising C major arpeggio, 40 ms apart', () => {
    playVerdict(true)

    expect(bodies().map(({ hz }) => hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(bodies()[4]!.at).toBeCloseTo(4 * 0.04)
  })

  it('a loss is two falling knocks', () => {
    playVerdict(false)

    expect(bodies()).toEqual([
      { hz: 311, at: 0 },
      { hz: 220, at: 0.15 },
    ])
  })

  it('stop silences what has not sounded', () => {
    playVerdict(true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playVerdict(true).stop()

    expect(started).toEqual([])
  })
})
