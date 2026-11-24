<script setup lang="ts">
import { computed, ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'

const DAY_S = 24 * 60 * 60

const days = ref(58)
const left = ref(14 * 3600 + 33 * 60 + 19)
const running = ref(true)

// One second per tick. At zero the round turns: one day fewer, a full day left — the moment the
// hero loses a digit and relights. The last round stops at zero.
useIntervalFn(() => {
  if (!running.value) return
  if (left.value > 0) left.value--
  else if (days.value > 0) {
    days.value--
    left.value = DAY_S - 1
  } else running.value = false
}, 1000)

const pad2 = (n: number) => String(n).padStart(2, '0')

// Same padding as `RoundFallback`: the day count is at least two digits.
const daysText = computed(() => pad2(days.value))
const hours = computed(() => pad2(Math.floor(left.value / 3600)))
const minutes = computed(() => pad2(Math.floor((left.value % 3600) / 60)))
const seconds = computed(() => pad2(left.value % 60))

const time = computed(() => `${hours.value}:${minutes.value}:${seconds.value}`)

function setDays(raw: string): void {
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 0) days.value = Math.min(n, 9999)
}

// `<input type="time" step="1">` gives "HH:MM:SS", or "HH:MM" when the seconds are zero.
function setTime(raw: string): void {
  const [h, m, s] = raw.split(':').map((part) => Number.parseInt(part, 10))
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return
  left.value = h * 3600 + m * 60 + (s === undefined || Number.isNaN(s) ? 0 : s)
}
</script>

<template>
  <CountdownCard :days="daysText" :hours="hours" :minutes="minutes" :seconds="seconds" />

  <section class="mt-8 space-y-3 border-t border-outline pt-4">
    <div class="flex gap-3">
      <label class="flex flex-1 flex-col gap-1 text-sm">
        Tage
        <input
          data-test="card-lab-days"
          type="number"
          min="0"
          max="9999"
          inputmode="numeric"
          :value="days"
          class="h-11 rounded-md border border-outline bg-surface px-3"
          @input="setDays(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="flex flex-1 flex-col gap-1 text-sm">
        Restzeit
        <input
          data-test="card-lab-time"
          type="time"
          step="1"
          :value="time"
          class="h-11 rounded-md border border-outline bg-surface px-3"
          @input="setTime(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <label class="flex h-11 w-fit cursor-pointer items-center gap-3 text-sm">
      <input v-model="running" data-test="card-lab-running" type="checkbox" />
      Läuft
    </label>

    <button
      data-test="card-lab-near-boundary"
      type="button"
      class="flex h-11 w-fit cursor-pointer items-center rounded-md border border-outline px-3 text-sm hover:bg-surface-container"
      @click="left = 3"
    >
      3 s vor Rundenwechsel
    </button>
  </section>
</template>
