/**
 * One graph for the whole app, deliberately never closed. This is the whole point of playing
 * through Web Audio rather than through the `<audio>` element: the element opens an output stream
 * per playback and tears it down when the clip ends, and on Android that opening and closing costs
 * tens to hundreds of milliseconds — a window the 0.1s stage fits inside entirely, which is how it
 * came to lose its tail, or all of itself, on Firefox for Android. A context that stays alive keeps
 * the stream open across clips, so a short clip is scheduled into a pipeline that is already
 * running.
 */
let shared: AudioContext | null = null

export function audioGraph(): AudioContext | null {
  if (shared !== null) return shared
  if (typeof AudioContext === 'undefined') return null
  shared = new AudioContext()
  return shared
}

/**
 * Clips are scheduled this far ahead rather than at „now": `start()` with a past-or-present time
 * asks the graph to render samples it may already be mid-way through, and the first ones can be
 * dropped. A twentieth of a second is inaudible as a delay and puts the clip safely in the future.
 */
export const START_LOOKAHEAD_SECONDS = 0.05
