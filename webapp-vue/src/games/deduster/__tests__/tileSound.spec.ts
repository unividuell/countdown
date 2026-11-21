import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HIT_HZ, playHit } from '../tileSound'
import { bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playHit', () => {
  beforeEach(resetGraph)

  it('knocks once, at one pitch for every tile', () => {
    playHit()
    playHit()

    expect(bodies().map(({ hz }) => hz)).toEqual([HIT_HZ, HIT_HZ])
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playHit()
    resetGraph()
    sound.on = false
    playHit()

    expect(started).toEqual([])
  })
})
