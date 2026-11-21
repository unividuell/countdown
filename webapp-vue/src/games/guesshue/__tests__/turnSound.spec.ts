import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TURN_HZ, playMarker, playTurn, stepOf } from '../turnSound'
import { graph, resetGraph, sound, started } from '@/ui/__tests__/fakeGraph'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

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
    resetGraph()
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
  beforeEach(resetGraph)

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

describe('muted', () => {
  beforeEach(resetGraph)

  it('neither the ratchet nor a landing marker knocks', () => {
    sound.on = false
    playTurn()
    playMarker()

    expect(started).toEqual([])
  })
})
