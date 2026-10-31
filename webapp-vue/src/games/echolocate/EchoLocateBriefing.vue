<script setup lang="ts">
/** What the player needs beside the field: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import EchoLocateRules from './EchoLocateRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
  /** Phase one's circle around a clip, in cells; `null` in phase two. */
  toleranceRadius: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="echo-locate">
      <template #abstract>Irgendwo im Nebel steckt ein Spruch. Peil ihn an.</template>
      <EchoLocateRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="echo-locate"
    >
      <template v-if="props.toleranceRadius !== null" #qualifies>
        Jeder Pin muss im Toleranzkreis um seinen Spruch liegen.
      </template>
      <template #closest>Der kleinste Abstand zum Spruch, bei zwei Sprüchen im Mittel.</template>
    </AwardBox>
  </div>
</template>
