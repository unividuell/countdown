<script setup lang="ts">
/** What the player needs beside the field: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import MixColorRules from './MixColorRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
  capacity: number
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="mix-color">
      <template #abstract>
        Rühr im Kreis (innen) die Farbe des Feldes (außen) an. Höchstens
        {{ props.capacity }} Tropfen.
      </template>
      <MixColorRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="mix-color"
    >
      <template #qualifies>Abstand höchstens 4,0.</template>
      <template #closest>Die Mischung, die am nächsten dran ist.</template>
    </AwardBox>
  </div>
</template>
