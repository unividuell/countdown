<script setup lang="ts">
/**
 * A and B under the field, one line each, in the board and the reveal alike:
 *
 *   ● Alpha¹ · 2,3 m Länge         ← name and footnote marker; the measure only in the reveal
 *
 * The credits themselves stand in `MatchScaleFootnotes`, at the card's bottom edge.
 *
 * The name truncates instead of wrapping, so the measure arriving in the reveal reflows nothing:
 * board and reveal stand equally tall.
 */
import { computed } from 'vue'
import { footnotesOf } from './footnotes'
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

const items = computed(() => {
  const { markers } = footnotesOf(props.a, props.b)

  return [
    {
      key: 'a',
      silhouette: props.a,
      color: props.aColor,
      measure: props.measureA,
      marker: markers.a,
    },
    {
      key: 'b',
      silhouette: props.b,
      color: props.bColor,
      measure: props.measureB,
      marker: markers.b,
    },
  ]
})
</script>

<template>
  <ul data-test="match-scale-legend" class="flex flex-col gap-2">
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
      <p
        class="flex min-w-0 items-baseline gap-1 text-base font-semibold"
        :style="{ color: item.color }"
      >
        <span :data-test="`match-scale-label-${item.key}`" class="truncate">
          {{ item.silhouette.name }}
        </span>
        <sup v-if="item.marker !== null" data-test="match-scale-marker" class="-ml-1 shrink-0">
          {{ item.marker }}
        </sup>
        <span
          v-if="item.measure !== null"
          data-test="match-scale-measure"
          class="shrink-0 text-sm font-normal whitespace-nowrap"
        >
          · {{ formatMeasure(item.measure) }}
        </span>
      </p>
    </li>
  </ul>
</template>
