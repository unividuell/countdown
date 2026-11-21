import { vi } from 'vitest'

/**
 * The app's audio graph for a spec of anything that knocks: oscillators that record instead of
 * sounding. One per spec file — module state, like the graph it stands in for.
 *
 *   vi.mock('@/ui/audio', async () => (await import('@/ui/__tests__/fakeGraph')).audioMock)
 *   vi.mock('@/ui/soundOutput', async () => (await import('@/ui/__tests__/fakeGraph')).soundOutputMock)
 */

/** Every oscillator started: its first pitch, its start, its `stop`. */
export const started: { hz: number; at: number; stop: ReturnType<typeof vi.fn> }[] = []

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

export const graph = {
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

/** What `@/ui/audio` exports, on the fake graph and without a lookahead. */
export const audioMock = {
  audioGraph: () => graph,
  runningGraph: () => (graph.state === 'running' ? graph : null),
  claimPlayback: vi.fn(),
  unlockSound: vi.fn(),
  START_LOOKAHEAD_SECONDS: 0,
}

/** The sound switch as the play functions see it. */
export const sound = { on: true }

/** What `@/ui/soundOutput` exports, on the fake graph and this switch. */
export const soundOutputMock = {
  gameSoundOn: () => sound.on,
  soundGraph: () => (sound.on && graph.state === 'running' ? graph : null),
  soundOutput: () => graph.destination,
}

/** A knock is a body and a quiet overtone at 3.9× its pitch: the bodies, in order. */
export function bodies(): { hz: number; at: number }[] {
  return started.filter((_, i) => i % 2 === 0).map(({ hz, at }) => ({ hz, at }))
}

/** Nothing started, graph running, sound on: call it in `beforeEach`. */
export function resetGraph(): void {
  started.length = 0
  graph.state = 'running'
  sound.on = true
}
