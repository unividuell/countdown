<script setup lang="ts">
/**
 * The rules and the stake, below the play area — readable while the cover lies, which is when they
 * should be read. The five rules are the original's, word for word; the sixth explains the hold.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="deduster">
      <template #abstract>
        Bestätige jede frisch entstaubte Kachel, bevor die nächste fällt.
      </template>
      <ol class="ms-4 list-decimal space-y-1">
        <li>In einem pro Runde festen Takt wird eine Kachel nach der anderen entstaubt.</li>
        <li>Jede neu entstaubte Kachel muss bestätigt werden — ein Tipp auf genau diese Kachel.</li>
        <li>Zeit dafür ist bis zur nächsten Kachel, also ein Takt.</li>
        <li>Wer bis zum Schluss mithält, gewinnt.</li>
        <li>
          Verloren hat, wer nicht rechtzeitig bestätigt oder eine andere als die zuletzt entstaubte
          Kachel antippt.
        </li>
      </ol>
      <p class="mt-3">Beim Halten wird im Takt des Spiels eingezählt.</p>
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="deduster"
    >
      <template #qualifies>Du musst bis zur letzten Kachel mithalten.</template>
      <template #closest>
        Bis zur letzten Kachel — und von allen, die es schaffen, die kürzeste ⌀-Reaktionszeit.
      </template>
    </AwardBox>
  </div>
</template>
