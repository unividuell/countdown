import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EchoEngine, loadSounds, shotsOf } from '@/games/echolocate/engine'
import type { EchoSounds, Shot } from '@/games/echolocate/engine'
import { BURST_SECONDS, REF_RMS, dbToGain, rms } from '@/games/echolocate/noise'
import type { EchoHit, NoiseKind } from '@/games/echolocate/types'
import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'

const NOISE_KINDS: NoiseKind[] = ['BIRDS', 'BROOK', 'COW', 'WIND', 'RAIN']

class FakeBuffer {
  readonly channels: Float32Array[]

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
  }

  get duration(): number {
    return this.length / this.sampleRate
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel]!
  }

  copyToChannel(data: Float32Array, channel: number): void {
    this.channels[channel]!.set(data)
  }
}

class FakeNode {
  connect = vi.fn((to: unknown) => to)
  disconnect = vi.fn()
}

class FakeGain extends FakeNode {
  gain = { value: 1 }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null
  loop = false
  onended: (() => void) | null = null
  startedAt: number | null = null
  stopped = false

  start(when: number): void {
    this.startedAt = when
  }

  stop(): void {
    this.stopped = true
  }
}

class FakeLimiter extends FakeNode {
  threshold = { value: 0 }
  knee = { value: 0 }
  ratio = { value: 0 }
  attack = { value: 0 }
  release = { value: 0 }
}

/** A stereo clip whose channels sum to a flat 0.5: only a true downmix comes out even. */
function stereoDecoded(): FakeBuffer {
  const decoded = new FakeBuffer(2, 480, 48000)
  decoded.channels[0]!.forEach((_, i) => {
    decoded.channels[0]![i] = i % 2 === 0 ? 1 : 0
    decoded.channels[1]![i] = i % 2 === 0 ? 0 : 1
  })

  return decoded
}

class FakeContext {
  currentTime = 2
  sampleRate = 48000
  outputLatency: number | undefined = 0
  baseLatency = 0
  destination = new FakeNode()
  gains: FakeGain[] = []
  sources: FakeSource[] = []
  limiters: FakeLimiter[] = []

  /** An empty answer is what a body that is no audio decodes to. */
  decodeAudioData = vi.fn(async (data: ArrayBuffer) => {
    if (data.byteLength === 0) throw new DOMException('not audio', 'EncodingError')

    return stereoDecoded()
  })

  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate)
  }

  createGain(): FakeGain {
    const gain = new FakeGain()
    this.gains.push(gain)

    return gain
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource()
    this.sources.push(source)

    return source
  }

  createDynamicsCompressor(): FakeLimiter {
    const limiter = new FakeLimiter()
    this.limiters.push(limiter)

    return limiter
  }
}

let ctx: FakeContext

function asContext(fake: FakeContext): AudioContext {
  return fake as unknown as AudioContext
}

function bufferOf(seconds: number): AudioBuffer {
  return new FakeBuffer(1, Math.round(seconds * 1000), 1000) as unknown as AudioBuffer
}

function shot(seconds: number, delayMs: number, gain = 1): Shot {
  return { buffer: bufferOf(seconds), delayMs, gain }
}

beforeEach(() => {
  ctx = new FakeContext()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadSounds', () => {
  let fetched: string[]

  beforeEach(() => {
    fetched = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url)
        if (url.includes('gone')) return { ok: false, status: 404 }

        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new ArrayBuffer(url.includes('junk') ? 0 : 8),
        }
      }),
    )
  })

  it('gives every noise kind a sound', async () => {
    const sounds = await loadSounds(asContext(ctx), [])

    expect(Object.keys(sounds.noises).sort()).toEqual([...NOISE_KINDS].sort())
    for (const kind of NOISE_KINDS) expect(sounds.noises[kind].duration).toBeGreaterThan(0)
    expect(sounds.bed.duration).toBe(6)
  })

  it('fetches the brook and the cow, and nothing else without clips', async () => {
    await loadSounds(asContext(ctx), [null, null])

    expect(fetched).toHaveLength(2)
    expect(fetched.some((url) => url.endsWith('brook.mp3'))).toBe(true)
    expect(fetched.some((url) => url.endsWith('cow.mp3'))).toBe(true)
  })

  it('levels a recording to the reference loudness, in mono', async () => {
    const { noises } = await loadSounds(asContext(ctx), [])
    const brook = noises.BROOK

    expect(brook.numberOfChannels).toBe(1)
    expect(rms(brook.getChannelData(0))).toBeCloseTo(REF_RMS, 6)
    // flat means both channels were mixed in, not one of them taken
    expect(brook.getChannelData(0).every((s) => Math.abs(s - REF_RMS) < 1e-6)).toBe(true)
  })

  it('synthesises wind, rain and birds as a burst each', async () => {
    const { noises } = await loadSounds(asContext(ctx), [])

    for (const kind of ['WIND', 'RAIN', 'BIRDS'] as const) {
      expect(noises[kind].duration).toBeCloseTo(BURST_SECONDS, 3)
    }
  })

  it('decodes the clips in their order, levelled', async () => {
    const { clips } = await loadSounds(asContext(ctx), ['blob:clip-0', 'blob:clip-1'])

    expect(clips).toHaveLength(2)
    expect(fetched).toEqual(expect.arrayContaining(['blob:clip-0', 'blob:clip-1']))
    expect(rms(clips[1]!.getChannelData(0))).toBeCloseTo(REF_RMS, 6)
  })

  it('has no sound for a round without clip assets', async () => {
    expect((await loadSounds(asContext(ctx), [null])).clips).toEqual([null])
    expect((await loadSounds(asContext(ctx), [null, null])).clips).toEqual([null, null])
  })

  it('turns a clip that fails to load or decode into null and keeps its place', async () => {
    const { clips } = await loadSounds(asContext(ctx), ['blob:gone', 'blob:clip-1', 'blob:junk'])

    expect(clips.map((clip) => clip !== null)).toEqual([false, true, false])
    expect(console.warn).toHaveBeenCalledTimes(2)
  })

  it('plays on with a silent brook when its recording fails to load', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => {
      throw new TypeError('network down')
    })

    const { noises } = await loadSounds(asContext(ctx), [])

    expect(noises.BROOK.duration).toBeCloseTo(BURST_SECONDS, 3)
    expect(noises.BROOK.getChannelData(0).every((s) => s === 0)).toBe(true)
    expect(rms(noises.COW.getChannelData(0))).toBeCloseTo(REF_RMS, 6)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})

describe('shotsOf', () => {
  const sounds: EchoSounds = {
    clips: [bufferOf(1.5), bufferOf(1)],
    noises: Object.fromEntries(NOISE_KINDS.map((kind) => [kind, bufferOf(1.3)])) as Record<
      NoiseKind,
      AudioBuffer
    >,
  }

  it('maps hits to shots, noises at the noise level', () => {
    const hits: EchoHit[] = [
      { sound: 'CLIP', clip: 1, delayMs: 500 },
      { sound: 'WIND', clip: null, delayMs: 1200 },
    ]

    expect(shotsOf(hits, sounds, -6)).toEqual([
      { buffer: sounds.clips[1], delayMs: 500, gain: 1 },
      { buffer: sounds.noises.WIND, delayMs: 1200, gain: dbToGain(-6) },
    ])
  })

  it('plays a clip at full gain whatever the noise level', () => {
    const [clip] = shotsOf([{ sound: 'CLIP', clip: 0, delayMs: 0 }], sounds, -12)

    expect(clip?.gain).toBe(1)
  })

  it('skips a clip whose sound is missing', () => {
    const silent: EchoSounds = { ...sounds, clips: [null] }
    const hits: EchoHit[] = [
      { sound: 'CLIP', clip: 0, delayMs: 100 },
      { sound: 'CLIP', clip: 1, delayMs: 200 },
      { sound: 'COW', clip: null, delayMs: 300 },
    ]

    expect(() => shotsOf(hits, silent, 0)).not.toThrow()
    expect(shotsOf(hits, silent, 0)).toEqual([{ buffer: sounds.noises.COW, delayMs: 300, gain: 1 }])
  })

  it('has no shots for no hits', () => {
    expect(shotsOf([], sounds, 0)).toEqual([])
  })
})

describe('EchoEngine', () => {
  it('sends the mix through a limiter into the speakers', () => {
    new EchoEngine(asContext(ctx))

    const [master] = ctx.gains
    const [limiter] = ctx.limiters
    expect(master?.connect).toHaveBeenCalledWith(limiter)
    expect(limiter?.connect).toHaveBeenCalledWith(ctx.destination)
  })

  it('schedules every shot at lookahead plus its delay', () => {
    const engine = new EchoEngine(asContext(ctx))

    engine.ping([shot(1.3, 0), shot(1, 750, 0.5)])

    expect(ctx.sources.map((source) => source.startedAt)).toEqual([
      2 + START_LOOKAHEAD_SECONDS,
      2 + START_LOOKAHEAD_SECONDS + 0.75,
    ])
  })

  it('plays each shot at its own gain, through the master', () => {
    const engine = new EchoEngine(asContext(ctx))
    const [master] = ctx.gains

    engine.ping([shot(1, 0, 0.25)])

    const [, own] = ctx.gains
    expect(own?.gain.value).toBe(0.25)
    expect(own?.connect).toHaveBeenCalledWith(master)
    expect(ctx.sources[0]?.connect).toHaveBeenCalledWith(own)
  })

  it('reports when the last shot ends', () => {
    const engine = new EchoEngine(asContext(ctx))

    // ends at 400 + 1300 and at 2000 + 500 ms: the later one counts
    const end = engine.ping([shot(1.3, 400), shot(0.5, 2000)])

    expect(end).toBeCloseTo(2500 + START_LOOKAHEAD_SECONDS * 1000, 6)
  })

  it('reports the lookahead for a ping that reaches nothing', () => {
    const engine = new EchoEngine(asContext(ctx))

    expect(engine.ping([])).toBeCloseTo(START_LOOKAHEAD_SECONDS * 1000, 6)
    expect(ctx.sources).toHaveLength(0)
  })

  it('puts output latency into the head start', () => {
    ctx.outputLatency = 0.1
    ctx.baseLatency = 0.01

    expect(new EchoEngine(asContext(ctx)).headStartMs).toBeCloseTo(160, 6)
  })

  it('has a head start of just the lookahead where the device reports no latency', () => {
    ctx.outputLatency = undefined
    ctx.baseLatency = 0

    expect(new EchoEngine(asContext(ctx)).headStartMs).toBeCloseTo(50, 6)
  })

  it('loops the bed from the lookahead on, once', () => {
    const engine = new EchoEngine(asContext(ctx))
    const bed = bufferOf(6)

    engine.startBed(bed, 0.063)
    engine.startBed(bed, 0.5)

    expect(ctx.sources).toHaveLength(1)
    expect(ctx.sources[0]).toMatchObject({ loop: true, startedAt: 2 + START_LOOKAHEAD_SECONDS })
    expect(ctx.sources[0]?.buffer).toBe(bed)
    expect(ctx.gains[1]?.gain.value).toBe(0.063)
  })

  it('hushes pending and sounding shots and leaves the bed running', () => {
    const engine = new EchoEngine(asContext(ctx))
    engine.startBed(bufferOf(6), 0.1)
    engine.ping([shot(1, 0), shot(1, 900)])

    engine.hush()

    const [bed, first, second] = ctx.sources
    expect([bed?.stopped, first?.stopped, second?.stopped]).toEqual([false, true, true])
  })

  it('lets go of a shot that has ended, so a later hush skips it', () => {
    const engine = new EchoEngine(asContext(ctx))
    engine.ping([shot(1, 0), shot(1, 900)])
    const [first, second] = ctx.sources

    first?.onended?.()
    engine.hush()

    expect(first?.disconnect).toHaveBeenCalled()
    expect([first?.stopped, second?.stopped]).toEqual([false, true])
  })

  it('stops the bed and lets go of the mix on dispose', () => {
    const engine = new EchoEngine(asContext(ctx))
    engine.startBed(bufferOf(6), 0.1)
    engine.ping([shot(1, 0)])

    engine.dispose()

    expect(ctx.sources.every((source) => source.stopped)).toBe(true)
    expect(ctx.gains[0]?.disconnect).toHaveBeenCalled()
    expect(ctx.limiters[0]?.disconnect).toHaveBeenCalled()
  })
})
