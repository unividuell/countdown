// Place and break sounds per block type: Minecraft's own samples, the only openly licensed block
// sounds (see sounds/CREDITS.md). A play picks a variant at random. A sample not yet decoded stays
// silent — no synthesis stands in.
import glass1 from './sounds/glass1.m4a?url'
import glass2 from './sounds/glass2.m4a?url'
import glass3 from './sounds/glass3.m4a?url'
import grass1 from './sounds/grass1.m4a?url'
import grass2 from './sounds/grass2.m4a?url'
import grass3 from './sounds/grass3.m4a?url'
import grass4 from './sounds/grass4.m4a?url'
import gravel1 from './sounds/gravel1.m4a?url'
import gravel2 from './sounds/gravel2.m4a?url'
import gravel3 from './sounds/gravel3.m4a?url'
import gravel4 from './sounds/gravel4.m4a?url'
import stone1 from './sounds/stone1.m4a?url'
import stone2 from './sounds/stone2.m4a?url'
import stone3 from './sounds/stone3.m4a?url'
import stone4 from './sounds/stone4.m4a?url'

import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { BLOCK_TYPES } from './blockTypes'
import type { BlockCode, SoundSet } from './blockTypes'

const SAMPLES: Record<SoundSet, readonly string[]> = {
  stone: [stone1, stone2, stone3, stone4],
  grass: [grass1, grass2, grass3, grass4],
  gravel: [gravel1, gravel2, gravel3, gravel4],
  glass: [glass1, glass2, glass3],
}

/** Minecraft pitches block sounds down to 0.8, each play ±5 % apart. */
export const PITCH = 0.8
export const PITCH_SPREAD = 0.05

/*
 * Breaking, after survival-mode mining: a few deep knocks, then the break sound with a crumble
 * under it. Rebuilt from our free samples — Minecraft's own hit files belong to Mojang. All
 * starting values, to be tuned by ear in the lab.
 *
 *   knock  knock  knock  crack
 *   0      60     120    180 ms
 *                          crumble (+30 ms, pitched up, quieter)
 */

/** Knocks before the break: the place sample, an octave down and quieter. */
export const HIT_COUNT = 3
export const HIT_PITCH = 0.5
export const HIT_GAIN = 0.4
export const HIT_GAP_S = 0.06

/** A second break variant under the first, detuned up: debris rather than echo. */
export const CRUMBLE_DETUNE = 1.3
export const CRUMBLE_GAIN = 0.5
export const CRUMBLE_DELAY_S = 0.03

export interface PlannedSound {
  set: SoundSet
  rate: number
  gain: number
  offsetS: number
}

/**
 * What an action sounds like, [roll] in `0..1` picking the pitch. Placing plays the place sound;
 * breaking knocks and crumbles, so a block going sounds unlike one coming.
 */
export function soundPlan(
  action: 'place' | 'break',
  code: BlockCode,
  roll: () => number,
): PlannedSound[] {
  const type = BLOCK_TYPES[code]
  const rate = PITCH * (1 - PITCH_SPREAD + 2 * PITCH_SPREAD * roll())

  if (action === 'place') return [{ set: type.place, rate, gain: 1, offsetS: 0 }]

  const knocks = Array.from({ length: HIT_COUNT }, (_, i) => ({
    set: type.place,
    rate: HIT_PITCH,
    gain: HIT_GAIN,
    offsetS: i * HIT_GAP_S,
  }))
  const crack = HIT_COUNT * HIT_GAP_S
  return [
    ...knocks,
    { set: type.break, rate, gain: 1, offsetS: crack },
    {
      set: type.break,
      rate: rate * CRUMBLE_DETUNE,
      gain: CRUMBLE_GAIN,
      offsetS: crack + CRUMBLE_DELAY_S,
    },
  ]
}

/** Decoded samples by URL; null while decoding or when it failed. */
const buffers = new Map<string, AudioBuffer | null>()

/** Decodes every sample once, ahead of the first tap; a suspended graph decodes all the same. */
export function preloadSounds(): void {
  const graph = audioGraph()
  if (!graph) return

  for (const url of Object.values(SAMPLES).flat()) {
    if (buffers.has(url)) continue
    buffers.set(url, null)
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => graph.decodeAudioData(data))
      .then(
        (buffer) => buffers.set(url, buffer),
        (err: unknown) => console.warn('[copy-blocks] a block sound did not decode', url, err),
      )
  }
}

let bus: GainNode | null = null

function busOf(graph: AudioContext): GainNode {
  if (bus) return bus

  bus = graph.createGain()
  bus.gain.value = 0.6
  // Knock and break overlap; the compressor keeps their sum unclipped.
  bus.connect(graph.createDynamicsCompressor()).connect(graph.destination)
  return bus
}

function variantOf(set: SoundSet): AudioBuffer | undefined {
  const ready = SAMPLES[set].map((url) => buffers.get(url)).filter((b) => !!b)

  return ready[Math.floor(Math.random() * ready.length)]
}

export function playSound(action: 'place' | 'break', code: BlockCode): void {
  const graph = audioGraph()
  if (!graph) return

  // Browsers start the graph suspended; the first tap is the gesture that may wake it.
  if (graph.state === 'suspended') {
    graph.resume().catch((err: unknown) => {
      console.warn('[copy-blocks] the browser kept the audio graph suspended', err)
    })
  }

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  for (const { set, rate, gain, offsetS } of soundPlan(action, code, Math.random)) {
    const buffer = variantOf(set)
    if (!buffer) continue

    const source = graph.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const level = graph.createGain()
    level.gain.value = gain
    source.connect(level).connect(busOf(graph))
    source.start(at + offsetS)
  }
}
