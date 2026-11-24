import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playDrop } from '../dropSound'
import { graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playDrop', () => {
  beforeEach(resetGraph)

  it('plays one sine starting at 500 Hz', () => {
    playDrop()

    expect(started.map((o) => o.hz)).toEqual([500])
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playDrop()
    resetGraph()
    sound.on = false
    playDrop()

    expect(started).toEqual([])
  })
})
