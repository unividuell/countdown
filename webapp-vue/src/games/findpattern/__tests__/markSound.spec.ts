import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLEAR_HZ, markHz, playClear, playMark } from '../markSound'
import { bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('markHz', () => {
  it('climbs the major scale from C5, one step per marked block', () => {
    expect([1, 2, 3, 4].map((count) => Math.round(markHz(count)))).toEqual([523, 587, 659, 698])
  })

  it('goes on into the next octave past seven', () => {
    expect(markHz(8)).toBeCloseTo(markHz(1) * 2)
  })
})

describe('playMark', () => {
  beforeEach(resetGraph)

  it('knocks once at the pitch of the count', () => {
    playMark(3, false)

    expect(bodies().map(({ hz }) => hz)).toEqual([markHz(3)])
  })

  it('lets the completing knock ring out longer', () => {
    playMark(1, false)
    const short = started[0]!.stop.mock.calls[0]![0] as number
    resetGraph()
    playMark(4, true)
    const long = started[0]!.stop.mock.calls[0]![0] as number

    expect(long).toBeGreaterThan(short)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playMark(1, false)

    expect(started).toEqual([])
  })

  it('stays silent while muted', () => {
    sound.on = false
    playMark(1, false)

    expect(started).toEqual([])
  })
})

describe('playClear', () => {
  beforeEach(resetGraph)

  it('knocks twice, down: „ba-dum“', () => {
    playClear()

    const [ba, dum] = bodies()
    expect([ba!.hz, dum!.hz]).toEqual([...CLEAR_HZ])
    expect(dum!.hz).toBeLessThan(ba!.hz)
    expect(dum!.at).toBeGreaterThan(ba!.at)
  })

  it('stays silent while the graph sleeps or is muted', () => {
    graph.state = 'suspended'
    playClear()
    resetGraph()
    sound.on = false
    playClear()

    expect(started).toEqual([])
  })
})
