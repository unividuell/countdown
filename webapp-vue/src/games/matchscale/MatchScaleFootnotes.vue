<script setup lang="ts">
/**
 * The credits of A and B, owed whenever a silhouette is shown. The last element of the board and
 * of the reveal, so they sit at the card's bottom edge in both.
 */
import { computed } from 'vue'
import { footnotesOf } from './footnotes'
import type { Silhouette } from './types'

const props = defineProps<{ a: Silhouette; b: Silhouette }>()

const notes = computed(() => footnotesOf(props.a, props.b).notes)
</script>

<template>
  <ul v-if="notes.length > 0" data-test="match-scale-footnotes" class="flex flex-col gap-0.5">
    <li
      v-for="note in notes"
      :key="note.marker"
      data-test="match-scale-footnote"
      class="text-xs text-on-surface-variant"
    >
      {{ note.marker }} {{ note.text }}
    </li>
  </ul>
</template>
