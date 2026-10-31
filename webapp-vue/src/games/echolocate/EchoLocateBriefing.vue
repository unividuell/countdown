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
  /** How many clips hide in the field: every text speaks in their number. */
  clips: number
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="echo-locate">
      <template #abstract>
        <template v-if="props.clips === 1"
          >Irgendwo im Nebel steckt ein Spruch. Peil ihn an.</template
        >
        <template v-else>Irgendwo im Nebel stecken zwei Sprüche. Peil sie an.</template>
      </template>
      <EchoLocateRules :clips="props.clips" />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="echo-locate"
    >
      <template v-if="props.toleranceRadius !== null" #qualifies>
        <template v-if="props.clips === 1">
          Dein Pin muss im Toleranzkreis um den Spruch liegen.
        </template>
        <template v-else>Beide Pins müssen im Toleranzkreis um ihren Spruch liegen.</template>
      </template>
      <template #closest>
        <template v-if="props.clips === 1">Der kleinste Abstand zum Spruch.</template>
        <template v-else>Der kleinste mittlere Abstand zu beiden Sprüchen.</template>
      </template>
    </AwardBox>
  </div>
</template>
