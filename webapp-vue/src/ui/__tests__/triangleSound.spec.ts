import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playTriangle } from '@/ui/triangleSound'
import { filters, graph, noises, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playTriangle', () => {
  beforeEach(resetGraph)

  it('rings five partials over C7: two beating pairs and one high', () => {
    playTriangle()

    expect(started.map((o) => o.hz)).toEqual(
      [2093, 2097, 5776.68, 5773.68, 11302.2].map((hz) => expect.closeTo(hz, 2)),
    )
  })

  it('strikes once: one short burst of noise through a 5 kHz high-pass', () => {
    playTriangle()

    expect(noises).toHaveLength(1)
    expect(filters[0]!.type).toBe('highpass')
    expect(filters[0]!.frequency.value).toBe(5000)
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playTriangle()
    resetGraph()
    sound.on = false
    playTriangle()

    expect(started).toEqual([])
    expect(noises).toEqual([])
  })
})
