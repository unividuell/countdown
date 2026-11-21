<script setup lang="ts">
/**
 * The notes behind the names' markers: the credits of A and B, owed whenever a silhouette is
 * shown, and in the reveal what a generic name stood for. Then, unnumbered, the category's legend
 * (how its silhouettes were drawn). The last element of the board and of the reveal, so they sit
 * at the card's bottom edge in both.
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
    /** The category's legend: no name points at it, so it carries no marker. */
    legend?: string | null
  }>(),
  { measureA: null, measureB: null, legend: null },
)

const notes = computed(() => {
  const numbered = footnotesOf(props.a, props.b, props.measureA, props.measureB).notes.map(
    (note) => `${note.marker} ${note.text}`,
  )

  return props.legend === null ? numbered : [...numbered, props.legend]
})
</script>

<template>
  <div v-if="notes.length > 0" class="flex flex-col gap-1.5">
    <!-- The classic footnote rule: short, so it reads as a separator, not a section border. -->
    <hr class="w-12 border-outline" />
    <ul data-test="match-scale-footnotes" class="flex flex-col gap-0.5">
      <li
        v-for="note in notes"
        :key="note"
        data-test="match-scale-footnote"
        class="text-xs text-on-surface-variant"
      >
        {{ note }}
      </li>
    </ul>
  </div>
</template>
