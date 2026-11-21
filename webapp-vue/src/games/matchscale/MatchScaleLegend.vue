<script setup lang="ts">
/**
 * A and B under the field, one line each, in the board and the reveal alike:
 *
 *   ● Alpha¹ · 230 cm Länge        ← name and footnote marker; the measure only in the reveal,
 *                                     A and B in one unit
 *   ● Beta · 2,65×                 ← a category without measures (outlines from a map): the
 *                                     factor, A at `1×`
 *
 * The credits themselves stand in `MatchScaleFootnotes`, at the card's bottom edge.
 *
 * The name truncates instead of wrapping, so the measure arriving in the reveal reflows nothing:
 * board and reveal stand equally tall.
 */
import { computed } from 'vue'
import { footnotesOf } from './footnotes'
import { formatMeasure } from './measure'
import { formatFactor } from './scoreboard'
import type { Measure, Silhouette } from './types'
import { roundUnit } from './units'

const props = defineProps<{
  a: Silhouette
  b: Silhouette
  aColor: string
  bColor: string
  /** `null` while playing: the metres give the factor away. */
  measureA: Measure | null
  measureB: Measure | null
  /** The reveal's factor; absent while playing. */
  factor?: number
  /** The category's legend, for its footnote marker on both names. */
  legend?: string | null
}>()

const items = computed(() => {
  // In the reveal a subject adds its marker after the credits'; the credits' stay as they were.
  const { markers } = footnotesOf(props.a, props.b, {
    legend: props.legend ?? null,
    measureA: props.measureA,
    measureB: props.measureB,
  })

  // One unit for both, so the two lengths compare at a glance.
  const unit = roundUnit(props.measureA, props.measureB)
  const text = (measure: Measure | null) =>
    measure === null || unit === null ? null : formatMeasure(measure, unit)

  // No measure on either side: the factor is all there is to name.
  const factors =
    props.factor !== undefined && props.measureA === null && props.measureB === null
      ? { a: '1×', b: `${formatFactor(props.factor)}×` }
      : null

  return [
    {
      key: 'a',
      silhouette: props.a,
      color: props.aColor,
      measure: factors?.a ?? text(props.measureA),
      marker: markers.a,
    },
    {
      key: 'b',
      silhouette: props.b,
      color: props.bColor,
      measure: factors?.b ?? text(props.measureB),
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
          · {{ item.measure }}
        </span>
      </p>
    </li>
  </ul>
</template>
