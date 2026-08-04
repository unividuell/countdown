import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getCountdown } from '@/api/countdown'
import type { Round } from '@/api/types'
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
  let lastAttemptMs = 0
  async function load(s: string) {
    const seq = ++loadSeq
    loaded = false
    lastAttemptMs = Date.now()
    try {
      const r = await getCountdown(s)
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
    else if (!loaded && nowMs.value - lastAttemptMs >= FAILED_LOAD_RETRY_MS) void load(slug.value)
  }

  onMounted(() => {
    if (slug.value) void load(slug.value)
    subscribeToClock()
  })
  onUnmounted(unsubscribeFromClock)
  watch(nowMs, tick)
  watch(
    () => slug.value,
    (s) => {
      if (s) void load(s)
      else {
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

/** Test-only: reset the module-level shared clock between test cases. */
export function _resetCountdownState(): void {
  if (timer) clearInterval(timer)
  timer = undefined
  subscribers = 0
  nowMs.value = Date.now()
  skewMs.value = 0
}
