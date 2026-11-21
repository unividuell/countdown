import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playVerdict } from '../verdictSound'

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

/** Each knock is a body and a quiet overtone: the bodies' pitches and starts. */
const bodies = () => started.filter((_, i) => i % 2 === 0).map(({ hz, at }) => [hz, at])

describe('playVerdict', () => {
  beforeEach(() => {
    started.length = 0
    graph.state = 'running'
  })

  it('a win is a rising C major arpeggio, 40 ms apart', () => {
    playVerdict(true)

    expect(bodies().map(([hz]) => hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(bodies()[4]![1]).toBeCloseTo(4 * 0.04)
  })

  it('a loss is two falling knocks', () => {
    playVerdict(false)

    expect(bodies()).toEqual([
      [311, 0],
      [220, 0.15],
    ])
  })

  it('stop silences what has not sounded', () => {
    playVerdict(true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playVerdict(true).stop()

    expect(started).toEqual([])
  })
})
