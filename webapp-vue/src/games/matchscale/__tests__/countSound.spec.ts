import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playCount } from '../countSound'
import type { Tone } from '../countTones'

/** Records what the count schedules: every oscillator with its type, first pitch and start. */
const started: { type: string; hz: number; at: number; stop: ReturnType<typeof vi.fn> }[] = []

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
  state: 'running',
  destination: {},
  createGain: () => ({ gain: param(), connect: (to: unknown) => to }),
  createOscillator: () => {
    const node = {
      type: 'sine',
      frequency: param(),
      connect: (to: unknown) => to,
      start: (at: number) =>
        started.push({
          type: node.type,
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

describe('playCount', () => {
  beforeEach(() => {
    started.length = 0
  })

  it('plays each tick as a sine with its octave, and no verdict without one', () => {
    playCount(TONES, null)

    expect(started.map(({ type, hz, at }) => [type, hz, at])).toEqual([
      ['sine', 400, 0],
      ['sine', 800, 0],
      ['sine', 416, 0.058],
      ['sine', 832, 0.058],
    ])
  })

  it('a win ends in a rising C major arpeggio, 70 ms after the last tick', () => {
    playCount(TONES, true)
    const finale = started.slice(4)
    const roots = finale.filter((_, i) => i % 3 === 0)

    expect(finale).toHaveLength(15)
    expect(roots.map((o) => o.hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(roots[0]!.at).toBeCloseTo(0.128)
    expect(roots[4]!.at).toBeCloseTo(0.128 + 4 * 0.04)
  })

  it('a loss ends in a low triangle and a quiet buzz above it', () => {
    playCount(TONES, false)

    expect(started.slice(4).map(({ type, hz }) => [type, hz])).toEqual([
      ['triangle', 186],
      ['triangle', 372],
      ['sawtooth', 444],
    ])
  })

  it('stop silences every voice, the verdict too', () => {
    playCount(TONES, true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })
})
