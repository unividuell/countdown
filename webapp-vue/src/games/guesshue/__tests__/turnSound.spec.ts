import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TURN_HZ, playMarker, playTurn, stepOf } from '../turnSound'

/** Records what is scheduled: every oscillator with its first pitch and start. */
const started: { hz: number; at: number }[] = []

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
        started.push({ hz: node.frequency.setValueAtTime.mock.calls[0]![0] as number, at }),
      stop: vi.fn(),
    }
    return node
  },
}

vi.mock('@/ui/audio', () => ({ audioGraph: () => graph, START_LOOKAHEAD_SECONDS: 0 }))

describe('stepOf', () => {
  it('is the whole degree the knob stands in', () => {
    expect([0, 0.9, 1, 359.9].map(stepOf)).toEqual([0, 0, 1, 359])
  })

  it('folds an angle outside the circle back onto it', () => {
    expect([-1, 360, 725].map(stepOf)).toEqual([359, 0, 5])
  })
})

describe('playTurn', () => {
  beforeEach(() => {
    started.length = 0
    graph.state = 'running'
    // Far past the previous case's last knock.
    graph.currentTime += 10
  })

  it('knocks once at the one pitch, body and overtone', () => {
    playTurn()

    expect(started.map(({ hz }) => hz)).toEqual([TURN_HZ, TURN_HZ * 3.9])
  })

  it('drops a knock that follows too closely', () => {
    playTurn()
    graph.currentTime += 0.01
    playTurn()
    graph.currentTime += 0.03
    playTurn()

    // Body and overtone each: two knocks of three.
    expect(started).toHaveLength(4)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playTurn()

    expect(started).toEqual([])
  })
})

describe('playMarker', () => {
  beforeEach(() => {
    started.length = 0
    graph.state = 'running'
  })

  it('is the wheel’s own knock, once', () => {
    playMarker()

    expect(started.map(({ hz }) => hz)).toEqual([TURN_HZ, TURN_HZ * 3.9])
  })

  it('knocks for each of two markers landing close together', () => {
    playMarker()
    playMarker()

    expect(started).toHaveLength(4)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playMarker()

    expect(started).toEqual([])
  })
})
