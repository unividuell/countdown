<script setup lang="ts">
/** What the player needs before the board appears: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import PlacePatchRules from './PlacePatchRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="place-patch">
      <template #abstract>
        Finde die Stelle, an die der Ausschnitt gehört — aufs Feld genau.
      </template>
      <PlacePatchRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="place-patch"
    >
      <template #qualifies>Du musst den Ausschnitt aufs Feld genau platzieren.</template>
      <template #closest>
        Der exakte Treffer — und von allen, die ihn haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
