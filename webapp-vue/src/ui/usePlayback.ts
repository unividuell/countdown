import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'

import { audioGraph, START_LOOKAHEAD_SECONDS } from '@/ui/audio'

/**
 * The one clip currently sounding, across every instance of this composable. Two players exist on
 * the reveal alone (the solution and whichever wrong guess was tapped), and hearing both at once
 * is never what anybody wanted — so starting one stops the other, here rather than in each caller.
 */
let sounding: { pause: () => void } | null = null

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
    console.warn('[playback] the audio graph could not take the clip; using the element', err)
    return null
  }
}

/**
 * One player, owned here. `restart()` plays from the start, `play(from)` from anywhere, `resume()`
 * from where a pause left off — the graph has no pause, so the offset is kept here. `extend()`
 * swaps a sounding clip for a longer one that begins with it, without a break.
 *
 * Position is sampled with requestAnimationFrame, from the graph's own clock while it plays: the
 * element's `timeupdate` (~4 Hz) is far too coarse for a bar over a 0.1s clip, and its
 * `currentTime` reports the decoder's progress rather than what has been heard.
 */
export function usePlayback(): {
  positionSeconds: Ref<number>
  playing: Ref<boolean>
  setSource: (url: string) => void
  play: (fromSeconds: number) => void
  restart: () => void
  resume: () => void
  pause: () => void
  stop: () => void
  extend: (url: string) => void
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
  /** Graph time at which the clip's own zero would have sounded — a start mid-clip lies before the real one. */
  let startedAt = 0
  /** The clip position the current start began at: the lookahead holds the bar here, not behind it. */
  let startOffset = 0
  let duration = 0
  /** Where a pause left off; `null` sends the next resume back to the start. */
  let heldAt: number | null = null
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

  /** What has been heard, by the graph's clock. The start through the lookahead, capped at the clip. */
  function elapsed(): number {
    const context = audioGraph()
    if (context === null) return positionSeconds.value
    return Math.min(Math.max(context.currentTime - startedAt, startOffset), duration)
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

  /** Played out by itself: the next resume starts over. */
  function ended(mine: number): void {
    if (mine !== generation) return
    finish(duration)
    heldAt = null
  }

  /** A node for `buffer`, wired to the speakers and to `ended`. */
  function source(context: AudioContext, buffer: AudioBuffer, mine: number): AudioBufferSourceNode {
    const next = context.createBufferSource()
    next.buffer = buffer
    next.connect(context.destination)
    next.onended = (): void => ended(mine)
    return next
  }

  async function playGraph(
    context: AudioContext,
    pending: Promise<AudioBuffer | null>,
    fromSeconds: number,
  ) {
    const mine = ++generation
    if (context.state === 'suspended') {
      // A gesture is what allows this; every path here comes from a tap, or from the answer to
      // one. Refused means no sound — the same silence the element's `play()` would give.
      await context.resume().catch((err) => {
        console.warn('[playback] the browser kept the audio graph suspended', err)
      })
    }
    const buffer = await pending
    if (mine !== generation) return
    if (buffer === null) {
      playElement(fromSeconds)
      return
    }
    silence()
    duration = buffer.duration
    startOffset = Math.min(fromSeconds, duration)
    const next = source(context, buffer, mine)
    const at = context.currentTime + START_LOOKAHEAD_SECONDS
    next.start(at, startOffset)
    startedAt = at - startOffset
    node = next
    claim()
    playing.value = true
    positionSeconds.value = startOffset
    raf = requestAnimationFrame(sample)
  }

  /**
   * The graph half of `extend`: the old node is told to stop at the very instant the new one starts,
   * at the spot the old one will have reached by then. One clock schedules both, so there is no gap
   * and no overlap. An old node that ran out while the longer clip decoded hands over at its end.
   */
  async function extendGraph(context: AudioContext, pending: Promise<AudioBuffer | null>) {
    const mine = ++generation
    const buffer = await pending
    if (mine !== generation) return
    if (buffer === null) {
      const from = elapsed()
      silence()
      playElement(from)
      return
    }
    const old = node
    const at = context.currentTime + START_LOOKAHEAD_SECONDS
    const offset = Math.min(Math.max(at - startedAt, startOffset), duration)
    if (old !== null) {
      old.onended = (): void => old.disconnect()
      old.stop(at)
    }
    duration = buffer.duration
    const next = source(context, buffer, mine)
    next.start(at, offset)
    startedAt = at - offset
    node = next
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
  element.addEventListener('ended', () => {
    elementStopped()
    heldAt = null
  })

  function startElement(): void {
    void element.play().catch((err) => {
      // Loud, because this is exactly what „sometimes you hear nothing" looks like from here.
      console.warn('[playback] the browser refused to play the clip', err)
    })
  }

  function playElement(fromSeconds: number): void {
    // Only seek where there is something to seek away from: a finished play leaves the element at
    // the end, every other path leaves it at zero, and a seek inside a clip this short is its own
    // risk.
    if (element.currentTime !== fromSeconds) element.currentTime = fromSeconds
    startElement()
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
    heldAt = null
    const context = audioGraph()
    decoded = context === null ? null : decode(context, url)
  }

  function play(fromSeconds: number): void {
    if (disposed) return
    heldAt = null
    const context = audioGraph()
    if (context === null || decoded === null) {
      playElement(fromSeconds)
      return
    }
    void playGraph(context, decoded, fromSeconds)
  }

  function restart(): void {
    play(0)
  }

  function resume(): void {
    play(heldAt ?? 0)
  }

  /**
   * A longer clip that begins with the sounding one: playback runs on into it from the spot it
   * reached. Nothing sounding, it is only the new source — what starts it is the caller's call.
   */
  function extend(url: string): void {
    if (disposed) return
    if (!playing.value) {
      setSource(url)
      return
    }
    const context = audioGraph()
    decoded = context === null ? null : decode(context, url)
    if (node === null || context === null || decoded === null) {
      // The element is what sounds: reloading it drops the position, so it is carried over by hand.
      const at = element.currentTime
      element.src = url
      element.load()
      element.currentTime = at
      startElement()
      return
    }
    element.src = url
    element.load()
    void extendGraph(context, decoded)
  }

  function pause(): void {
    // Bumped whether or not anything is sounding yet: `playGraph` waits on a resume and a decode
    // before it starts, and a pause tapped inside that window would otherwise be answered by the
    // clip starting. That window is real — the reveal's first tap waits on a fetch too.
    generation++
    if (node !== null) {
      heldAt = elapsed()
      finish(heldAt)
      return
    }
    if (!element.paused) heldAt = element.currentTime
    playing.value = false
    element.pause()
  }

  /** Pause, and forget where: the bar empties and the next play starts over. */
  function stop(): void {
    pause()
    heldAt = null
    positionSeconds.value = 0
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

  return {
    positionSeconds,
    playing,
    setSource,
    play,
    restart,
    resume,
    pause,
    stop,
    extend,
    dispose,
  }
}
