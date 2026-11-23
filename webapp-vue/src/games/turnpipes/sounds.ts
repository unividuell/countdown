// Five sounds from CC0 recordings (see sounds/CREDITS.md). A sound not yet decoded stays silent,
// and so does everything while the sound switch is off (`soundOutput`).
import dryUrl from './sounds/dry.mp3?url'
import flowUrl from './sounds/flow.mp3?url'
import leakUrl from './sounds/leak.mp3?url'
import successUrl from './sounds/success.mp3?url'
import turnUrl from './sounds/turn.mp3?url'

import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'
import { gameSoundOn, soundOutput } from '@/ui/soundOutput'
import type { Leak } from './types'

export type SoundName = 'turn' | 'flow' | 'leak' | 'success' | 'dry'

export interface Playing {
  stop(fadeS?: number): void
  /** Seconds from now until it falls silent; 0 for a sound that never started, Infinity looping. */
  endsInS: number
}

const URLS: Record<SoundName, string> = {
  turn: turnUrl,
  flow: flowUrl,
  leak: leakUrl,
  success: successUrl,
  dry: dryUrl,
}

const GAIN: Record<SoundName, number> = {
  turn: 0.6,
  flow: 0.5,
  leak: 0.8,
  success: 0.8,
  dry: 0.8,
}

const PITCH_SPREAD = 0.05
const SUCCESS_FADE_AFTER_S = 2.5
const SUCCESS_FADE_S = 0.6
const FLOW_FADE_S = 0.3

/** What ends a run: a leak wins, else all pipes wet is success, else dry. */
export function endSoundOf(run: {
  leak: Leak | null
  correct: boolean
}): 'leak' | 'success' | 'dry' {
  if (run.leak) return 'leak'
  return run.correct ? 'success' : 'dry'
}

/** Decoded sounds by name; null while decoding or when it failed. */
const buffers = new Map<SoundName, AudioBuffer | null>()

/**
 * Decodes every sound once, ahead of the first one needed; a suspended graph decodes all the same.
 * Muted builds no graph: a browser may start one built after a tap, claiming the device's audio.
 */
export function preloadSounds(): void {
  if (!gameSoundOn()) return

  const graph = audioGraph()
  if (graph) decodeAll(graph)
}

function decodeAll(graph: AudioContext): void {
  for (const [name, url] of Object.entries(URLS) as [SoundName, string][]) {
    if (buffers.has(name)) continue
    buffers.set(name, null)
    void fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => graph.decodeAudioData(data))
      .then(
        (buffer) => buffers.set(name, buffer),
        (err: unknown) => console.warn('[turn-pipes] a sound did not decode', name, err),
      )
  }
}

const SILENT: Playing = { stop: () => {}, endsInS: 0 }

function play(name: SoundName, loop: boolean): Playing {
  if (!gameSoundOn()) return SILENT

  const graph = audioGraph()
  if (!graph) return SILENT

  // Unmuted mid-game: the board's preload found sound off.
  decodeAll(graph)

  // Browsers start the graph suspended; the first tap is the gesture that may wake it.
  if (graph.state === 'suspended') {
    graph.resume().catch((err: unknown) => {
      console.warn('[turn-pipes] the browser kept the audio graph suspended', err)
    })
  }

  const buffer = buffers.get(name)
  if (!buffer) return SILENT

  const at = graph.currentTime + START_LOOKAHEAD_SECONDS
  const source = graph.createBufferSource()
  source.buffer = buffer
  source.loop = loop
  // Tap after tap would otherwise be the same click.
  if (name === 'turn') source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_SPREAD

  const level = graph.createGain()
  level.gain.value = GAIN[name]
  source.connect(level).connect(soundOutput(graph))
  source.start(at)

  if (name === 'success') {
    const fadeAt = at + SUCCESS_FADE_AFTER_S
    level.gain.setValueAtTime(GAIN[name], fadeAt)
    level.gain.linearRampToValueAtTime(0, fadeAt + SUCCESS_FADE_S)
  }

  const rings =
    name === 'success'
      ? SUCCESS_FADE_AFTER_S + SUCCESS_FADE_S
      : buffer.duration / source.playbackRate.value

  return {
    endsInS: loop ? Infinity : START_LOOKAHEAD_SECONDS + rings,
    stop(fadeS = FLOW_FADE_S) {
      const now = graph.currentTime
      level.gain.setValueAtTime(level.gain.value, now)
      level.gain.linearRampToValueAtTime(0, now + fadeS)
      source.stop(now + fadeS + 0.02)
    },
  }
}

export function playSound(name: SoundName): Playing {
  return play(name, false)
}

/** The water's rush, looping until [Playing.stop]. */
export function startFlow(): Playing {
  return play('flow', true)
}
