<script setup lang="ts">
import { computed } from 'vue'
import { groupCentres } from './board'

const props = defineProps<{ text: string; labels: readonly string[]; visible: boolean }>()

// This row is aria-hidden because the value is spoken elsewhere: by the board itself in the card,
// where nothing wraps it, and by the wrapping button in the header, where the board is aria-hidden
// too. Either way, a second reading of the same numbers here would just be noise.
const cells = computed(() =>
  groupCentres(props.text).map((centre, i) => ({
    left: `${centre}%`,
    label: props.labels[i] ?? '',
  })),
)
</script>

<template>
  <span
    aria-hidden="true"
    class="relative block h-4 font-mono text-[11px] tracking-[0.14em] text-stone-400 transition-opacity duration-300"
    :class="visible ? 'opacity-100' : 'opacity-0'"
  >
    <!-- The row is a span and not a div so it stays valid inside the header's <button>, whose content
         model is phrasing only; `block` above makes it lay out exactly as a div would.
         The offset is an inline style, not a utility class: the centre is computed, and Tailwind only
         generates the classes it can find in the source. -->
    <span
      v-for="(cell, i) in cells"
      :key="i"
      data-test="legend-label"
      class="absolute -translate-x-1/2 whitespace-nowrap"
      :style="{ left: cell.left }"
      >{{ cell.label }}</span
    >
  </span>
</template>
