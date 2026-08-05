<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { bitmap, type Bitmap } from './font'
import {
  BOOT_DARK_MS,
  BOOT_RESOLVE_AT_MS,
  DOT_OFF,
  DOT_ON,
  FLIP_MS,
  PITCH,
  RADIUS,
  STAGGER_MS,
} from './board'

const props = defineProps<{ text: string; label: string }>()
const emit = defineEmits<{ resolve: [] }>()

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function uniform(b: Bitmap, on: boolean): Bitmap {
  return { cols: b.cols, rows: b.rows, on: b.on.map(() => on) }
}

const svg = useTemplateRef<SVGSVGElement>('svg')
const bm = computed(() => bitmap(props.text))
const phase = ref<'dark' | 'white' | 'live'>(prefersReducedMotion() ? 'live' : 'dark')
const shown = computed(() =>
  phase.value === 'live' ? bm.value : uniform(bm.value, phase.value === 'white'),
)
const gap = PITCH - 2 * RADIUS
const viewBox = computed(() => `0 0 ${bm.value.cols * PITCH - gap} ${bm.value.rows * PITCH - gap}`)
const dots = computed(() =>
  shown.value.on.map((on, i) => ({
    on,
    cx: (i % shown.value.cols) * PITCH + RADIUS,
    cy: Math.floor(i / shown.value.cols) * PITCH + RADIUS,
  })),
)

function flip(prev: Bitmap, next: Bitmap): void {
  if (prev.cols !== next.cols || prefersReducedMotion()) return
  const circles = svg.value?.querySelectorAll('circle')
  if (!circles) return

  const changed: number[] = []
  for (let i = 0; i < next.on.length; i++) {
    if ((prev.on[i] ?? false) !== (next.on[i] ?? false)) changed.push(i)
  }
  if (changed.length === 0) return

  // The wave starts at the rightmost column that changed and runs leftward, which is what a
  // right-aligned readout wants: its low-order end changes most often, and it leads instead of
  // trailing. Measured from that column and not from the board's edge — otherwise a group sitting
  // far right waits out every unchanged column to its left before anything moves.
  const lead = changed.reduce((rightmost, i) => Math.max(rightmost, i % next.cols), 0)

  for (const i of changed) {
    const circle = circles[i]
    // happy-dom has no Web Animations API; the resting colour is already correct without it.
    if (!circle || typeof circle.animate !== 'function') return
    const from = (prev.on[i] ?? false) ? DOT_ON : DOT_OFF
    const to = from === DOT_ON ? DOT_OFF : DOT_ON
    circle.animate(
      [
        { transform: 'scaleY(1)', fill: from },
        { transform: 'scaleY(0.12)', fill: from, offset: 0.49 },
        { transform: 'scaleY(0.12)', fill: to, offset: 0.5 },
        { transform: 'scaleY(1)', fill: to },
      ],
      {
        duration: FLIP_MS,
        delay: (lead - (i % next.cols)) * STAGGER_MS,
        easing: 'ease-in-out',
        fill: 'backwards',
      },
    )
  }
}

watch(
  bm,
  (next, prev) => {
    if (phase.value !== 'live') return
    flip(prev, next)
  },
  { flush: 'post' },
)

const bootTimers: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  if (phase.value === 'live') {
    emit('resolve')
    return
  }
  bootTimers.push(
    // The white-up is a phase change, deliberately with no flip: every dot changes at once, so a
    // simultaneous kick is not readable as movement, while the animation would cost one concurrent
    // fill animation per dot — 329 on the HH:MM:SS strip — in a single main-thread frame, on an
    // audience of phones. The colour change alone is the whole effect.
    setTimeout(() => {
      phase.value = 'white'
    }, BOOT_DARK_MS),
    setTimeout(() => {
      emit('resolve')
      const prev = shown.value
      phase.value = 'live'
      void nextTick(() => flip(prev, shown.value))
    }, BOOT_RESOLVE_AT_MS),
  )
})

onBeforeUnmount(() => {
  for (const timer of bootTimers) clearTimeout(timer)
})
</script>

<template>
  <svg
    ref="svg"
    :viewBox="viewBox"
    class="block"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="label"
  >
    <circle
      v-for="(dot, i) in dots"
      :key="i"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="RADIUS"
      :fill="dot.on ? DOT_ON : DOT_OFF"
      class="origin-center [transform-box:fill-box]"
    />
  </svg>
</template>
