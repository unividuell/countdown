/**
 * Recorded clips for decoration sound, as the synthesised voices have `woodKnock`: decoded once,
 * off the app's graph, then played wherever a game asks. A play function asks `soundGraph()` for
 * the graph and `buffer(url)` for the clip; either missing, it stays silent.
 *
 *   preload (mount, muted or not) ──▶ decodingGraph ──▶ buffers
 *   play ──▶ soundGraph() ──▶ buffer(url) ──▶ soundOutput
 */
import { decodingGraph } from './audio'

export interface RecordedSounds {
  /** Fetches and decodes every clip once, muted or not: the decoder has no output. */
  preload(): void
  /** The decoded clip; `undefined` while decoding or when it failed. */
  buffer(url: string): AudioBuffer | undefined
}

/** One set of clips; `label` names the game in the warning a failed decode leaves. */
export function recordedSounds(urls: readonly string[], label: string): RecordedSounds {
  const buffers = new Map<string, AudioBuffer | null>()

  return {
    preload() {
      const decoder = decodingGraph()
      if (!decoder) return

      for (const url of urls) {
        if (buffers.has(url)) continue
        buffers.set(url, null)
        void fetch(url)
          .then((response) => response.arrayBuffer())
          .then((data) => decoder.decodeAudioData(data))
          .then(
            (buffer) => buffers.set(url, buffer),
            (err: unknown) => console.warn(`[${label}] a sound did not decode`, url, err),
          )
      }
    },

    buffer(url) {
      return buffers.get(url) ?? undefined
    },
  }
}
