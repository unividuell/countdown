<script setup lang="ts">
/**
 * „Auswertung“: every ranked guess of the round as a table, best first.
 *
 * Colour does two jobs here and both carry meaning — identity (the row *is* the player, in the
 * colour their avatar has above the card) and value (the guess as a surface, directly under the
 * solution as a surface). Three quiet things hold that together and none of them are decoration:
 * the near-black head band as an anchor, the thin white gutters between all cells, and an ink
 * decision per cell. Take one away and it stops reading as a table.
 *
 * The layout is the origin app's `GuessColorAnalysis.vue`, cell for cell, in a real `<table>`.
 * The table's box is complete from the moment it mounts and only its ink appears, so nothing here
 * ever moves — see the design doc.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FADE_MS, TIP_COLUMN, cellDelayMs, headCellDelayMs } from './reveal'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  rows: ScoreboardRow[]
  solution: ScoreboardSolution
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const COLUMNS = ['Name', 'Tipp', 'Differenz', 'Pkt']

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

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function degrees(value: number): string {
  return oneDecimal.format(value)
}

/** U+2014. An unscored row says „nothing here“, and a hyphen would read as a minus. */
function pointsLabel(points: number | null): string {
  return points === null ? '—' : String(points)
}

function fade(delayMs: number) {
  return { transitionDuration: `${FADE_MS}ms`, transitionDelay: `${delayMs}ms` }
}

function head(row: number, column: number) {
  return fade(headCellDelayMs(row, column))
}

function body(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length))
}

function ground(row: ScoreboardRow) {
  return { backgroundColor: row.colorHex, color: row.ink }
}

function guessGround(row: ScoreboardRow) {
  return { backgroundColor: row.guessHex, color: row.guessInk }
}
</script>

<template>
  <table
    v-if="props.rows.length > 0"
    data-test="hue-scoreboard"
    class="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5"
  >
    <caption class="sr-only">
      Alle Tipps der Runde, nach Abstand zur Lösung sortiert
    </caption>
    <colgroup>
      <col />
      <col class="w-14" />
      <col class="w-14" />
      <col class="w-9" />
    </colgroup>
    <thead>
      <!-- Head block, row 1: the heading in column one, the label over the guess column, the
           chip over the column that can still change. Exactly where the original puts them. -->
      <tr>
        <td
          rowspan="2"
          class="align-middle transition-opacity"
          :class="opacity"
          :style="head(0, 0)"
        >
          <h2 class="text-2xl">Auswertung</h2>
        </td>
        <th
          id="hue-solution"
          class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
          :class="opacity"
          :style="head(0, 1)"
        >
          Lösung
        </th>
        <td />
        <td rowspan="2" class="align-bottom">
          <!-- Two elements, not one: the fade outside, the pulse inside. See the points cell. -->
          <span
            v-if="props.live"
            class="block transition-opacity"
            :class="opacity"
            :style="head(0, 3)"
          >
            <span
              data-test="hue-scoreboard-live"
              class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
            >
              live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
            </span>
          </span>
        </td>
      </tr>
      <!-- Head block, row 2: the value under its own label. `headers`, not `scope` — `scope="col"`
           would put „Lösung“ over the guesses below, whose column header is „Tipp“. -->
      <tr>
        <td
          headers="hue-solution"
          data-test="hue-scoreboard-solution"
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[{ backgroundColor: props.solution.hex, color: props.solution.ink }, head(1, 1)]"
        >
          {{ degrees(props.solution.hue) }}
        </td>
        <td />
      </tr>
      <!-- The band. The anchor that makes the colour below read as a table. -->
      <tr>
        <th
          v-for="(label, column) in COLUMNS"
          :key="label"
          scope="col"
          class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
          :class="opacity"
          :style="head(2, column)"
        >
          {{ label }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in props.rows" :key="row.userId">
        <th
          scope="row"
          class="truncate px-0.5 text-start font-normal transition-opacity"
          :class="opacity"
          :style="[ground(row), body(row.tick, 0)]"
        >
          {{ row.name }}
        </th>
        <td
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[guessGround(row), body(row.tick, TIP_COLUMN)]"
        >
          {{ degrees(row.hue) }}
        </td>
        <td
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[ground(row), body(row.tick, 2)]"
        >
          {{ degrees(row.deviationDeg) }}
        </td>
        <!--
          The pulse may never share an element with the fade. Tailwind's `pulse` declares only
          `50% { opacity: .5 }`, so its implicit endpoints take the element's underlying opacity
          and the animation outranks the class: on an element that also carries `opacity-0` it
          drives 0 → .5 → 0 rather than leaving it hidden, and the cell blinks into view from the
          first frame instead of waiting for its `transition-delay`. Nesting fixes it, because an
          `opacity-0` ancestor composites its whole subtree away whatever the child animates to.
        -->
        <td
          data-test="hue-scoreboard-points"
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="[opacity, row.provisional ? 'italic' : '']"
          :style="[ground(row), body(row.tick, 3)]"
        >
          <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
            pointsLabel(row.points)
          }}</span
          ><span v-if="row.provisional" class="sr-only"> (vorläufig)</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
