<script setup lang="ts">
import { computed } from 'vue'
import { barFraction, stageSteps } from './stagebar'

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
const steps = computed(() => stageSteps(props.durations, props.totalSeconds, props.unlockedSeconds))
</script>

<template>
  <div>
    <div
      class="relative h-5 w-full overflow-hidden rounded-full bg-neutral-200"
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
      <!-- The boundaries are gaps, not strokes: the card's own ground cutting through, so the bar
           reads as separate rungs instead of one bar with tick marks on it. The last boundary is
           the bar's end and needs none. -->
      <div
        v-for="step in steps.filter((s) => !s.last)"
        :key="step.label"
        class="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white"
        data-test="stage-gap"
        :style="{ left: `${step.fraction * 100}%` }"
      />
    </div>
    <!-- The ladder in writing, each rung under its own gap. -->
    <div class="relative mt-1 h-4" data-test="stage-steps">
      <span
        v-for="step in steps"
        :key="step.label"
        class="absolute text-[10px] leading-4 tabular-nums"
        :class="[
          step.last ? '-translate-x-full' : '-translate-x-1/2',
          step.current
            ? 'font-medium text-amber-600'
            : step.open
              ? 'text-neutral-500'
              : 'text-neutral-300',
        ]"
        :style="{ left: `${step.fraction * 100}%` }"
      >
        {{ step.label }}
      </span>
    </div>
  </div>
</template>
