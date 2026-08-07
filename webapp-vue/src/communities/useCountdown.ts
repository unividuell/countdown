import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getCountdown } from '@/api/countdown'
import type { CountdownResponse, Round } from '@/api/types'
import { boundaryAction, computeView, nextBaseUnitConfig } from '@/communities/countdown'
import type { BaseUnitConfig } from '@/communities/countdown'

// A load that never succeeded leaves round === null, and boundaryAction() answers 'none' forever
// for a null round — so without this the second-timer would never refetch. 10s is slow enough not
// to hammer a backend that is down, short enough that the fallback card is not a blank square for
// a noticeable while.
const FAILED_LOAD_RETRY_MS = 10_000

// One clock for every consumer on the page: the header widget and the fallback card are separate
// instances, and two intervals started at different moments never resynchronise — their seconds
// drift up to a full tick apart while showing the same instant. The skew is shared for the same
// reason: it describes the one server's clock, not the consumer's, so any successful load corrects
// it for everybody.
const nowMs = ref(Date.now())
const skewMs = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
let subscribers = 0

function subscribeToClock(): void {
  subscribers += 1
  if (subscribers > 1) return
  nowMs.value = Date.now()
  timer = setInterval(() => (nowMs.value = Date.now()), 1000)
}

function unsubscribeFromClock(): void {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers > 0) return
  if (timer) clearInterval(timer)
  timer = undefined
}

// One request for one slug, for the same reason the clock is shared: the header and the fallback card
// mount in the same tick on a community page and each asked for the same countdown — two XHRs a
// millisecond apart. Boundary refetches and failed-load retries fire from the shared clock, so those
// coincide too. A load still in flight is therefore joined instead of repeated.
//
// Deliberately only in-flight, not a cache: a consumer arriving later gets a fresh request rather
// than a response that may have gone stale. And deliberately not shared *state* — each instance keeps
// its own round data and its own base-unit config, which is what stops the header's unit cycle from
// rewriting the card's readout. Sharing the state would mean a refcounted per-slug store with its own
// eviction and slug-change rules; the duplicate request does not cost enough to buy that.
const inFlight = new Map<string, Promise<CountdownResponse>>()

function fetchCountdownOnce(slug: string): Promise<CountdownResponse> {
  const pending = inFlight.get(slug)
  if (pending) return pending
  const request = getCountdown(slug).finally(() => inFlight.delete(slug))
  inFlight.set(slug, request)
  return request
}

export function useCountdown(slug: Ref<string | null | undefined>) {
  const round = ref<Round | null>(null)
  const nextRound = ref<Round | null>(null)
  const startsAt = ref<string | null>(null)
  const zone = ref('UTC')
  const cfg = reactive<BaseUnitConfig>({ months: false, weeks: false, days: true })

  let loadSeq = 0
  // Tracked, rather than inferring "never loaded" from round === null: the backend legitimately
  // answers round: null for a community without a startsAt, and that must not be retried at all.
  let loaded = false
  // Recorded synchronously by load(), before its first await, which is what keeps a tick arriving in
  // the same frame as the mount from reading 0 as "attempted long ago". The retry branch tests for 0
  // anyway, so the invariant survives that assignment moving.
  let lastAttemptMs = 0
  async function load(s: string) {
    const seq = ++loadSeq
    loaded = false
    lastAttemptMs = Date.now()
    try {
      const r = await fetchCountdownOnce(s)
      if (seq !== loadSeq) return // a newer load superseded this one
      round.value = r.round
      nextRound.value = r.nextRound
      startsAt.value = r.startsAt
      zone.value = r.startsAtTimezone
      skewMs.value = Date.parse(r.serverNow) - Date.now()
      loaded = true
    } catch {
      // best-effort: keep last-known state; tick() retries below
    }
  }

  function tick() {
    const corr = nowMs.value + skewMs.value
    const action = boundaryAction(round.value, nextRound.value, corr)
    if (action === 'shift') {
      round.value = nextRound.value
      nextRound.value = null
    }
    if (!slug.value) return
    if (action !== 'none') void load(slug.value)
    else if (!loaded && lastAttemptMs !== 0 && nowMs.value - lastAttemptMs >= FAILED_LOAD_RETRY_MS)
      void load(slug.value)
  }

  // Per instance, on top of the module refcount: a community without a startsAt has nothing to tick
  // for, and this instance must release exactly the one subscription it holds — no more, no less,
  // whether the slug appeared late or vanished again.
  let subscribed = false
  function subscribe(): void {
    if (subscribed) return
    subscribed = true
    subscribeToClock()
  }
  function unsubscribe(): void {
    if (!subscribed) return
    subscribed = false
    unsubscribeFromClock()
  }

  onMounted(() => {
    if (!slug.value) return
    void load(slug.value)
    subscribe()
  })
  onUnmounted(unsubscribe)
  watch(nowMs, tick)
  watch(
    () => slug.value,
    (s) => {
      if (s) {
        void load(s)
        subscribe()
      } else {
        unsubscribe()
        round.value = null
        nextRound.value = null
        startsAt.value = null
      }
    },
  )

  const view = computed(() =>
    computeView(round.value, startsAt.value, zone.value, nowMs.value + skewMs.value, cfg),
  )

  function cycleBaseUnit() {
    Object.assign(cfg, nextBaseUnitConfig(cfg))
  }

  return { view, cycleBaseUnit }
}

/**
 * Test-only: reset the module-level shared clock between test cases.
 *
 * Unmount every consumer before calling this. Resetting zeroes the subscriber count without
 * unmounting anyone, so a consumer still alive across the reset would later release a subscription
 * it no longer holds — and clear an interval a newer consumer started. `enableAutoUnmount(afterEach)`
 * is what guarantees the ordering; every spec that mounts a consumer uses it.
 */
export function _resetCountdownState(): void {
  inFlight.clear()
  if (timer) clearInterval(timer)
  timer = undefined
  subscribers = 0
  nowMs.value = Date.now()
  skewMs.value = 0
}
