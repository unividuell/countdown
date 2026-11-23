import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bodies, graph, resetGraph, sound, started } from './fakeGraph'
import { VERDICT_MS } from '@/games/revealChoreography'
import { playVerdict } from '../verdictSound'

vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)

describe('playVerdict', () => {
  beforeEach(resetGraph)

  it('a win is a rising C major arpeggio, 40 ms apart', () => {
    playVerdict(true)

    expect(bodies().map(({ hz }) => hz)).toEqual([523.25, 659.25, 783.99, 1046.5, 1318.5])
    expect(bodies()[4]!.at).toBeCloseTo(4 * 0.04)
  })

  it('a loss is two falling knocks', () => {
    playVerdict(false)

    expect(bodies()).toEqual([
      { hz: 311, at: 0 },
      { hz: 220, at: 0.15 },
    ])
  })

  it.each([true, false])(
    'falls silent within VERDICT_MS, lookahead included (won: %s)',
    async (won) => {
      // The fake graph schedules at once; the real one 50 ms ahead.
      const { START_LOOKAHEAD_SECONDS } =
        await vi.importActual<typeof import('@/ui/audio')>('@/ui/audio')
      playVerdict(won)

      const ends = started.flatMap((oscillator) =>
        oscillator.stop.mock.calls.map(([at]) => at as number),
      )
      expect(START_LOOKAHEAD_SECONDS + Math.max(...ends)).toBeLessThanOrEqual(VERDICT_MS / 1000)
    },
  )

  it('stop silences what has not sounded', () => {
    playVerdict(true).stop()

    for (const oscillator of started) expect(oscillator.stop).toHaveBeenCalledTimes(2)
  })

  it('stays silent while the graph sleeps', () => {
    graph.state = 'suspended'
    playVerdict(true).stop()

    expect(started).toEqual([])
  })

  it('stays silent while muted', () => {
    sound.on = false
    playVerdict(true).stop()

    expect(started).toEqual([])
  })
})
