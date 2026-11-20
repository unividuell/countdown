<script setup lang="ts">
/** What the player needs beside the field: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import MatchScaleRules from './MatchScaleRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="match-scale">
      <template #abstract>
        Zieh deine Silhouette so groß, wie sie im Vergleich wirklich ist.
      </template>
      <MatchScaleRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="match-scale"
    >
      <template #qualifies>Höchstens 25 % daneben.</template>
      <template #closest>Der Tipp, der am nächsten dran ist.</template>
    </AwardBox>
  </div>
</template>
