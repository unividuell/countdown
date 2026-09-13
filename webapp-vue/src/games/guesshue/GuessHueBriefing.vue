<script setup lang="ts">
/**
 * What the player needs before touching the wheel: how it is played, and what the round pays.
 *
 * Its own component rather than markup inside the board, because it is mounted twice — once by the
 * board and once by the reveal screen, where the game itself is not up yet. One file means one
 * wording; two would be two places for the same rule to drift.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import HueRules from './HueRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="guess-hue">
      <template #abstract>Triff den beschriebenen Farbton.</template>
      <HueRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="guess-hue"
    >
      <template #qualifies
        >Dein Farbton muss nah genug am gesuchten liegen (innerhalb der Toleranz).</template
      >
      <template #closest>Bester Tipp: am nächsten am gesuchten Farbton.</template>
    </AwardBox>
  </div>
</template>
