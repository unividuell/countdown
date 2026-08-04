<script setup lang="ts">
import { computed } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'

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
const heroLabel = computed(() => `${Number(props.days)} Tage bis zum Start`)
const time = computed(() => `${props.hours}:${props.minutes}:${props.seconds}`)
</script>

<template>
  <div
    data-test="countdown-card"
    class="flex aspect-square w-full flex-col items-center justify-between rounded-xl bg-stone-900 px-2 py-4"
  >
    <div class="flex flex-1 flex-col items-center justify-center gap-2.5">
      <FlipDotBoard
        data-test="countdown-hero"
        :class="heroWidth"
        :text="days"
        :label="heroLabel"
      />
      <p class="font-mono text-[11px] tracking-[0.14em] text-stone-500">TAGE</p>
    </div>
    <div class="w-[94%]">
      <FlipDotBoard
        data-test="countdown-strip"
        :text="time"
        :label="`Verbleibende Zeit ${time}`"
      />
      <div class="relative mt-2 h-4 font-mono text-[11px] tracking-[0.14em] text-stone-500">
        <span class="absolute left-[11.5%] -translate-x-1/2">STD</span>
        <span class="absolute left-1/2 -translate-x-1/2">MIN</span>
        <span class="absolute left-[88.5%] -translate-x-1/2">SEK</span>
      </div>
    </div>
  </div>
</template>
