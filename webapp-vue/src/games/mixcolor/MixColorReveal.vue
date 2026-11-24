<script setup lang="ts">
/**
 * The card after the round: the target field with the circle in the shown player's mix, the drops
 * of target and player side by side, and the scoreboard. Mine shows first; tapping a name shows
 * that player's mix, tapping it again returns to mine.
 *
 * A player who gave up has no mix: no player lane, the circle stays at mine.
 */
import { computed, ref } from 'vue'
import { provideRevealTimeline } from '@/games/revealTimeline'
import DropBars from './DropBars.vue'
import MixColorScoreboard from './MixColorScoreboard.vue'
import MixerGlass from './MixerGlass.vue'
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

/** `null` is mine. */
const picked = ref<string | null>(null)

const mine = computed(() => props.rows.find((row) => row.userId === props.mineUserId) ?? null)
const shown = computed(() => props.rows.find((row) => row.userId === picked.value) ?? mine.value)

function select(userId: string): void {
  picked.value = picked.value === userId ? null : userId
}
</script>

<template>
  <div data-test="mix-color-reveal" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4">
      <div
        data-test="mix-color-field"
        class="flex aspect-square w-full items-center justify-center rounded-lg"
        :style="{ backgroundColor: props.payload.targetHex }"
      >
        <div class="aspect-square w-[58%]">
          <MixerGlass :fill="shown?.hex ?? mine?.hex ?? null" :splashes="[]" />
        </div>
      </div>

      <DropBars
        :pigments="props.payload.pigments"
        :target="props.solution.recipe"
        :player="shown?.recipe ?? null"
        :capacity="props.payload.capacity"
      />
    </div>

    <MixColorScoreboard
      :rows="props.rows"
      :live="props.live"
      :selected="shown?.userId ?? null"
      :tolerance="props.solution.tolerance"
      :pigments="props.payload.pigments"
      :target="props.solution.recipe"
      @select="select"
    />
  </div>
</template>
