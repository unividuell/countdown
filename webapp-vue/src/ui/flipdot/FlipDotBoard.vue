<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { bitmap } from './font'
import { DOT_OFF, DOT_ON, FLIP_MS, PITCH, RADIUS, STAGGER_MS } from './board'

const props = defineProps<{ text: string; label: string }>()

const svg = useTemplateRef<SVGSVGElement>('svg')
const bm = computed(() => bitmap(props.text))
const gap = PITCH - 2 * RADIUS
const viewBox = computed(
  () => `0 0 ${bm.value.cols * PITCH - gap} ${bm.value.rows * PITCH - gap}`,
)
const dots = computed(() =>
  bm.value.on.map((on, i) => ({
    on,
    cx: (i % bm.value.cols) * PITCH + RADIUS,
    cy: Math.floor(i / bm.value.cols) * PITCH + RADIUS,
  })),
)

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

watch(
  bm,
  (next, prev) => {
    if (prev.cols !== next.cols || prefersReducedMotion()) return
    const circles = svg.value?.querySelectorAll('circle')
    if (!circles) return

    for (let i = 0; i < next.on.length; i++) {
      const was = prev.on[i] ?? false
      const is = next.on[i] ?? false
      if (was === is) continue
      const circle = circles[i]
      // happy-dom has no Web Animations API; the resting colour is already correct without it.
      if (!circle || typeof circle.animate !== 'function') return
      const from = was ? DOT_ON : DOT_OFF
      const to = is ? DOT_ON : DOT_OFF
      circle.animate(
        [
          { transform: 'scaleY(1)', fill: from },
          { transform: 'scaleY(0.12)', fill: from, offset: 0.49 },
          { transform: 'scaleY(0.12)', fill: to, offset: 0.5 },
          { transform: 'scaleY(1)', fill: to },
        ],
        {
          duration: FLIP_MS,
          delay: (i % next.cols) * STAGGER_MS,
          easing: 'ease-in-out',
          fill: 'backwards',
        },
      )
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <svg
    ref="svg"
    :viewBox="viewBox"
    class="block w-full"
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
