import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playWhoosh } from '@/ui/whooshSound'
import { filters, graph, noises, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playWhoosh', () => {
  beforeEach(resetGraph)

  it('blows one burst of noise, no knock', () => {
    playWhoosh()

    expect(noises).toHaveLength(1)
    expect(noises[0]!.length).toBeGreaterThan(0)
    expect(started).toEqual([])
  })

  it('sweeps a band-pass down through the noise: „wruusch“', () => {
    playWhoosh()

    const [filter] = filters
    expect(filter!.type).toBe('bandpass')
    const [from] = filter!.frequency.setValueAtTime.mock.calls[0]! as [number]
    const [to] = filter!.frequency.exponentialRampToValueAtTime.mock.calls[0]! as [number]
    expect(to).toBeLessThan(from)
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playWhoosh()
    resetGraph()
    sound.on = false
    playWhoosh()

    expect(noises).toEqual([])
  })
})
