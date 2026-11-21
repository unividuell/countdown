import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playCount, playPop, POP_GAP_MS } from '../countSound'
import type { Tone } from '../countTones'

/** Records what is scheduled: every oscillator with its first pitch and start. */
const started: { hz: number; at: number; stop: ReturnType<typeof vi.fn> }[] = []

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

const graph = {
  currentTime: 0,
  state: 'running' as AudioContextState,
  resume: vi.fn(() => Promise.resolve()),
  destination: {},
  createGain: () => ({ gain: param(), connect: (to: unknown) => to }),
  createOscillator: () => {
    const node = {
      frequency: param(),
      connect: (to: unknown) => to,
      start: (at: number) =>
        started.push({
          hz: node.frequency.setValueAtTime.mock.calls[0]![0] as number,
          at,
          stop: node.stop,
        }),
      stop: vi.fn(),
    }
    return node
  },
}

vi.mock('@/ui/audio', () => ({ audioGraph: () => graph, START_LOOKAHEAD_SECONDS: 0 }))

const TONES: Tone[] = [
  { atS: 0, hz: 400 },
  { atS: 0.058, hz: 416 },
]

/** Each knock is a body and a quiet knock at 3.9× its pitch: the bodies' pitches and starts. */
const bodies = () => started.filter((_, i) => i % 2 === 0).map(({ hz, at }) => [hz, at])

describe('playCount', () => {
  beforeEach(() => {
    started.length = 0
  })

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

    expect(roots.map(([hz]) => hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(roots[0]![1]).toBeCloseTo(0.128)
    expect(roots[4]![1]).toBeCloseTo(0.128 + 4 * 0.04)
  })

  it('a loss ends in two falling knocks', () => {
    playCount(TONES, false)

    expect(
      bodies()
        .slice(2)
        .map(([hz]) => hz),
    ).toEqual([311, 220])
  })

  it('stop silences every voice, the verdict too', () => {
    playCount(TONES, true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })
})

describe('playPop', () => {
  beforeEach(() => {
    started.length = 0
    graph.state = 'running'
    vi.restoreAllMocks()
  })

  it('knocks for A, then a fourth higher for B', () => {
    playPop()

    expect(bodies()).toEqual([
      [700, 0],
      [700 * 2 ** (5 / 12), POP_GAP_MS / 1000],
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
})
