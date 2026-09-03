<script setup lang="ts">
/**
 * The card after the round: the song as something to look at and play, and the scoreboard under it.
 *
 * Composition only — every number it hands down was worked out in `SongSnippetGame` from the pure
 * `scoreboard` module, so this file has nothing to get wrong and nothing to test.
 */
import SongPlayerReveal from './SongPlayerReveal.vue'
import SongSnippetScoreboard from './SongSnippetScoreboard.vue'
import type { ScoreRow } from './scoreboard'
import type { SongSnippetSolution } from './types'

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  rows: ScoreRow[]
  live: boolean
  // `| undefined` (not a bare `?`): see the note in `SongPlayerReveal`.
  assetUrl?: ((key: number) => string) | undefined
}>()
</script>

<template>
  <div data-test="song-reveal" class="flex flex-col gap-4">
    <SongPlayerReveal
      :solution="props.solution"
      :durations="props.durations"
      :asset-url="props.assetUrl"
    />
    <SongSnippetScoreboard :rows="props.rows" :live="props.live" />
  </div>
</template>
