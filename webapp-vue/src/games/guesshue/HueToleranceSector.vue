<script setup lang="ts">
/**
 * The window and the solution, over the band. Dashed means boundary, solid means solution — that
 * is the whole key to reading the picture, and it is why these are two paths and not one.
 *
 * A unit `viewBox` so the drawing scales with the wheel without measuring anything, and
 * `non-scaling-stroke` so the lines keep their weight in pixels while it does. `aria-hidden`
 * because the statement belongs to the wheel as a whole, not to one of its layers.
 */
import { computed } from 'vue'
import { sectorPaths } from './reveal'

const props = defineProps<{
  targetHue: number
  /** Half-window, in degrees. `0` draws the solution line and no window. */
  toleranceDeg: number
  /** The band's current inner edge — the lines stop there, the hole stays empty. */
  innerFraction: number
  /** Ink that stays readable against the solution colour. */
  color: string
}>()

const paths = computed(() => sectorPaths(props.targetHue, props.toleranceDeg, props.innerFraction))
</script>

<template>
  <svg
    data-test="hue-sector-svg"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 size-full"
    viewBox="0 0 1 1"
    fill="none"
    :stroke="props.color"
  >
    <path
      v-if="paths.window"
      data-test="hue-sector-window"
      :d="paths.window"
      stroke-width="2"
      stroke-dasharray="6 3"
      vector-effect="non-scaling-stroke"
    />
    <path
      data-test="hue-sector-solution"
      :d="paths.solution"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
