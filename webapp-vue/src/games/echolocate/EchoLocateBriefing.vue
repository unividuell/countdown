<script setup lang="ts">
/** What the player needs beside the field: how it is played, and what the round pays. */
import { computed } from 'vue'
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import EchoLocateRules from './EchoLocateRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
  /** Cells around a clip that still count; `null` in phase two. */
  toleranceCells: number | null
}>()

/** For the award box's headline: collapsed, it is all the box shows. */
const toleranceDetail = computed(() => {
  const cells = props.toleranceCells
  if (cells === null) return null

  return `±${cells} ${cells === 1 ? 'Zelle' : 'Zellen'}`
})
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
      :detail="toleranceDetail"
    >
      <template v-if="props.toleranceCells !== null" #qualifies>
        Jeder Pin muss in der Zelle seines Spruchs liegen oder in einer der acht daneben.
      </template>
      <template #closest>Der kleinste Abstand zum Spruch, bei zwei Sprüchen im Mittel.</template>
    </AwardBox>
  </div>
</template>
