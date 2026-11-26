<script setup lang="ts">
/** What the player needs while the cover lies: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import StackFloorRules from './StackFloorRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="stack-floor">
      <template #abstract>
        Tipp, um den gleitenden Balken anzuhalten. Was übersteht, fällt weg.
      </template>
      <StackFloorRules :phase-two="props.awardRule === 'CLOSEST_ONLY'" />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="stack-floor"
    >
      <template #qualifies>Erreiche den besonderen Balken.</template>
      <template #closest>Der höchste Turm.</template>
    </AwardBox>
  </div>
</template>
