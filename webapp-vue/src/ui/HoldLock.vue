<script setup lang="ts">
/**
 * The grey over a field while its submit hold runs, with the hold's ring writ large. Lets every
 * touch through to the field: a touch there is what cancels the hold. Fixed colours — it lies on
 * a picture or a 3D view, which do not change with the mode.
 */
import { computed } from 'vue'

const props = defineProps<{ progress: number }>()

const RING_MASK = 'radial-gradient(closest-side, transparent 86%, #000 87%)'

const ringStyle = computed(() => {
  const deg = props.progress * 360
  return {
    backgroundImage: `conic-gradient(#fff ${deg}deg, rgb(255 255 255 / 0.3) ${deg}deg 360deg)`,
    mask: RING_MASK,
    WebkitMask: RING_MASK,
  }
})
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-500/60"
  >
    <div class="relative flex size-40 items-center justify-center">
      <span aria-hidden="true" class="absolute inset-0 rounded-full" :style="ringStyle" />
      <span class="text-lg font-semibold text-white">Abgeben …</span>
    </div>
  </div>
</template>
