<script setup lang="ts">
/**
 * What the player needs before the panorama loads: how it is played, and what the round pays.
 *
 * Its own component rather than markup inside the game, because it is mounted twice — once by the
 * game and once by the reveal screen, where the game itself is not up yet. That second mount is
 * the point here: the clock starts at the reveal, so reading the rules afterwards costs time.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import SpotObjectRules from './SpotObjectRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="spot-object">
      <template #abstract>Finde den gesuchten Gegenstand.</template>
      <SpotObjectRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="spot-object"
    >
      <template #qualifies>
        Gib einen Tipp ab — die Mitspieler können ihn dir wieder streichen.
      </template>
      <template #closest>
        Die kürzeste Zeit — solange die Mitspieler deinen Tipp stehen lassen.
      </template>
    </AwardBox>
  </div>
</template>
