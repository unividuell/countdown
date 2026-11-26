import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STOP_HZ, playStop } from '../stopSound'
import { bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playStop', () => {
  beforeEach(resetGraph)

  it('knocks once per stop, at one pitch', () => {
    playStop()
    playStop()

    expect(bodies().map(({ hz }) => hz)).toEqual([STOP_HZ, STOP_HZ])
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playStop()
    resetGraph()
    sound.on = false
    playStop()

    expect(started).toEqual([])
  })
})
