<script setup lang="ts">
// A poster's line of small print, on the poster's ground.
defineProps<{ left: string; right?: string }>()
</script>

<template>
  <span
    class="poster-strip flex justify-between gap-4 px-4 py-3 text-xs font-medium tracking-[0.2em] uppercase"
  >
    <span>{{ left }}</span>
    <span v-if="right" class="tabular-nums">{{ right }}</span>
  </span>
</template>
