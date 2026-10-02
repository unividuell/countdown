<script setup lang="ts">
/**
 * After the run: the photo under the dust, whole — the reward — then the curve and the table.
 * Scrubbing the curve outlines the scrubbed level's right tile on the photo, and in red every tile
 * somebody wrongly tapped at that level: that is how one sees one lay a tile too far right. Each
 * outlined tile holds a mini bar chart — a slot per player in table order, a bar per time there.
 */
import { computed, ref } from 'vue'
import DedusterChart from './DedusterChart.vue'
import DedusterScoreboard from './DedusterScoreboard.vue'
import { ceilingMs, correctBars, wrongBars, wrongTilesAt, type TileBar } from './chart'
import type { DedusterRow } from './scoreboard'
import type { DedusterPayload } from './types'

const props = defineProps<{
  payload: DedusterPayload
  photoUrl: string
  rows: DedusterRow[]
  live: boolean
  animate: boolean
}>()

const tiles = computed(() => props.payload.cols * props.payload.rows)
const selectedUserId = ref<string | null>(null)

/** A name or a line selects its run; the same one again lets go, back to every line in full. */
function select(userId: string): void {
  selectedUserId.value = selectedUserId.value === userId ? null : userId
}
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

/** Room above the ceiling in a tile's chart, so a warning over the tallest bar stays inside. */
const TILE_HEADROOM = 1.2
const tileCeiling = computed(() => ceilingMs(props.payload.intervalMs) * TILE_HEADROOM)

const bars = computed(() => {
  const at = level.value
  const out = new Map<number, TileBar[]>()
  if (at === null) return out
  for (const tile of wrong.value.keys())
    out.set(tile, wrongBars({ level: at, tile, rows: props.rows }))
  if (correctTile.value !== null) {
    const intervalMs = props.payload.intervalMs
    out.set(correctTile.value, correctBars({ level: at, rows: props.rows, intervalMs }))
  }
  return out
})

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
          class="flex items-end justify-center gap-px px-1 pb-0.5"
          :class="{
            'bg-white/60 ring-2 ring-white ring-inset': markOf(cell - 1) === 'reveal-correct',
            'bg-white/60 ring-2 ring-red-600 ring-inset': markOf(cell - 1) === 'reveal-wrong',
          }"
        >
          <!-- No axes, no labels: 0 at the bottom, the band's top near the tile's; thin enough for
               every player, never wider than 6 px. -->
          <div
            v-for="(bar, slot) in bars.get(cell - 1) ?? []"
            :key="slot"
            data-test="reveal-slot"
            class="relative h-full max-w-1.5 flex-1"
          >
            <div
              v-if="bar"
              data-test="reveal-bar"
              :data-user="bar.userId"
              :data-kind="bar.kind"
              class="absolute inset-x-0 bottom-0"
              :class="{ 'opacity-40': bar.kind === 'missed' }"
              :style="{
                height: `${(bar.ms / tileCeiling) * 100}%`,
                backgroundColor: bar.colorHex,
              }"
            >
              <span
                v-if="bar.warn"
                data-test="reveal-warning"
                class="absolute bottom-full left-1/2 -translate-x-1/2 text-[8px] leading-none"
                >⚠</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <DedusterChart
      :rows="props.rows"
      :tiles="tiles"
      :interval-ms="props.payload.intervalMs"
      :selected-user-id="selectedUserId"
      :level="level"
      @scrub="(next) => (level = next)"
      @select="select"
    />
    <DedusterScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      :interval-ms="props.payload.intervalMs"
      :tiles="tiles"
      @select="select"
    />
  </div>
</template>
