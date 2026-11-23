<script setup lang="ts">
/**
 * The card after the round: the song as something to look at and play, and the scoreboard under it.
 *
 * Composition only — every number it hands down was worked out in `SongSnippetGame` from the pure
 * `scoreboard` module. Its one job of its own: the verdict, with the solution's beat, only on a
 * reveal that just happened here.
 */
import type { RoundAssets } from '@/api/assets'
import { provideRevealTimeline } from '@/games/revealTimeline'
import SongPlayerReveal from './SongPlayerReveal.vue'
import SongSnippetScoreboard from './SongSnippetScoreboard.vue'
import type { ScoreRow } from './scoreboard'
import type { SongSnippetSolution } from './types'

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  rows: ScoreRow[]
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** Which verdict the solution's beat plays: `null` plays none. */
  won: boolean | null
  // `| undefined` (not a bare `?`): see the note in `SongPlayerReveal`.
  assets?: RoundAssets | undefined
}>()

provideRevealTimeline({ animate: props.animate, won: () => props.won })
</script>

<template>
  <div data-test="song-reveal" class="flex flex-col gap-4">
    <SongPlayerReveal
      :solution="props.solution"
      :durations="props.durations"
      :assets="props.assets"
      :animate="props.animate"
    />
    <SongSnippetScoreboard :rows="props.rows" :live="props.live" :animate="props.animate" />
  </div>
</template>
