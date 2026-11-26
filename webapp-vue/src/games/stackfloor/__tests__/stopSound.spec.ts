import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MISS_HZ, STOP_HZ, perfectHz, playMiss, playPerfect, playStop } from '../stopSound'
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

  it('a perfect stop rings two notes up, a fourth apart', () => {
    playPerfect(1)

    expect(bodies().map(({ hz }) => hz)).toEqual(perfectHz(1))
    expect(perfectHz(1)[0]).toBeCloseTo(1318.51, 2)
    expect(perfectHz(1)[1] / perfectHz(1)[0]).toBeCloseTo(2 ** (5 / 12), 6)
  })

  it('each perfect stop in a row climbs the major scale, up to the octave', () => {
    const roots = [1, 2, 3, 4, 8, 20].map((n) => perfectHz(n)[0] / perfectHz(1)[0])

    expect(roots.map((r) => Math.round(12 * Math.log2(r)))).toEqual([0, 2, 4, 5, 12, 12])
  })

  it('a stop that cut something knocks an octave under the perfect notes', () => {
    expect(STOP_HZ).toBe(440)
  })

  it('the miss knocks another octave down', () => {
    playMiss()

    expect(bodies().map(({ hz }) => hz)).toEqual([MISS_HZ])
    expect(MISS_HZ).toBe(STOP_HZ / 2)
  })

  it('a perfect stop stays silent while muted', () => {
    sound.on = false
    playPerfect(1)

    expect(started).toEqual([])
  })
})
