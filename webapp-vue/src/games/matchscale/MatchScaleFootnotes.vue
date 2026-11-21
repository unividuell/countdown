<script setup lang="ts">
/**
 * The notes behind the names' markers: the credits of A and B, owed whenever a silhouette is
 * shown, and in the reveal what a generic name stood for. The last element of the board and of the
 * reveal, so they sit at the card's bottom edge in both.
 */
import { computed } from 'vue'
import { footnotesOf } from './footnotes'
import type { Measure, Silhouette } from './types'

const props = withDefaults(
  defineProps<{
    a: Silhouette
    b: Silhouette
    /** `null` while playing: the subject names the thing the size belongs to. */
    measureA?: Measure | null
    measureB?: Measure | null
  }>(),
  { measureA: null, measureB: null },
)

const notes = computed(() => footnotesOf(props.a, props.b, props.measureA, props.measureB).notes)
</script>

<template>
  <div v-if="notes.length > 0" class="flex flex-col gap-1.5">
    <!-- The classic footnote rule: short, so it reads as a separator, not a section border. -->
    <hr class="w-12 border-outline" />
    <ul data-test="match-scale-footnotes" class="flex flex-col gap-0.5">
      <li
        v-for="note in notes"
        :key="note.marker"
        data-test="match-scale-footnote"
        class="text-xs text-on-surface-variant"
      >
        {{ note.marker }} {{ note.text }}
      </li>
    </ul>
  </div>
</template>
