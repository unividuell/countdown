<script setup lang="ts">
import { computed } from 'vue'
import { groupCentres } from './board'

const props = defineProps<{ text: string; labels: readonly string[]; visible: boolean }>()

// The board reads its own value out to assistive tech, so this row is decoration for the eye
// only — a second reading of the same numbers would just be noise.
const cells = computed(() =>
  groupCentres(props.text).map((centre, i) => ({
    left: `${centre}%`,
    label: props.labels[i] ?? '',
  })),
)
</script>

<template>
  <div
    aria-hidden="true"
    class="relative h-4 font-mono text-[11px] tracking-[0.14em] text-stone-500 transition-opacity duration-300"
    :class="visible ? 'opacity-100' : 'opacity-0'"
  >
    <!-- Inline style, not a utility class: the centre is computed, and Tailwind only generates the
         classes it can find in the source. -->
    <span
      v-for="(cell, i) in cells"
      :key="i"
      class="absolute -translate-x-1/2 whitespace-nowrap"
      :style="{ left: cell.left }"
      >{{ cell.label }}</span
    >
  </div>
</template>
