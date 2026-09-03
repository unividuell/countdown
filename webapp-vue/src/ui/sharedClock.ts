import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ComputedRef } from 'vue'

/**
 * One clock for every consumer on the page: the header countdown, the no-game fallback card and a
 * round's own header band are separate instances, and two intervals started at different moments
 * never resynchronise — their seconds drift up to a full tick apart while showing the same instant.
 *
 * The skew is shared for the same reason: it describes the one server's clock, not the consumer's,
 * so any successful countdown load corrects it for everybody — including consumers that never talk
 * to that endpoint themselves.
 *
 * It lives under `ui/` rather than beside `useCountdown`, its first consumer, because `ui/` is what
 * both consumers already depend on (`FlipDotBoard`) and the dependency has to point one way.
 */
export const nowMs = ref(Date.now())
export const skewMs = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let subscribers = 0

export function subscribeToClock(): void {
  subscribers += 1
  if (subscribers > 1) return
  nowMs.value = Date.now()
  timer = setInterval(() => (nowMs.value = Date.now()), 1000)
}

export function unsubscribeFromClock(): void {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers > 0) return
  if (timer) clearInterval(timer)
  timer = undefined
}

/**
 * The corrected instant, for a consumer whose whole interest in the clock is „what time is it on
 * the server right now“ — no round data, no fetch, no base unit. Subscribes for exactly as long as
 * the component lives.
 *
 * A consumer that also needs the raw tick (to decide *when* to act rather than *what* to show)
 * takes `nowMs` and `skewMs` directly, the way `useCountdown` does.
 */
export function useSharedNow(): ComputedRef<number> {
  onMounted(subscribeToClock)
  onUnmounted(unsubscribeFromClock)
  return computed(() => nowMs.value + skewMs.value)
}

/**
 * Test-only: reset the shared clock between test cases.
 *
 * Unmount every consumer before calling this. Resetting zeroes the subscriber count without
 * unmounting anyone, so a consumer still alive across the reset would later release a subscription
 * it no longer holds — and clear an interval a newer consumer started. `enableAutoUnmount(afterEach)`
 * is what guarantees the ordering; every spec that mounts a consumer uses it.
 */
export function _resetSharedClock(): void {
  if (timer) clearInterval(timer)
  timer = undefined
  subscribers = 0
  nowMs.value = Date.now()
  skewMs.value = 0
}
