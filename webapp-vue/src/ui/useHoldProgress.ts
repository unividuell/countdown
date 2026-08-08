import { onScopeDispose, readonly, ref, type Ref } from 'vue'
import { useEventListener } from '@vueuse/core'

/** How much faster the ring runs back than it filled. Releasing should read as undoing. */
const REWIND_FACTOR = 2

/**
 * How long a hold-to-confirm gesture takes by default, absent an opinion from the caller.
 *
 * The original held for 2000 ms, which reads long on the second attempt. This is the number to
 * turn while playing in the lab — it is the whole reason the lab exists.
 */
export const DEFAULT_HOLD_MS = 1200

export interface HoldProgress {
  /** 0 … 1. Drives the ring; 1 means the hold completed. */
  progress: Readonly<Ref<number>>
  holding: Readonly<Ref<boolean>>
  start: () => void
  cancel: () => void
}

/**
 * Hold-to-confirm, as a value rather than an effect: a progress number that fills while held and
 * runs back when released, and one call to [onComplete] when it reaches the top.
 *
 * Driven by `requestAnimationFrame` rather than a CSS transition because both the rewind and the
 * completion callback have to be steered from here anyway — and because progress is information,
 * so it stays visible under `prefers-reduced-motion` where a decorative transition would not.
 */
export function useHoldProgress(durationMs: number, onComplete: () => void): HoldProgress {
  const progress = ref(0)
  const holding = ref(false)
  let frame = 0
  let last = -1

  function stop(): void {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    last = -1
  }

  function step(now: number): void {
    if (last < 0) {
      // First frame: establish the clock, advance nothing. Its timestamp is arbitrary.
      last = now
      frame = requestAnimationFrame(step)
      return
    }
    const delta = (now - last) / durationMs
    last = now

    if (holding.value) {
      progress.value = Math.min(1, progress.value + delta)
      if (progress.value >= 1) {
        stop()
        holding.value = false
        onComplete()
        return
      }
    } else {
      progress.value = Math.max(0, progress.value - delta * REWIND_FACTOR)
      if (progress.value <= 0) {
        stop()
        return
      }
    }
    frame = requestAnimationFrame(step)
  }

  function run(): void {
    if (frame) return
    frame = requestAnimationFrame(step)
  }

  function start(): void {
    // A completed hold left the ring full; pressing again is a new attempt, not a continuation.
    if (progress.value >= 1) progress.value = 0
    holding.value = true
    run()
  }

  /** Release: the ring runs back down rather than snapping away. */
  function cancel(): void {
    if (!holding.value) return
    holding.value = false
    run()
  }

  /**
   * Leaving the tab abandons the hold outright — no rewind, no completion.
   *
   * `requestAnimationFrame` does not run in a background tab, so a hold left standing would resume
   * from a stale timestamp and could finish for someone who is not looking. That is exactly the
   * accidental confirmation the keyboard gesture was designed to rule out.
   */
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden) return
    stop()
    holding.value = false
    progress.value = 0
  })

  onScopeDispose(stop)

  return { progress: readonly(progress), holding: readonly(holding), start, cancel }
}
