<script setup lang="ts">
/**
 * The card after the round: the target field with the circle, and the scoreboard, whose boxes set
 * every recipe against the target's. Each name toggles its player's mix in and out of the circle,
 * which splits into equal slices, one per selected player, in scoreboard order from a start angle
 * drawn once per mount. Mine starts selected; with none the circle is the empty glass's grey.
 *
 * A player who gave up has no mix: tapping the name does nothing.
 */
import { computed, ref } from 'vue'
import { provideRevealTimeline } from '@/games/revealTimeline'
import MixColorScoreboard from './MixColorScoreboard.vue'
import MixerGlass from './MixerGlass.vue'
import MixPie from './MixPie.vue'
import type { ScoreboardRow } from './scoreboard'
import type { MixColorPayload, MixColorSolution } from './types'

const props = defineProps<{
  payload: MixColorPayload
  solution: MixColorSolution
  rows: ScoreboardRow[]
  mineUserId: string | null
  /** Which verdict closes the reveal: `null` plays none. */
  won: boolean | null
  live: boolean
  animate: boolean
}>()

provideRevealTimeline({ animate: props.animate, won: () => props.won })

const mixed = (userId: string | null) =>
  props.rows.some((row) => row.userId === userId && row.hex !== null)

const picked = ref<string[]>(mixed(props.mineUserId) ? [props.mineUserId!] : [])
const start = Math.random() * 360

/** Every mix in scoreboard order, on or off: slice and row map 1:1. */
const slices = computed(() =>
  props.rows.flatMap((row) =>
    row.hex === null
      ? []
      : [
          {
            key: row.userId,
            hex: row.hex,
            dot: row.colorHex,
            on: picked.value.includes(row.userId),
          },
        ],
  ),
)

function select(userId: string): void {
  if (!mixed(userId)) return

  picked.value = picked.value.includes(userId)
    ? picked.value.filter((id) => id !== userId)
    : [...picked.value, userId]
}
</script>

<template>
  <div data-test="mix-color-reveal" class="flex flex-col gap-6">
    <div
      data-test="mix-color-field"
      class="flex aspect-square w-full items-center justify-center rounded-lg"
      :style="{ backgroundColor: props.payload.targetHex }"
    >
      <div class="relative aspect-square w-[58%]">
        <MixerGlass :fill="null" :splashes="[]" />
        <MixPie class="absolute inset-0" :slices="slices" :start="start" />
      </div>
    </div>

    <MixColorScoreboard
      :rows="props.rows"
      :live="props.live"
      :selected="picked"
      :tolerance="props.solution.tolerance"
      :pigments="props.payload.pigments"
      :target="props.solution.recipe"
      @select="select"
    />
  </div>
</template>
