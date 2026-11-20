<script setup lang="ts">
/**
 * A formatted number whose comma lines up with the ones above and below it: the integer part sits
 * right-aligned in a fixed width, the fraction left-aligned in another, the unit follows.
 *
 *     2,46×        12,5× ↑
 *    12×            1,22× ↓
 *
 * Text without a leading number (`genau`) is printed as is.
 */
import { computed } from 'vue'

const props = defineProps<{
  /** `de-DE` formatted, e.g. `2,46×` or `1,22× ↓`. */
  text: string
  /** Width of the integer part in `ch`: the widest integer of the column. */
  intCh: number
  /**
   * Width of what follows the number, in `em` — the widest of the column (`×` vs. `× ↓`). Fixed,
   * so a right-aligned cell does not shift its comma when one row's unit is longer than another's.
   */
  restEm: number
}>()

/** Two decimals (`formatFactor`): the comma plus two digits. */
const FRACTION_CH = 3

const parts = computed(() => {
  const match = /^(\d+)(,\d+)?(.*)$/.exec(props.text)
  return match === null ? null : { int: match[1], fraction: match[2] ?? '', rest: match[3] }
})
</script>

<template>
  <span v-if="parts" class="whitespace-nowrap tabular-nums">
    <span class="inline-block text-end" :style="{ width: `${props.intCh}ch` }">{{
      parts.int
    }}</span>
    <span class="inline-block text-start" :style="{ width: `${FRACTION_CH}ch` }">{{
      parts.fraction
    }}</span>
    <span class="inline-block text-start" :style="{ width: `${props.restEm}em` }">{{
      parts.rest
    }}</span>
  </span>
  <span v-else>{{ props.text }}</span>
</template>
