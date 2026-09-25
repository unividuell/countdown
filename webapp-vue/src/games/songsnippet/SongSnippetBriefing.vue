<script setup lang="ts">
/**
 * What the player needs before the first snippet: how it is played, and what the round pays.
 *
 * Its own component rather than markup inside the board, so the board can mount it below the play
 * area, where it stays readable while the round is sealed.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import SongSnippetRules from './SongSnippetRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="song-snippet">
      <template #abstract>Erkenne den Song am kürzesten Schnipsel.</template>
      <SongSnippetRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="song-snippet"
    >
      <template #qualifies
        >Du musst den richtigen Song erkennen. Ein falscher Tipp verbraucht nur die aktuelle Stufe —
        nicht das ganze Spiel.</template
      >
      <template #closest>
        Der richtige Song — und von allen, die ihn haben, der mit dem kürzesten Schnipsel. Du hast
        nur eine Tippabgabe!
      </template>
    </AwardBox>
  </div>
</template>
