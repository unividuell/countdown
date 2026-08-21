import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

/**
 * The one clip currently sounding, across every instance of this composable. Two players exist on
 * the reveal alone (the solution and whichever wrong guess was tapped), and hearing both at once
 * is never what anybody wanted — so starting one stops the other, here rather than in each caller.
 */
let sounding: { pause: () => void } | null = null

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

function graph(): AudioContext | null {
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
const START_LOOKAHEAD_SECONDS = 0.05

/**
 * Reading the fetched bytes into the graph. `null` — never a rejection — where the graph will not
 * take them: a clip the decoder refuses is not a lost clip, since the element still knows how to
 * play it.
 */
async function decode(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url)
    return await context.decodeAudioData(await response.arrayBuffer())
  } catch (err) {
    console.warn('[song-snippet] the audio graph could not take the clip; using the element', err)
    return null
  }
}

/**
 * One player, owned here. `restart()` is the play button's whole semantics: always from the start,
 * never a toggle — pausing is a separate, smaller control, and nothing anywhere resumes, which is
 * what lets the graph get away with knowing no offsets.
 *
 * Position is sampled with requestAnimationFrame, from the graph's own clock while it plays: the
 * element's `timeupdate` (~4 Hz) is far too coarse for a bar over a 0.1s clip, and its
 * `currentTime` reports the decoder's progress rather than what has been heard.
 */
export function usePlayback(): {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: (url: string) => void
  restart: () => void
  pause: () => void
  dispose: () => void
} {
  const positionSeconds = ref(0)
  const playing = ref(false)

  /**
   * The fallback engine, kept ready for browsers without an `AudioContext` and for clips the
   * decoder rejects. It carries the source either way, so falling back costs no extra load.
   */
  const element = new Audio()
  element.preload = 'auto'

  let decoded: Promise<AudioBuffer | null> | null = null
  let node: AudioBufferSourceNode | null = null
  let startedAt = 0
  let duration = 0
  let raf = 0
  /**
   * Only the newest source and the newest start may act. Every path that ends a playback bumps it,
   * which makes a decode still in flight — and the `onended` of a node already stopped — inert.
   */
  let generation = 0
  /**
   * Disposal is final. A component that goes away while one of its own fetches is still in flight
   * would otherwise come back through it — `setSource` + `restart` from a callback whose component
   * no longer exists starts a clip on the shared graph that nothing owns and no transport can
   * reach, which is exactly how a snippet went on sounding into the reveal with its pause button
   * unable to touch it. Nothing here revives; the callback lands on a player that is done.
   */
  let disposed = false

  const self = { pause: (): void => pause() }

  function claim(): void {
    if (sounding !== null && sounding !== self) sounding.pause()
    sounding = self
  }
  function release(): void {
    if (sounding === self) sounding = null
  }

  /** What has been heard, by the graph's clock. Zero through the lookahead, capped at the clip. */
  function elapsed(): number {
    if (shared === null) return positionSeconds.value
    return Math.min(Math.max(shared.currentTime - startedAt, 0), duration)
  }

  const sample = (): void => {
    positionSeconds.value = elapsed()
    raf = requestAnimationFrame(sample)
  }

  /** Takes the current node out of the graph without touching what the refs say. */
  function silence(): void {
    if (node !== null) {
      node.onended = null
      node.stop()
      node.disconnect()
      node = null
    }
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function finish(position: number): void {
    silence()
    playing.value = false
    release()
    positionSeconds.value = position
  }

  async function playGraph(context: AudioContext, pending: Promise<AudioBuffer | null>) {
    const mine = ++generation
    if (context.state === 'suspended') {
      // A gesture is what allows this; every path here comes from a tap, or from the answer to
      // one. Refused means no sound — the same silence the element's `play()` would give.
      await context.resume().catch((err) => {
        console.warn('[song-snippet] the browser kept the audio graph suspended', err)
      })
    }
    const buffer = await pending
    if (mine !== generation) return
    if (buffer === null) {
      playElement()
      return
    }
    silence()
    duration = buffer.duration
    const next = context.createBufferSource()
    next.buffer = buffer
    next.connect(context.destination)
    next.onended = (): void => {
      if (mine === generation) finish(duration)
    }
    startedAt = context.currentTime + START_LOOKAHEAD_SECONDS
    next.start(startedAt)
    node = next
    claim()
    playing.value = true
    positionSeconds.value = 0
    raf = requestAnimationFrame(sample)
  }

  const sampleElement = (): void => {
    positionSeconds.value = element.currentTime
    if (!element.paused) raf = requestAnimationFrame(sampleElement)
  }

  element.addEventListener('play', () => {
    claim()
    playing.value = true
    raf = requestAnimationFrame(sampleElement)
  })
  const elementStopped = (): void => {
    release()
    playing.value = false
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    positionSeconds.value = element.currentTime
  }
  element.addEventListener('pause', elementStopped)
  element.addEventListener('ended', elementStopped)

  function playElement(): void {
    // Only seek where there is something to seek away from: a finished play leaves the element at
    // the end, every other path leaves it at zero, and a seek inside a clip this short is its own
    // risk.
    if (element.currentTime !== 0) element.currentTime = 0
    void element.play().catch((err) => {
      // Loud, because this is exactly what „sometimes you hear nothing" looks like from here.
      console.warn('[song-snippet] the browser refused to play the clip', err)
    })
  }

  function setSource(url: string): void {
    if (disposed) return
    generation++
    silence()
    element.pause()
    element.src = url
    element.load()
    playing.value = false
    positionSeconds.value = 0
    duration = 0
    const context = graph()
    decoded = context === null ? null : decode(context, url)
  }

  function restart(): void {
    if (disposed) return
    const context = graph()
    if (context === null || decoded === null) {
      playElement()
      return
    }
    void playGraph(context, decoded)
  }

  function pause(): void {
    if (node !== null) {
      generation++
      finish(elapsed())
      return
    }
    element.pause()
  }

  function dispose(): void {
    disposed = true
    generation++
    finish(positionSeconds.value)
    element.pause()
    element.removeAttribute('src')
    element.load()
    decoded = null
  }
  onUnmounted(dispose)

  return { positionSeconds, playing, setSource, restart, pause, dispose }
}
