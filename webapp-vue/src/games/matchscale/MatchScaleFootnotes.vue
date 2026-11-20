<script setup lang="ts">
/**
 * The credits of A and B, owed whenever a silhouette is shown. The last element of the board and
 * of the reveal, so they sit at the card's bottom edge in both.
 *
 * The reveal adds, unmarked and first, what a generic name stood for:
 *
 *   Alpha: Alpha Mk II        ← measure.subject, never before the guess
 *   ¹ Silhouette: …
 */
import { computed } from 'vue'
import { footnotesOf } from './footnotes'
import type { Measure, Silhouette } from './types'

const props = withDefaults(
  defineProps<{
    a: Silhouette
    b: Silhouette
    measureA?: Measure | null
    measureB?: Measure | null
  }>(),
  { measureA: null, measureB: null },
)

const notes = computed(() => {
  const subjects = [
    [props.a, props.measureA],
    [props.b, props.measureB],
  ] as const

  return [
    ...subjects.flatMap(([silhouette, measure]) =>
      measure?.subject
        ? [{ key: `subject-${silhouette.name}`, text: `${silhouette.name}: ${measure.subject}` }]
        : [],
    ),
    ...footnotesOf(props.a, props.b).notes.map((note) => ({
      key: note.marker,
      text: `${note.marker} ${note.text}`,
    })),
  ]
})
</script>

<template>
  <div v-if="notes.length > 0" class="flex flex-col gap-1.5">
    <!-- The classic footnote rule: short, so it reads as a separator, not a section border. -->
    <hr class="w-12 border-outline" />
    <ul data-test="match-scale-footnotes" class="flex flex-col gap-0.5">
      <li
        v-for="note in notes"
        :key="note.key"
        data-test="match-scale-footnote"
        class="text-xs text-on-surface-variant"
      >
        {{ note.text }}
      </li>
    </ul>
  </div>
</template>
