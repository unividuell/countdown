<script setup lang="ts">
/**
 * What this round is worth, and who gets it.
 *
 * The frame belongs to the framework and follows `Scoring.kt`: in phase one every qualifying
 * guess gets the point, in phase two only the best one does. The one sentence underneath it can
 * only be said by the game — and it differs per phase, because phase one asks "what counts as
 * correct" while phase two asks "who wins among the correct ones". Hence two slots, not one: a
 * shared wording would be wrong for half the games — Farbausmalung and Weltanschauung have no
 * gate at all in phase two, while Musterung and Song-Snippet do.
 */
import { computed } from 'vue'
import InfoBox from '@/ui/InfoBox.vue'
import IconChartPie from '~icons/lucide/chart-pie'
import type { AwardRule } from '@/api/types'

const props = defineProps<{
  awardRule: AwardRule
  /** What this round is worth. 1 in phase one, growing from the threshold on in phase two. */
  awardPoints: number
  gameId: string
}>()

const phaseTwo = computed(() => props.awardRule === 'CLOSEST_ONLY')

const points = computed(
  () => `${props.awardPoints} ${props.awardPoints === 1 ? 'Punkt' : 'Punkte'}`,
)

/**
 * In the abstract, not the body: collapsed is the state the box spends most of its life in, and
 * the point count is the one thing about it that changes round to round.
 */
const headline = computed(() =>
  phaseTwo.value ? `Winner takes it all: ${points.value}` : `Jeder gültige Tipp: ${points.value}`,
)

/** Per game and per phase: phase two's first round should re-open the box. */
const storageKey = computed(() => `award:${props.gameId}:${phaseTwo.value ? 'p2' : 'p1'}`)
</script>

<template>
  <InfoBox :storage-key="storageKey" :tone="phaseTwo ? 'phase-two' : 'phase-one'">
    <template #icon><IconChartPie class="size-5" aria-hidden="true" /></template>
    <template #abstract>{{ headline }}</template>

    <template v-if="phaseTwo">
      <p><slot name="closest" /></p>
      <p>Der beste Tipp bekommt alle Punkte — bei Gleichstand alle, die ihn teilen.</p>
      <p>Solange die Runde läuft, kann dich noch jemand überholen.</p>
    </template>
    <template v-else>
      <p><slot name="qualifies" /></p>
      <p>Jeder kann sich den Punkt holen — er wird nicht unter euch aufgeteilt.</p>
    </template>
  </InfoBox>
</template>
