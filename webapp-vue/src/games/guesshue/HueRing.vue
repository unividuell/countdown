<script setup lang="ts">
/**
 * The rainbow band both wheels paint, and its outline. Nothing but [ringStyle] and two circles —
 * it exists so the input wheel and the reveal wheel cannot drift apart on the one thing they
 * genuinely share.
 */
import { computed } from 'vue'
import { ringOutline, ringStyle, sweepMask, type RingSweep } from './ring'

const props = defineProps<{
  saturation: number
  lightness: number
  innerFraction: number
  /** `null` paints the whole ring; the input wheel's entrance passes its progress here. */
  sweep: RingSweep | null
}>()

const style = computed(() =>
  ringStyle({
    saturation: props.saturation,
    lightness: props.lightness,
    innerFraction: props.innerFraction,
    sweep: props.sweep,
  }),
)

// A dark band vanishes on a dark card, a light one on a light card: a hairline inside and out in
// the ink opposite the mode gives it an edge either way. Unit radius around the centre.
const outline = computed(() => ringOutline(props.innerFraction))
const outlineStyle = computed(() => {
  const mask = sweepMask(props.sweep)
  return mask ? { mask, WebkitMask: mask } : {}
})
</script>

<template>
  <div
    data-test="hue-ring"
    aria-hidden="true"
    class="absolute inset-0 rounded-full"
    :style="style"
  />
  <svg
    data-test="hue-ring-outline"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 size-full stroke-on-surface"
    viewBox="-1 -1 2 2"
    fill="none"
    :style="outlineStyle"
  >
    <circle :r="outline.outer" :stroke-width="outline.width" />
    <circle :r="outline.inner" :stroke-width="outline.width" />
  </svg>
</template>
