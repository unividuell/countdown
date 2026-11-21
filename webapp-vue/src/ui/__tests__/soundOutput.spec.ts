import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { GAME_SOUND_KEY } from '@/ui/useGameSound'

/** A graph in `state` whose gains can be read back. */
function stubGraph(state: AudioContextState = 'running') {
  const gains: { gain: { value: number; ramp: ReturnType<typeof vi.fn> }; to: unknown }[] = []

  vi.stubGlobal(
    'AudioContext',
    class {
      state = state
      currentTime = 5
      destination = { name: 'destination' }
      createGain() {
        const ramp = vi.fn()
        const node = {
          gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: ramp, ramp },
          to: null as unknown,
          connect(to: unknown) {
            node.to = to
            return to
          },
        }
        gains.push(node)
        return node
      }
    },
  )

  return gains
}

/** The module is state: the output, and the switch it follows. A fresh copy per case. */
async function load() {
  const audio = await import('@/ui/audio')
  const output = await import('@/ui/soundOutput')
  const { useGameSound } = await import('@/ui/useGameSound')

  return { ...audio, ...output, useGameSound }
}

describe('soundOutput', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('is one gain per graph, open, in front of the destination', async () => {
    const gains = stubGraph()
    const { audioGraph, soundOutput } = await load()
    const graph = audioGraph()!

    expect(soundOutput(graph)).toBe(soundOutput(graph))
    expect(gains).toHaveLength(1)
    expect(gains[0]!.gain.value).toBe(1)
    expect(gains[0]!.to).toBe(graph.destination)
  })

  it('starts closed on a stored mute', async () => {
    localStorage.setItem(GAME_SOUND_KEY, 'false')
    const gains = stubGraph()
    const { audioGraph, soundOutput } = await load()
    soundOutput(audioGraph()!)

    expect(gains[0]!.gain.value).toBe(0)
  })

  it('closes when the switch goes off, and opens again: what is sounding falls silent', async () => {
    const gains = stubGraph()
    const { audioGraph, soundOutput, useGameSound } = await load()
    soundOutput(audioGraph()!)
    const sound = useGameSound()

    sound.value = false
    await nextTick()
    await nextTick()
    expect(gains[0]!.gain.ramp).toHaveBeenLastCalledWith(0, expect.closeTo(5.02))

    sound.value = true
    await nextTick()
    await nextTick()
    expect(gains[0]!.gain.ramp).toHaveBeenLastCalledWith(1, expect.closeTo(5.02))
  })
})

describe('gameSoundOn', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('reads the shared switch outside a component', async () => {
    const { gameSoundOn, useGameSound } = await load()
    expect(gameSoundOn()).toBe(true)

    useGameSound().value = false
    await nextTick()
    await nextTick()

    expect(gameSoundOn()).toBe(false)
  })
})

describe('soundGraph', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('is the graph while it runs and sound is on', async () => {
    stubGraph('running')
    const { audioGraph, soundGraph } = await load()

    expect(soundGraph()).toBe(audioGraph())
  })

  it('is null while the graph sleeps', async () => {
    stubGraph('suspended')
    const { soundGraph } = await load()

    expect(soundGraph()).toBeNull()
  })

  it('is null while muted, and opens no graph for it', async () => {
    localStorage.setItem(GAME_SOUND_KEY, 'false')
    const created = vi.fn()
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          created()
        }
      },
    )
    const { soundGraph } = await load()

    expect(soundGraph()).toBeNull()
    expect(created).not.toHaveBeenCalled()
  })
})
