<script setup lang="ts">
import { computed, ref } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'

const props = defineProps<{
  days: string
  hours: string
  minutes: string
  seconds: string
}>()

// Literal class names: Tailwind scans the source, so an interpolated w-[..%] is never generated.
const heroWidth = computed(() => {
  if (props.days.length <= 2) return 'w-[72%]'
  if (props.days.length === 3) return 'w-[92%]'
  return 'w-full'
})
const heroLabel = computed(() => {
  const n = Number(props.days)
  return `${n} ${n === 1 ? 'Tag' : 'Tage'} bis zum Start`
})
const time = computed(() => `${props.hours}:${props.minutes}:${props.seconds}`)

// Each board owns its own switch-on timeline, and since a board relights whenever its geometry
// changes, the two are no longer in step: the hero relights when the day count loses a digit while
// the strip stays legible throughout. So each label group follows the phase of its own board rather
// than a single flag for the card.
const heroLive = ref(false)
const stripLive = ref(false)
</script>

<template>
  <div
    data-test="countdown-card"
    class="flex aspect-square w-full flex-col items-center justify-between rounded-xl bg-stone-900 py-4"
  >
    <!-- w-full, not shrink-to-fit: inside an items-center column this block would take its width
         from its widest child, and a widthless <svg viewBox> contributes only its 300px CSS
         default — the hero's w-[72%] would then be 216px on every viewport. -->
    <div class="flex w-full flex-1 flex-col items-center justify-center gap-2.5">
      <FlipDotBoard
        data-test="countdown-hero"
        :class="heroWidth"
        :text="days"
        :label="heroLabel"
        @phase="heroLive = $event === 'live'"
      />
      <p
        data-test="countdown-label-days"
        class="font-mono text-[11px] tracking-[0.14em] text-stone-400 transition-opacity duration-300"
        :class="heroLive ? 'opacity-100' : 'opacity-0'"
      >
        TAGE
      </p>
    </div>
    <div class="w-[94%]">
      <FlipDotBoard
        data-test="countdown-strip"
        :text="time"
        :label="`Verbleibende Zeit ${time}`"
        @phase="stripLive = $event === 'live'"
      />
      <FlipDotLegend
        data-test="countdown-label-time"
        class="mt-2"
        :text="time"
        :labels="['STD', 'MIN', 'SEK']"
        :visible="stripLive"
      />
    </div>
  </div>
</template>
