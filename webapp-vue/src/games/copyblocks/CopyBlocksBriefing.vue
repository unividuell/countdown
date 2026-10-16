<script setup lang="ts">
/** What the player needs before the board appears: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import CopyBlocksRules from './CopyBlocksRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="copy-blocks">
      <template #abstract>Baue die Vorlage nach — Block für Block, exakt.</template>
      <CopyBlocksRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="copy-blocks"
    >
      <template #qualifies>Dein Nachbau muss exakt stimmen.</template>
      <template #closest>
        Der exakte Nachbau — und von allen, die ihn haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
