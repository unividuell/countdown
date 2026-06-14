import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getCountdown } from '@/api/countdown'
import type { Round } from '@/api/types'
import { boundaryAction, computeView, nextBaseUnitConfig } from '@/communities/countdown'
import type { BaseUnitConfig } from '@/communities/countdown'

export function useCountdown(slug: Ref<string | null | undefined>) {
  const round = ref<Round | null>(null)
  const nextRound = ref<Round | null>(null)
  const startsAt = ref<string | null>(null)
  const zone = ref('UTC')
  const skewMs = ref(0)
  const nowMs = ref(Date.now())
  const cfg = reactive<BaseUnitConfig>({ months: false, weeks: false, days: true })
  let timer: ReturnType<typeof setInterval> | undefined

  let loadSeq = 0
  async function load(s: string) {
    const seq = ++loadSeq
    try {
      const r = await getCountdown(s)
      if (seq !== loadSeq) return // a newer load superseded this one
      round.value = r.round
      nextRound.value = r.nextRound
      startsAt.value = r.startsAt
      zone.value = r.startsAtTimezone
      skewMs.value = Date.parse(r.serverNow) - Date.now()
    } catch {
      // best-effort header widget: keep last-known state, retry at the next boundary tick
    }
  }

  function tick() {
    nowMs.value = Date.now()
    const corr = nowMs.value + skewMs.value
    const action = boundaryAction(round.value, nextRound.value, corr)
    if (action === 'shift') {
      round.value = nextRound.value
      nextRound.value = null
    }
    if (action !== 'none' && slug.value) void load(slug.value)
  }

  onMounted(() => {
    if (slug.value) void load(slug.value)
    timer = setInterval(tick, 1000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })
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
