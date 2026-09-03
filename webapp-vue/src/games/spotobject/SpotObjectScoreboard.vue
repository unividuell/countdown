<script setup lang="ts">
/**
 * „Auswertung“: every player's score as a row. The usual scoreboard shape every other game's
 * reveal carries — see `FindPatternScoreboard.vue` — minus a tip column: Weltanschauung's tip is
 * a photo, and `SpotObjectTipGrid.vue` above this card is already where it lives.
 */
import { computed } from 'vue'
import { FADE_MS, cellDelayMs, headCellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
import { hasDurations } from './tips'
import type { ScoreRow } from './tips'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const timed = computed(() => hasDurations(props.rows))
const columns = computed(() => (timed.value ? ['Name', '[mm:ss]', 'Pkt'] : ['Name', 'Pkt']))
const pointsColumn = computed(() => columns.value.length - 1)

/** Asked once, when the choreography would start — the same four questions every reveal asks. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const { shown } = useRevealArming(still)
const opacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))

function fade(delayMs: number) {
  return { transitionDuration: `${FADE_MS}ms`, transitionDelay: `${delayMs}ms` }
}
function head(row: number, column: number) {
  return fade(headCellDelayMs(row, column))
}
function cell(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length))
}
</script>

<template>
  <div data-test="spot-scoreboard">
    <div class="flex items-end justify-between gap-2">
      <h2 class="text-2xl transition-opacity" :class="opacity" :style="head(0, 0)">Auswertung</h2>
      <!-- Two elements, not one: the fade outside, the pulse inside. See the points cell below. -->
      <span
        v-if="props.live"
        class="block transition-opacity"
        :class="opacity"
        :style="head(0, pointsColumn)"
      >
        <span
          data-test="spot-scoreboard-live"
          class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
        >
          live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
        </span>
      </span>
    </div>

    <table class="mt-2 w-full table-fixed border-separate border-spacing-px">
      <colgroup>
        <col />
        <col v-if="timed" class="w-14" />
        <col class="w-9" />
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="(label, column) in columns"
            :key="label"
            class="bg-neutral-900 px-1 text-start text-xs font-normal text-neutral-50 transition-opacity"
            :class="opacity"
            :style="head(0, column)"
          >
            {{ label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in props.rows" :key="row.userId">
          <td
            class="truncate px-1 transition-opacity"
            :class="opacity"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 0) }"
          >
            {{ row.name }}
          </td>
          <td
            v-if="timed"
            class="px-1 text-end font-mono text-xs transition-opacity"
            :class="opacity"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 1) }"
          >
            {{ row.durationLabel ?? '—' }}
          </td>
          <td
            class="px-1 text-end transition-opacity"
            :class="opacity"
            :style="{
              backgroundColor: row.colorHex,
              color: row.ink,
              ...cell(row.tick, pointsColumn),
            }"
          >
            <!-- The pulse may never share an element with the fade — see FindPatternScoreboard
                 for the full explanation of why they must live on two elements. -->
            <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
              row.points ?? '—'
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
