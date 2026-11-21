import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playCount, playPop, POP_GAP_MS } from '../countSound'
import type { Tone } from '../countTones'
import { audioMock, bodies, graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

const TONES: Tone[] = [
  { atS: 0, hz: 400 },
  { atS: 0.058, hz: 416 },
]

describe('playCount', () => {
  beforeEach(resetGraph)

  it('knocks each tick, body and overtone, and no verdict without one', () => {
    playCount(TONES, null)

    expect(started.map(({ hz, at }) => [hz, at])).toEqual([
      [400, 0],
      [1560, 0],
      [416, 0.058],
      [416 * 3.9, 0.058],
    ])
  })

  it('a win ends in a rising C major arpeggio, 70 ms after the last tick', () => {
    playCount(TONES, true)
    const roots = bodies().slice(2)

    expect(roots.map(({ hz }) => hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(roots[0]!.at).toBeCloseTo(0.128)
    expect(roots[4]!.at).toBeCloseTo(0.128 + 4 * 0.04)
  })

  it('a loss ends in two falling knocks', () => {
    playCount(TONES, false)

    expect(
      bodies()
        .slice(2)
        .map(({ hz }) => hz),
    ).toEqual([311, 220])
  })

  it('stop silences every voice, the verdict too', () => {
    playCount(TONES, true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent while the graph sleeps: the count would land on the next tap', () => {
    graph.state = 'suspended'
    playCount(TONES, true)

    expect(started).toEqual([])
  })

  it('stays silent while muted', () => {
    sound.on = false
    playCount(TONES, true)

    expect(started).toEqual([])
  })
})

describe('playPop', () => {
  beforeEach(() => {
    resetGraph()
    vi.restoreAllMocks()
  })

  it('knocks for A, then a fourth higher for B', () => {
    playPop()

    expect(bodies()).toEqual([
      { hz: 700, at: 0 },
      { hz: 700 * 2 ** (5 / 12), at: POP_GAP_MS / 1000 },
    ])
  })

  it('waits for a sleeping graph that wakes at once', async () => {
    graph.state = 'suspended'
    playPop()
    await Promise.resolve()

    expect(bodies()).toHaveLength(2)
  })

  it('stays silent when the graph wakes too late', async () => {
    graph.state = 'suspended'
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    playPop()
    now.mockReturnValue(1000)
    await Promise.resolve()

    expect(started).toEqual([])
  })

  it('stays silent when stopped before the graph wakes', async () => {
    graph.state = 'suspended'
    playPop().stop()
    await Promise.resolve()

    expect(started).toEqual([])
  })

  it('stays silent while muted, and leaves the device’s audio alone', async () => {
    sound.on = false
    graph.state = 'suspended'
    audioMock.unlockSound.mockClear()
    graph.resume.mockClear()
    playPop()
    await Promise.resolve()

    expect(started).toEqual([])
    expect(audioMock.unlockSound).not.toHaveBeenCalled()
    expect(graph.resume).not.toHaveBeenCalled()
  })
})
