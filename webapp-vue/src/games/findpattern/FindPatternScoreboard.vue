<script setup lang="ts">
/**
 * „Auswertung“: every player's tip as a row, in the order the round already ranked them.
 *
 * The layout is Guess Hue's scoreboard, cell for cell: the near-black head band as an anchor, thin
 * white gutters between all cells, and an ink decision per cell — each tone chip carries its own
 * `ink`, because the board's four greys are close enough that one fixed colour would be unreadable
 * on at least one of them. The table's box is complete from the moment it mounts and only its ink
 * appears, so nothing here ever moves — see the design doc.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FADE_MS, TIP_COLUMN, cellDelayMs, headCellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { hasDurations } from './scoreboard'
import type { ScoreRow, ToneChip } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  solutionChips: ToneChip[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const timed = computed(() => hasDurations(props.rows))
const columns = computed(() =>
  timed.value ? ['Name', 'Tipp', '[mm:ss]', 'Pkt'] : ['Name', 'Tipp', 'Pkt'],
)
const pointsColumn = computed(() => columns.value.length - 1)

/** Asked once, when the choreography would start — the same four questions the wheel asks. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const shown = ref(still)
const opacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))

let frame = 0
onMounted(() => {
  if (still) return
  // The same two frames `HueWheelReveal` needs: Firefox only starts a transition off a style it
  // has already resolved in an earlier frame, so a painted `opacity-0` frame must exist first.
  frame = requestAnimationFrame(() => {
    void document.body.offsetHeight
    frame = requestAnimationFrame(() => {
      shown.value = true
    })
  })
})
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

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
  <div data-test="pattern-scoreboard">
    <div class="flex items-end justify-between gap-2">
      <h2 class="text-2xl">Auswertung</h2>
      <span v-if="props.live" class="transition-opacity" :class="opacity" :style="head(0, 1)">
        <!-- Two elements, not one: the fade outside, the pulse inside. A running animation
             outranks a plain class, so `animate-pulse` beside `opacity-0` would blink into view
             from the first frame regardless of the delay above — see `frontend-ui.md`. -->
        <span
          data-test="pattern-scoreboard-live"
          class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
        >
          live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
        </span>
      </span>
      <div class="flex flex-col items-end gap-0.5">
        <span
          class="bg-neutral-900 px-1 text-xs text-neutral-50 transition-opacity"
          :class="opacity"
          :style="head(0, 0)"
          >Lösung</span
        >
        <div class="flex flex-row gap-px">
          <span
            v-for="chip in props.solutionChips"
            :key="chip.value"
            data-test="solution-chip"
            class="size-6 content-center text-center font-mono text-xs transition-opacity"
            :class="opacity"
            :style="{ backgroundColor: chip.hex, color: chip.ink, ...head(1, 0) }"
          >
            {{ chip.value }}
          </span>
        </div>
      </div>
    </div>

    <table class="mt-2 w-full border-separate border-spacing-px">
      <thead>
        <tr>
          <th
            v-for="(label, column) in columns"
            :key="label"
            class="bg-neutral-900 px-1 text-start text-xs font-normal text-neutral-50 transition-opacity"
            :class="opacity"
            :style="head(2, column)"
          >
            {{ label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in props.rows" :key="row.userId">
          <td
            class="px-1 transition-opacity"
            :class="opacity"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 0) }"
          >
            {{ row.name }}
          </td>
          <td
            :data-test="`tip-${row.userId}`"
            class="transition-opacity"
            :class="opacity"
            :style="cell(row.tick, TIP_COLUMN)"
          >
            <div v-if="!row.gaveUp" class="flex flex-row gap-px">
              <span
                v-for="(chip, at) in row.chips"
                :key="at"
                class="size-6 content-center text-center font-mono text-xs"
                :style="{ backgroundColor: chip.hex, color: chip.ink }"
              >
                {{ chip.value }}
              </span>
            </div>
            <div v-else class="bg-neutral-900 px-1 text-center text-xs text-neutral-50">
              aufgegeben
            </div>
          </td>
          <td
            v-if="timed"
            class="px-1 text-end font-mono text-xs transition-opacity"
            :class="opacity"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 2) }"
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
            <!-- The fade sits outside, the pulse on the child: one element carrying both would
                 blink into view from the first frame, whatever the delay says. -->
            <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
              row.points ?? '—'
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
