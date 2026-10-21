<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { barFraction, ladderShare, scaleEndLabel, stageSteps, tailFraction } from './stagebar'
import { RESULTS_DELAY_MS, SOLUTION_DELAY_MS, isStill } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'

const props = defineProps<{
  durations: number[]
  totalSeconds: number
  unlockedSeconds: number
  positionSeconds: number
  /**
   * A remark for the room above the bar — „Falsch — nächste Stufe frei." and nothing else so far.
   * It belongs here rather than in the board because the bar is what it is about, and because the
   * room it needs is height only the bar can reserve without the two screens drifting apart.
   * Omitted by the reveal, which has no verdicts.
   */
  notice?: string | null
  /**
   * A live reveal: the bar arrives at the board's geometry, so the crossfade moves nothing, then
   * makes room for the extra 15s on the shared beats. Omitted by the board, false on a reload.
   */
  animate?: boolean
}>()

const longest = computed(() => props.durations[props.durations.length - 1] ?? 0)
/** The ladder's share of the bar in percent: 100 on the board, ~71 on the reveal's 30s scale. */
const sharePct = computed(() => ladderShare(props.durations, props.totalSeconds) * 100)
const hasTail = computed(() => sharePct.value < 100)

/**
 * The reveal's morph, inside the solution beat: the ladder shrinks to its share, then the tail
 * grows into the room it left — each half the beat, so the bar is whole when the results land.
 */
const MORPH_MS = (RESULTS_DELAY_MS - SOLUTION_DELAY_MS) / 2
const still = isStill(props.animate === true)
const { shown: morphed } = useRevealArming(still)

function morph(property: string, delayMs: number, easing: string) {
  return still
    ? {}
    : {
        transitionProperty: property,
        transitionDuration: `${MORPH_MS}ms`,
        transitionDelay: `${delayMs}ms`,
        transitionTimingFunction: easing,
      }
}

const ladderStyle = computed(() => ({
  width: `${morphed.value ? sharePct.value : 100}%`,
  ...morph('width', SOLUTION_DELAY_MS, 'ease-in-out'),
}))

/** Half the bar's height (`h-5`): the ladder's round end has its centre this far in from its edge. */
const CAP_PX = 10
/**
 * The tail's hollow left edge: the circle of the ladder's round end, grown by the gap between the
 * two. The pair reads `) )` — the extra 15s hug the ladder's end without touching it.
 */
const CUT_PX = CAP_PX + 4
const TAIL_MASK = `radial-gradient(circle at 0 50%, transparent ${CUT_PX - 0.5}px, #000 ${CUT_PX}px)`

/** Starts under the centre of the ladder's end, so the hollow edge can hug it. */
const tailStyle = computed(() => ({
  left: `calc(${sharePct.value}% - ${CAP_PX}px)`,
  width: morphed.value ? `calc(${100 - sharePct.value}% + ${CAP_PX}px)` : '0px',
  mask: TAIL_MASK,
  WebkitMask: TAIL_MASK,
  ...morph('width', SOLUTION_DELAY_MS + MORPH_MS, 'ease-out'),
}))

/** The scale's end label belongs to the tail, so it arrives with it. */
const endLabelStyle = computed(() => ({
  left: '100%',
  opacity: morphed.value ? 1 : 0,
  ...morph('opacity', SOLUTION_DELAY_MS + MORPH_MS, 'ease-out'),
}))

/** Measured from the hollow edge's deepest point, so its two horns fill the moment 15s pass. */
const tailPlayheadWidth = computed(() => {
  const run = tailFraction(props.positionSeconds, props.durations, props.totalSeconds)
  // CUT_PX + run · (100% − CUT_PX), multiplied out into one plain sum.
  return run > 0 ? `calc(${run * 100}% + ${(1 - run) * CUT_PX}px)` : '0px'
})

/**
 * The unlocked fill grows into its new width rather than jumping there: unlocking a stage is the
 * one moment this bar is about anything, and the eye follows a movement where it would miss a
 * repaint. A `width` transition does it, so every later change animates for free — including the
 * very first, which needs the bar to have been painted at zero once. Hence [grown]: false for a
 * frame, then true. The same two frames `HueWheelReveal` needs, and for the same reason — Firefox
 * only transitions off a style it has already resolved.
 */
const grown = ref(hasTail.value)
let frame = 0

onMounted(() => {
  // The reveal unlocks nothing: its fill is there from the start.
  if (grown.value) return
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
  grown.value ? barFraction(props.unlockedSeconds, longest.value) * 100 : 0,
)
const playheadPct = computed(() =>
  Math.min(barFraction(props.positionSeconds, longest.value) * 100, unlockedPct.value),
)
const steps = computed(() => stageSteps(props.durations, props.totalSeconds, props.unlockedSeconds))
const endLabel = computed(() => scaleEndLabel(props.durations, props.totalSeconds))
</script>

<template>
  <!-- The room above the bar belongs to the verdict that appears there. Reserved here rather than on
       the board, so both screens keep the bar at the same height — the reveal has no verdicts, but it
       does have to agree with the board about where the bar sits. -->
  <div class="relative pt-7">
    <div class="relative h-5 w-full" data-test="stage-bar">
      <div
        class="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-neutral-200"
        data-test="stage-ladder"
        :style="ladderStyle"
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
             reads as separate rungs instead of one bar with tick marks on it. The last boundary
             needs none — there the ladder simply stops. -->
        <div
          v-for="step in steps.filter((s) => !s.atEnd)"
          :key="step.label"
          class="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-white"
          data-test="stage-gap"
          :style="{ left: `${step.fraction * 100}%` }"
        />
      </div>
      <!-- The reveal's extra 15s: no stage ever played them, so they wear a paler amber and stand
           apart from the ladder. -->
      <div
        v-if="hasTail"
        class="absolute inset-y-0 overflow-hidden rounded-r-full bg-amber-100"
        data-test="stage-tail"
        :style="tailStyle"
      >
        <div
          class="absolute inset-y-0 left-0 bg-amber-300"
          data-test="stage-tail-playhead"
          :style="{ width: tailPlayheadWidth }"
        />
      </div>
    </div>
    <!-- Above the bar, where the news is: a stage just came free. In the room the bar reserved for
         it, so it pushes nothing; gone by itself, because a verdict that stays turns into a label. -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-500"
      leave-to-class="opacity-0"
    >
      <p
        v-if="notice"
        class="pointer-events-none absolute inset-x-0 top-0 flex h-7 items-center justify-center text-sm whitespace-nowrap text-amber-700"
        data-test="song-notice"
      >
        {{ notice }}
      </p>
    </Transition>

    <!-- The ladder in writing, each rung under its own gap. -->
    <div class="relative mt-1 h-4" data-test="stage-steps">
      <!-- As wide as the ladder, so the labels ride with it when it shrinks. -->
      <div class="absolute inset-y-0 left-0" data-test="stage-ladder-steps" :style="ladderStyle">
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
      </div>
      <!-- Where the ladder stops short of the bar, the scale itself gets the last word. -->
      <span
        v-if="endLabel"
        class="absolute -translate-x-full text-[10px] leading-4 tabular-nums text-neutral-500"
        data-test="stage-scale-end"
        :style="endLabelStyle"
      >
        {{ endLabel }}
      </span>
    </div>
  </div>
</template>
