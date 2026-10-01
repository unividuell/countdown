<script setup lang="ts">
/**
 * After the run: the photo under the dust, whole — the reward — then the table and the curve.
 * Scrubbing the curve outlines the scrubbed level's right tile on the photo, and in red every tile
 * somebody wrongly tapped at that level, with a dot per player: that is how one sees one lay a tile
 * too far right.
 */
import { computed, ref } from 'vue'
import DedusterChart from './DedusterChart.vue'
import DedusterScoreboard from './DedusterScoreboard.vue'
import { wrongTilesAt } from './chart'
import type { DedusterRow } from './scoreboard'
import type { DedusterPayload } from './types'

const props = defineProps<{
  payload: DedusterPayload
  photoUrl: string
  rows: DedusterRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
}>()

const tiles = computed(() => props.payload.cols * props.payload.rows)
const selectedUserId = ref<string | null>(props.mineUserId)
const level = ref<number | null>(null)

const correctTile = computed(() =>
  level.value === null ? null : (props.payload.order[level.value] ?? null),
)
const wrong = computed(
  () =>
    new Map(
      level.value === null
        ? []
        : wrongTilesAt(level.value, props.rows).map((w) => [w.tile, w.players] as const),
    ),
)

function markOf(tile: number): 'reveal-correct' | 'reveal-wrong' | 'reveal-cell' {
  if (tile === correctTile.value) return 'reveal-correct'
  if (wrong.value.has(tile)) return 'reveal-wrong'
  return 'reveal-cell'
}
</script>

<template>
  <div data-test="deduster-reveal" class="flex flex-col gap-6">
    <div
      class="relative -mx-4 -mt-4"
      :style="{ aspectRatio: `${props.payload.cols} / ${props.payload.rows}` }"
    >
      <img
        :src="props.photoUrl"
        alt="Das freigelegte Foto"
        class="absolute inset-0 size-full"
        draggable="false"
      />
      <div
        v-if="level !== null"
        class="pointer-events-none absolute inset-0 grid"
        :style="{ gridTemplateColumns: `repeat(${props.payload.cols}, minmax(0, 1fr))` }"
      >
        <div
          v-for="cell in tiles"
          :key="cell"
          :data-test="markOf(cell - 1)"
          :data-tile="cell - 1"
          class="flex flex-wrap content-center justify-center gap-0.5"
          :class="{
            'ring-2 ring-white ring-inset': markOf(cell - 1) === 'reveal-correct',
            'ring-2 ring-red-600 ring-inset': markOf(cell - 1) === 'reveal-wrong',
          }"
        >
          <span
            v-for="player in wrong.get(cell - 1) ?? []"
            :key="player.userId"
            data-test="reveal-dot"
            class="size-2.5 rounded-full ring-1 ring-white"
            :style="{ backgroundColor: player.colorHex }"
          />
        </div>
      </div>
    </div>

    <DedusterScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="(userId) => (selectedUserId = userId)"
    />
    <DedusterChart
      :rows="props.rows"
      :tiles="tiles"
      :interval-ms="props.payload.intervalMs"
      :selected-user-id="selectedUserId"
      :level="level"
      @scrub="(next) => (level = next)"
    />
  </div>
</template>
