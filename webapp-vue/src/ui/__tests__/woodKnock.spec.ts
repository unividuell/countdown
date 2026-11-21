import { describe, expect, it, vi } from 'vitest'
import { VOLUME, knocks } from '../woodKnock'

function param() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

describe('knocks', () => {
  it('sends every knock through one bus at the shared volume, into the sound output', () => {
    const gains: { gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn> }[] = []
    const destination = {}
    const graph = {
      currentTime: 0,
      destination,
      createGain: () => {
        const node = { gain: param(), connect: vi.fn() }
        gains.push(node)
        return node
      },
      createOscillator: () => ({
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    }

    knocks(graph as unknown as AudioContext).knock(0, 700)
    const [bus, output, ...voices] = gains

    expect(bus!.gain.value).toBe(VOLUME)
    // Not straight out: through the output, where the sound switch is honoured.
    expect(bus!.connect).toHaveBeenCalledWith(output)
    expect(output!.connect).toHaveBeenCalledWith(destination)
    // Body and overtone, each into the bus rather than straight out.
    expect(voices.map((voice) => voice.connect.mock.calls[0]![0])).toEqual([bus, bus])
  })
})
