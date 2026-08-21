<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { barFraction, scaleEndLabel, stageSteps } from './stagebar'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  durations: number[]
  totalSeconds: number
  unlockedSeconds: number
  positionSeconds: number
}>()

/**
 * The unlocked fill grows into its new width rather than jumping there: unlocking a stage is the
 * one moment this bar is about anything, and the eye follows a movement where it would miss a
 * repaint. A `width` transition does it, so every later change animates for free — including the
 * very first, which needs the bar to have been painted at zero once. Hence [grown]: false for a
 * frame, then true. The same two frames `HueWheelReveal` needs, and for the same reason — Firefox
 * only transitions off a style it has already resolved.
 */
const grown = ref(false)
let frame = 0

onMounted(() => {
  if (prefersReducedMotion() || inBackground() || typeof requestAnimationFrame !== 'function') {
    grown.value = true
    return
  }
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      grown.value = true
    })
  })
})
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

const unlockedPct = computed(() =>
  grown.value ? barFraction(props.unlockedSeconds, props.totalSeconds) * 100 : 0,
)
const playheadPct = computed(() =>
  Math.min(barFraction(props.positionSeconds, props.totalSeconds) * 100, unlockedPct.value),
)
const steps = computed(() => stageSteps(props.durations, props.totalSeconds, props.unlockedSeconds))
const endLabel = computed(() => scaleEndLabel(props.durations, props.totalSeconds))
</script>

<template>
  <div>
    <div
      class="relative h-5 w-full overflow-hidden rounded-full bg-neutral-200"
      data-test="stage-bar"
    >
      <div
        class="absolute inset-y-0 left-0 bg-amber-200 transition-[width] duration-500 ease-out motion-reduce:transition-none"
        data-test="stage-unlocked"
        :style="{ width: `${unlockedPct}%` }"
      />
      <div
        class="absolute inset-y-0 left-0 bg-amber-400"
        data-test="stage-playhead"
        :style="{ width: `${playheadPct}%` }"
      />
      <!-- The boundaries are gaps, not strokes: the card's own ground cutting through, so the bar
           reads as separate rungs instead of one bar with tick marks on it. A boundary that falls
           on the bar's right edge needs none — there the bar simply stops. -->
      <div
        v-for="step in steps.filter((s) => !s.atEnd)"
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
          step.atEnd ? '-translate-x-full' : '-translate-x-1/2',
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
      <!-- Where the ladder stops short of the bar, the scale itself gets the last word. -->
      <span
        v-if="endLabel"
        class="absolute -translate-x-full text-[10px] leading-4 tabular-nums text-neutral-500"
        data-test="stage-scale-end"
        :style="{ left: '100%' }"
      >
        {{ endLabel }}
      </span>
    </div>
  </div>
</template>
