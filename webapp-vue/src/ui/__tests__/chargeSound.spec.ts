import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARGE_HZ, chargeKnocks } from '../charge'
import { playCharge } from '../chargeSound'

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

/** Each knock is a body and a quiet overtone: the bodies. */
const bodies = () => started.filter((_, i) => i % 2 === 0)

describe('playCharge', () => {
  beforeEach(() => {
    started.length = 0
    graph.state = 'running'
  })

  it('schedules the whole scale over the hold, the last knock with the full ring', () => {
    playCharge(0, 2000)

    expect(bodies().map(({ hz }) => hz)).toEqual(CHARGE_HZ)
    expect(bodies()[0]!.at).toBe(0)
    expect(bodies().at(-1)!.at).toBeCloseTo(2)
  })

  it('picks up a ring that was still running back: only the knocks ahead', () => {
    const from = chargeKnocks()[5]!.time + 0.001
    playCharge(from, 1000)

    expect(bodies().map(({ hz }) => hz)).toEqual(CHARGE_HZ.slice(6))
    expect(bodies()[0]!.at).toBeCloseTo(chargeKnocks()[6]!.time - from)
  })

  it('stop silences every knock still to come', () => {
    playCharge(0, 2000).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playCharge(0, 2000).stop()

    expect(started).toEqual([])
  })
})
