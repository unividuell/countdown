<script setup lang="ts">
/** What the player needs beside the canvas: how it is played, and what the round pays. */
import { computed } from 'vue'
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import PaintRatioRules from './PaintRatioRules.vue'
import { formatShare } from './scoreboard'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
  /** Share of the canvas; `null` in phase two. */
  tolerance: number | null
}>()

const toleranceLabel = computed(() =>
  props.tolerance === null ? null : `${formatShare(props.tolerance)} Prozentpunkte`,
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="paint-ratio">
      <template #abstract>
        Male ein Bild mit demselben Farbanteil wie das Kollektiv Kommune.
      </template>
      <PaintRatioRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="paint-ratio"
    >
      <template v-if="toleranceLabel !== null" #qualifies>
        Dein Anteil darf um höchstens {{ toleranceLabel }} vom Ziel abweichen.
      </template>
      <template #closest>Der Anteil, der dem Ziel am nächsten kommt.</template>
    </AwardBox>
  </div>
</template>
