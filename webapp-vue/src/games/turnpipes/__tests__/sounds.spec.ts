import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeGain {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: (to: unknown) => unknown
}

interface FakeSource {
  buffer: unknown
  loop: boolean
  playbackRate: { value: number }
  connect: (to: unknown) => unknown
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

const gains: FakeGain[] = []
const sources: FakeSource[] = []

/** The sound switch; the output itself adds no gain of its own to count. */
const sound = vi.hoisted(() => ({ on: true }))

vi.mock('@/ui/soundOutput', () => ({
  gameSoundOn: () => sound.on,
  soundOutput: (graph: { destination: unknown }) => graph.destination,
}))

class FakeAudioContext {
  state = 'running'
  currentTime = 10
  destination = {}
  resume = vi.fn(() => Promise.resolve())
  decodeAudioData = vi.fn(() => Promise.resolve({ decoded: true }))

  createGain(): FakeGain {
    const gain: FakeGain = {
      gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: (to) => to,
    }
    gains.push(gain)
    return gain
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      loop: false,
      playbackRate: { value: 1 },
      connect: (to) => to,
      start: vi.fn(),
      stop: vi.fn(),
    }
    sources.push(source)
    return source
  }
}

/** A fresh module per test: the shared audio graph and the buffers are module state. */
async function load() {
  vi.resetModules()
  return import('@/games/turnpipes/sounds')
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  gains.length = 0
  sources.length = 0
  sound.on = true
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('endSoundOf', () => {
  it('the end sound follows the run', async () => {
    const { endSoundOf } = await load()

    expect(endSoundOf({ leak: { at: 3, from: 2 }, correct: false })).toBe('leak')
    expect(endSoundOf({ leak: null, correct: true })).toBe('success')
    expect(endSoundOf({ leak: null, correct: false })).toBe('dry')
  })
})

describe('without Web Audio', () => {
  it('nothing plays and nothing throws', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { preloadSounds, playSound, startFlow } = await load()

    expect(() => {
      preloadSounds()
      playSound('turn').stop()
      startFlow().stop(0.3)
    }).not.toThrow()
    expect(sources).toHaveLength(0)
  })
})

describe('with Web Audio', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  it('a turn varies its pitch by at most five per cent, at 0.6', async () => {
    const { preloadSounds, playSound } = await load()
    preloadSounds()
    await settle()

    for (let i = 0; i < 20; i++) playSound('turn')

    expect(sources).toHaveLength(20)
    for (const source of sources) {
      expect(source.playbackRate.value).toBeGreaterThanOrEqual(0.95)
      expect(source.playbackRate.value).toBeLessThanOrEqual(1.05)
      expect(source.loop).toBe(false)
    }
    expect(gains.every((g) => g.gain.value === 0.6)).toBe(true)
  })

  it('the flow loops at 0.5 and fades out when stopped', async () => {
    const { preloadSounds, startFlow } = await load()
    preloadSounds()
    await settle()

    const flow = startFlow()

    expect(sources[0]!.loop).toBe(true)
    expect(gains[0]!.gain.value).toBe(0.5)

    flow.stop(0.3)

    expect(gains[0]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.3)
    expect(sources[0]!.stop).toHaveBeenCalled()
  })

  it('leak, success and dry play at 0.8; success fades after 2.5 s over 0.6 s', async () => {
    const { preloadSounds, playSound } = await load()
    preloadSounds()
    await settle()

    playSound('leak')
    playSound('dry')
    playSound('success')

    expect(gains.map((g) => g.gain.value)).toEqual([0.8, 0.8, 0.8])
    expect(gains[0]!.gain.linearRampToValueAtTime).not.toHaveBeenCalled()

    const start = 10 + 0.05
    expect(gains[2]!.gain.setValueAtTime).toHaveBeenCalledWith(0.8, start + 2.5)
    expect(gains[2]!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, start + 2.5 + 0.6)
  })

  it('stays silent while muted, and leaves the device’s audio alone', async () => {
    const session = { type: 'auto' }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    const { preloadSounds, playSound, startFlow } = await load()
    preloadSounds()
    await settle()

    sound.on = false
    playSound('turn')
    startFlow().stop()

    expect(sources).toHaveLength(0)
    expect(session.type).toBe('auto')
    Reflect.deleteProperty(navigator, 'audioSession')
  })

  it('stays silent until the sound is decoded', async () => {
    const { playSound } = await load()

    playSound('turn')

    expect(sources).toHaveLength(0)
  })
})
