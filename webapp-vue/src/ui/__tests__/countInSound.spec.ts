import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playCountIn } from '@/ui/countInSound'
import { bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playCountIn', () => {
  beforeEach(resetGraph)

  it('knocks 3, 2, 1 on the beat and GO with the full ring, up the scale from C5', () => {
    playCountIn(3, 500)

    const knocks = bodies()
    expect(knocks.map(({ hz }) => Math.round(hz))).toEqual([523, 587, 659, 698])
    const gaps = knocks.slice(1).map(({ at }, i) => at - knocks[i]!.at)
    gaps.forEach((gap) => expect(gap).toBeCloseTo(0.5))
  })

  it('lets GO ring out', () => {
    playCountIn(3, 500)

    const end = (i: number) => started[2 * i]!.stop.mock.calls[0]![0] as number
    const at = (i: number) => bodies()[i]!.at
    expect(end(3) - at(3)).toBeGreaterThan(end(0) - at(0))
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playCountIn(3, 500)
    resetGraph()
    sound.on = false
    playCountIn(3, 500)

    expect(started).toEqual([])
  })
})
