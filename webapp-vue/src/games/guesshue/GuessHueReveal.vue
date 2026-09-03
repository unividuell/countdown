<script setup lang="ts">
/**
 * The card after the round: the same quote, the wheel as a picture, and the scoreboard under it.
 *
 * The table's box is complete from the moment this card mounts — nothing under the wheel moves
 * afterwards, only its ink appears. That is why the card grows exactly once, during the crossfade
 * both cards share a grid cell for, and never again.
 */
import GuessHueScoreboard from './GuessHueScoreboard.vue'
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'

const props = defineProps<{
  description: string
  saturation: number
  lightness: number
  targetHue: number
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  animate: boolean
  rows: ScoreboardRow[]
  solutionCell: ScoreboardSolution
  live: boolean
}>()
</script>

<template>
  <div data-test="hue-reveal">
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheelReveal
        :saturation="props.saturation"
        :lightness="props.lightness"
        :target-hue="props.targetHue"
        :tolerance-deg="props.toleranceDeg"
        :guesses="props.guesses"
        :mine-user-id="props.mineUserId"
        :animate="props.animate"
      />
    </div>

    <div class="mt-6">
      <GuessHueScoreboard
        :rows="props.rows"
        :solution="props.solutionCell"
        :live="props.live"
        :animate="props.animate"
      />
    </div>
  </div>
</template>
