<script setup lang="ts">
/** What the player needs before the board appears: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import TurnPipesRules from './TurnPipesRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="turn-pipes">
      <template #abstract> Bring das Brunnenwasser durch alle Rohre in den Zuber. </template>
      <TurnPipesRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="turn-pipes"
    >
      <template #qualifies>
        Der Zuber wird nur heiß, wenn das Wasser durch jedes Rohr fließt.
      </template>
      <template #closest>
        Der heiße Zuber — und von allen, die ihn haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
