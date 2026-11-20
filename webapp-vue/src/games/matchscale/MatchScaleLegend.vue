<script setup lang="ts">
/**
 * A and B under the field, one block each, in the board and the reveal alike:
 *
 *   ● Alpha · 2,3 m Länge          ← name, single line; the measure only in the reveal
 *     Silhouette: Jemand, CC BY    ← credit, owed whenever the silhouette is shown
 *
 * The name truncates instead of wrapping, so the measure arriving in the reveal reflows nothing:
 * board and reveal stand equally tall.
 */
import { computed } from 'vue'
import { formatMeasure } from './measure'
import type { Measure, Silhouette } from './types'

const props = defineProps<{
  a: Silhouette
  b: Silhouette
  aColor: string
  bColor: string
  /** `null` while playing: the metres give the factor away. */
  measureA: Measure | null
  measureB: Measure | null
}>()

const items = computed(() => [
  { key: 'a', silhouette: props.a, color: props.aColor, measure: props.measureA },
  { key: 'b', silhouette: props.b, color: props.bColor, measure: props.measureB },
])
</script>

<template>
  <ul data-test="match-scale-legend" class="flex flex-col gap-2 text-sm">
    <li
      v-for="item in items"
      :key="item.key"
      :data-test="`match-scale-legend-${item.key}`"
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2"
    >
      <span
        aria-hidden="true"
        class="size-2.5 self-center rounded-full"
        :style="{ backgroundColor: item.color }"
      />
      <p class="flex min-w-0 gap-1 font-semibold" :style="{ color: item.color }">
        <span :data-test="`match-scale-label-${item.key}`" class="truncate">
          {{ item.silhouette.name }}
        </span>
        <span
          v-if="item.measure !== null"
          data-test="match-scale-measure"
          class="shrink-0 font-normal whitespace-nowrap"
        >
          · {{ formatMeasure(item.measure) }}
        </span>
      </p>
      <p
        v-if="item.silhouette.attribution !== null"
        data-test="match-scale-attribution"
        class="col-start-2 text-xs text-on-surface-variant"
      >
        {{ item.silhouette.attribution }}
      </p>
    </li>
  </ul>
</template>
