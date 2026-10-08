<script setup lang="ts">
/**
 * What the player needs before the field appears: how it is played, and what the round pays.
 *
 * Its own component rather than markup inside the board, so the board can mount it below the play
 * area, where it stays readable while the round is sealed.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import PatternRules from './PatternRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="find-pattern">
      <template #abstract> Entdecke im Spielfeld das gesuchte Muster. </template>
      <PatternRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="find-pattern"
    >
      <template #qualifies>Du musst das gesuchte Muster finden.</template>
      <template #closest>
        Das richtige Muster — und von allen, die es haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
