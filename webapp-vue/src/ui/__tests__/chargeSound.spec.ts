import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bodies, graph, resetGraph, sound, started } from './fakeGraph'
import { CHARGE_HZ, chargeKnocks } from '../charge'
import { playCharge } from '../chargeSound'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playCharge', () => {
  beforeEach(resetGraph)

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

  it('stays silent while muted', () => {
    sound.on = false
    playCharge(0, 2000).stop()

    expect(started).toEqual([])
  })
})
