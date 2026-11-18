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
      <template #abstract>
        Dreh die Rohre, bis das Wasser vom Handrad zum Abfluss durch jedes Rohr läuft.
      </template>
      <TurnPipesRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="turn-pipes"
    >
      <template #qualifies>Deine Leitung muss durch jedes Rohr führen.</template>
      <template #closest>
        Die Leitung durch jedes Rohr — und von allen, die sie haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
