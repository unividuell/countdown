<script setup lang="ts">
/**
 * The rainbow band both wheels paint. Nothing but a div and [ringStyle] — it exists so the input
 * wheel and the reveal wheel cannot drift apart on the one thing they genuinely share.
 */
import { computed } from 'vue'
import { ringStyle, type RingSweep } from './ring'

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
</script>

<template>
  <div
    data-test="hue-ring"
    aria-hidden="true"
    class="absolute inset-0 rounded-full"
    :style="style"
  />
</template>
