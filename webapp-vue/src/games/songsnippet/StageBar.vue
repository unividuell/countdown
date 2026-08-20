<script setup lang="ts">
import { computed } from 'vue'
import { barFraction, stageMarks } from './stagebar'

const props = defineProps<{
  durations: number[]
  totalSeconds: number
  unlockedSeconds: number
  positionSeconds: number
}>()

const unlockedPct = computed(() => barFraction(props.unlockedSeconds, props.totalSeconds) * 100)
const playheadPct = computed(() =>
  Math.min(barFraction(props.positionSeconds, props.totalSeconds) * 100, unlockedPct.value),
)
const marks = computed(() => stageMarks(props.durations, props.totalSeconds))
</script>

<template>
  <div
    class="relative h-3 w-full overflow-hidden rounded-full bg-neutral-200"
    data-test="stage-bar"
  >
    <div
      class="absolute inset-y-0 left-0 bg-amber-200"
      data-test="stage-unlocked"
      :style="{ width: `${unlockedPct}%` }"
    />
    <div
      class="absolute inset-y-0 left-0 bg-amber-400"
      data-test="stage-playhead"
      :style="{ width: `${playheadPct}%` }"
    />
    <div
      v-for="(mark, i) in marks"
      :key="i"
      class="absolute inset-y-0 w-px bg-neutral-400"
      :style="{ left: `${mark * 100}%` }"
    />
  </div>
</template>
