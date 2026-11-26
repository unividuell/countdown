<script setup lang="ts">
/**
 * The card after the round: one tower stands on the board, the selected name's, rebuilt from its
 * click times and shown as it ended — no replay. Exactly one name is always selected: mine first,
 * without a tip of mine the table's first; tapping the selected name again keeps it.
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

/** The name last tapped; until then, and if its row is gone, the default below stands. */
const chosen = ref<string | null>(null)

const selected = computed(
  () =>
    props.rows.find((row) => row.userId === chosen.value) ??
    props.rows.find((row) => row.userId === props.mineUserId) ??
    props.rows[0],
)
const selectedUserId = computed(() => selected.value?.userId ?? null)

function select(userId: string): void {
  chosen.value = userId
}

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
      :perfects="[]"
      :slider="null"
      :target="props.payload.target"
      fit
    />

    <StackFloorScoreboard
      :rows="props.rows"
      :live="props.live"
      :selected-user-id="selectedUserId"
      :target="props.payload.target"
      @select="select"
    />
  </div>
</template>
