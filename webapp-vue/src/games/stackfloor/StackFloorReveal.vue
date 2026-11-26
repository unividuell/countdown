<script setup lang="ts">
/**
 * The card after the round: one tower stands on the board, the selected name's, rebuilt from its
 * click times and shown as it ended — no replay. My own is preselected; the same name again lets go
 * and the board shows the foundation alone.
 */
import { computed, ref } from 'vue'
import { provideRevealTimeline } from '@/games/revealTimeline'
import type { ScoreRow } from './scoreboard'
import StackFloorScoreboard from './StackFloorScoreboard.vue'
import { buildTower, foundation } from './tower'
import TowerView from './TowerView.vue'
import { geometryOf } from './types'
import type { StackFloorPayload } from './types'

const props = defineProps<{
  payload: StackFloorPayload
  rows: ScoreRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
}>()

// The board judged the run as it ended: the reveal only lands the rows.
provideRevealTimeline({ animate: props.animate, won: () => null, judged: 'before' })

const selectedUserId = ref<string | null>(
  props.rows.some((row) => row.userId === props.mineUserId) ? props.mineUserId : null,
)

/** A name shows that tower; the same one again lets go. */
function select(userId: string): void {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}

const selected = computed(() => props.rows.find((row) => row.userId === selectedUserId.value))

/** `null`: the selected tip's click times are unreadable. */
const bars = computed(() => {
  const row = selected.value
  if (row === undefined) return [foundation(props.payload)]
  if (row.clicks === null) return null

  return buildTower(geometryOf(props.payload), row.clicks).bars
})
</script>

<template>
  <div data-test="stack-floor-reveal" class="flex flex-col gap-6">
    <p v-if="bars === null" data-test="unreadable" class="text-sm text-on-surface-variant">
      Diese Runde lässt sich hier nicht anzeigen.
    </p>
    <TowerView
      v-else
      :field-width="props.payload.fieldWidth"
      :hue-start="props.payload.hueStart"
      :bars="bars"
      :cuts="[]"
      :slider="null"
      :target="props.payload.target"
    />

    <StackFloorScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="select"
    />
  </div>
</template>
