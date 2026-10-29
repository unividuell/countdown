/*
 * Peilung's sound happens in the browser. A pink bed loops for the whole round; a ping's answer is
 * one shot per source its wave reaches, all scheduled against one start on the shared graph.
 *
 *   bed  ─▶ gain ─┐
 *   shot ─▶ gain ─┼─▶ master ─▶ limiter ─▶ out
 *   shot ─▶ gain ─┘   (one per hit, started `delayMs` after the ping)
 */
import brookUrl from './sounds/brook.mp3?url'
import cowUrl from './sounds/cow.mp3?url'

import { START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { BURST_SECONDS, bedSamples, burstSamples, dbToGain, levelled } from './noise'
import type { EchoHit, NoiseKind } from './types'

const MASTER_GAIN = 0.6

export interface Shot {
  buffer: AudioBuffer
  /** Milliseconds after the ping. */
  delayMs: number
  gain: number
}

export interface EchoSounds {
  /** By place in the round's clips; `null` where the asset is gone or did not decode. */
  clips: (AudioBuffer | null)[]
  noises: Record<NoiseKind, AudioBuffer>
}

/**
 * What a ping's answer sounds like. Noises play at `noiseDb` against the clips' 0 dB; a clip
 * without a sound drops out, so a round whose asset vanished is quiet there rather than broken.
 */
export function shotsOf(hits: readonly EchoHit[], sounds: EchoSounds, noiseDb: number): Shot[] {
  const noiseGain = dbToGain(noiseDb)
  const shots: Shot[] = []

  for (const { sound, clip, delayMs } of hits) {
    if (sound !== 'CLIP') {
      shots.push({ buffer: sounds.noises[sound], delayMs, gain: noiseGain })
      continue
    }

    const buffer = clip === null ? null : (sounds.clips[clip] ?? null)
    if (buffer !== null) shots.push({ buffer, delayMs, gain: 1 })
  }

  return shots
}

export class EchoEngine {
  private readonly limiter: DynamicsCompressorNode
  private readonly out: GainNode
  private bed: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  private shots: AudioBufferSourceNode[] = []

  constructor(private readonly ctx: AudioContext) {
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -6
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.1
    this.limiter.connect(ctx.destination)

    this.out = ctx.createGain()
    this.out.gain.value = MASTER_GAIN
    this.out.connect(this.limiter)
  }

  /**
   * Milliseconds from „now“ until a ping's first sample is heard: the lookahead plus what the
   * device adds on the way out (tens of ms wired, a lot more over Bluetooth). The wave on screen
   * starts this late, so ring and sound meet.
   */
  get headStartMs(): number {
    return (
      (START_LOOKAHEAD_SECONDS + (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000
    )
  }

  startBed(buffer: AudioBuffer, gain: number): void {
    if (this.bed) return

    const level = this.ctx.createGain()
    level.gain.value = gain
    level.connect(this.out)

    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(level)
    source.start(this.ctx.currentTime + START_LOOKAHEAD_SECONDS)

    this.bed = { source, gain: level }
  }

  /** Schedules every shot against one start; returns the ms from now until the last one ends. */
  ping(shots: readonly Shot[]): number {
    const start = this.ctx.currentTime + START_LOOKAHEAD_SECONDS
    let endMs = START_LOOKAHEAD_SECONDS * 1000

    for (const shot of shots) {
      const level = this.ctx.createGain()
      level.gain.value = shot.gain
      level.connect(this.out)

      const source = this.ctx.createBufferSource()
      source.buffer = shot.buffer
      source.connect(level)
      source.onended = () => {
        source.disconnect()
        level.disconnect()
        this.shots = this.shots.filter((s) => s !== source)
      }
      source.start(start + shot.delayMs / 1000)

      this.shots.push(source)
      endMs = Math.max(
        endMs,
        START_LOOKAHEAD_SECONDS * 1000 + shot.delayMs + shot.buffer.duration * 1000,
      )
    }

    return endMs
  }

  /** Silences pending and sounding shots; the bed keeps going. */
  hush(): void {
    for (const source of this.shots) source.stop()
  }

  dispose(): void {
    this.hush()
    this.bed?.source.stop()
    this.bed?.source.disconnect()
    this.bed?.gain.disconnect()
    this.bed = null

    this.out.disconnect()
    this.limiter.disconnect()
  }
}

function bufferOf(ctx: AudioContext, data: Float32Array<ArrayBuffer>, rate: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, data.length, rate)
  buffer.copyToChannel(data, 0)

  return buffer
}

/** Left and right would give the direction away; every part plays mono, at the reference loudness. */
function levelledMono(ctx: AudioContext, decoded: AudioBuffer): AudioBuffer {
  const mono = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const channel = decoded.getChannelData(c)
    for (let i = 0; i < mono.length; i++) {
      mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / decoded.numberOfChannels
    }
  }

  return bufferOf(ctx, levelled(mono), decoded.sampleRate)
}

/** A sound as the mix wants it, or `null` — and a warning — when it cannot be had. */
async function tryDecode(
  ctx: AudioContext,
  src: string,
  what: string,
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    return levelledMono(ctx, await ctx.decodeAudioData(await response.arrayBuffer()))
  } catch (err) {
    console.warn(`[echo-locate] ${what} did not load`, src, err)

    return null
  }
}

/**
 * Everything a round sounds with, ready to schedule. Never rejects: a clip that fails becomes
 * `null`, a recording that fails becomes silence, because a round cannot be played again.
 */
export async function loadSounds(
  ctx: AudioContext,
  clipSrcs: readonly (string | null)[],
): Promise<EchoSounds & { bed: AudioBuffer }> {
  const rate = ctx.sampleRate
  const [brook, cow, clips] = await Promise.all([
    tryDecode(ctx, brookUrl, 'the brook recording'),
    tryDecode(ctx, cowUrl, 'the cow recording'),
    Promise.all(clipSrcs.map((src) => (src === null ? null : tryDecode(ctx, src, 'a clip')))),
  ])
  const silence = (): AudioBuffer =>
    bufferOf(ctx, new Float32Array(Math.round(BURST_SECONDS * rate)), rate)

  return {
    bed: bufferOf(ctx, bedSamples(rate), rate),
    clips,
    noises: {
      BIRDS: bufferOf(ctx, burstSamples('BIRDS', rate), rate),
      BROOK: brook ?? silence(),
      COW: cow ?? silence(),
      WIND: bufferOf(ctx, burstSamples('WIND', rate), rate),
      RAIN: bufferOf(ctx, burstSamples('RAIN', rate), rate),
    },
  }
}
