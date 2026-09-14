<script setup lang="ts" generic="Row extends ScoreboardRow">
/**
 * „Auswertung“: every game's reveal table — the frame, never the content.
 *
 * Colour does two jobs here and both carry meaning — identity (the row *is* the player, in the
 * colour their avatar has above the card) and, where a game paints its own cell, value. Three quiet
 * things hold that together and none of them are decoration: the near-black head band as an anchor,
 * the thin white gutters between all cells, and an ink decision per cell. Take one away and it
 * stops reading as a table.
 *
 * What every game shares is this whole box: the heading and the live chip *inside* the head rather
 * than floating above it, „Name“ first and „Pkt“ last, the band, the cascade that writes the cells.
 * What differs is only what stands between those two columns, and that arrives through
 * `cell-<key>` slots — see `scoreboardColumns.ts`. The table's box is complete from the moment it
 * mounts and only its ink appears, so nothing here ever moves — see the design doc.
 */
import { computed } from 'vue'
import { FADE_MS, cellDelayMs, headCellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
import type { ScoreboardColumn, ScoreboardRow } from './scoreboardColumns'

const props = defineProps<{
  rows: Row[]
  /** The columns between „Name“ and „Pkt“. The table adds those two itself. */
  columns: ScoreboardColumn<Row>[]
  /** What the table is, for a screen reader. */
  caption: string
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /**
   * Key of the column the solution block stands over. Omitted: no solution rows at all.
   * `| undefined` (not a bare `?`) so a caller may bind it unconditionally — see the
   * `exactOptionalPropertyTypes` note in `frontend.md`.
   */
  solutionColumn?: string | undefined
  /** Width of the name column. Omitted, it takes what the fixed columns leave over. */
  nameWidth?: string | undefined
}>()

/** Grid column, so „Name“ at 0 is counted: every delay below is an index into the same row. */
const solutionColumnIndex = computed(() =>
  props.solutionColumn === undefined
    ? -1
    : props.columns.findIndex((column) => column.key === props.solutionColumn) + 1,
)
const pointsColumnIndex = computed(() => props.columns.length + 1)
const bandRow = computed(() => (solutionColumnIndex.value > 0 ? 2 : 1))

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

function body(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length))
}

function rowGround(row: Row) {
  return { backgroundColor: row.colorHex, color: row.ink }
}

function groundOf(column: ScoreboardColumn<Row>, row: Row) {
  return column.ground === undefined ? rowGround(row) : column.ground(row)
}

/** A cell with no ground is bare on both counts — see `ScoreboardColumn.ground`. */
function cellClass(column: ScoreboardColumn<Row>, row: Row) {
  if (groundOf(column, row) === null) return ''
  return [
    'px-0.5',
    column.align === 'end' ? 'text-end' : 'text-start',
    column.numeric === true ? 'tabular-nums' : '',
  ]
}

/** U+2014. An unscored row says „nothing here“, and a hyphen would read as a minus. */
function pointsLabel(points: number | null): string {
  return points === null ? '—' : String(points)
}
</script>

<template>
  <!-- `border-spacing-x` pays out its gutter before the first column and after the last too,
       which would inset the table from the card by 4px on either side. The wrapper takes those
       8px back — a block with negative side margins simply grows into them — and the table fills
       it, so the cell edges end up flush with whatever the card shows above. -->
  <div class="-mx-1">
    <table
      data-test="scoreboard"
      class="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5"
    >
      <caption class="sr-only">
        {{
          props.caption
        }}
      </caption>
      <colgroup>
        <col :style="props.nameWidth === undefined ? undefined : { width: props.nameWidth }" />
        <col
          v-for="column in props.columns"
          :key="column.key"
          :style="column.width === undefined ? undefined : { width: column.width }"
        />
        <col style="width: 2.25rem" />
      </colgroup>
      <thead>
        <!-- Head block with a solution: the heading spans both rows in column one, so it reads
             level with the solution and against the table's edge rather than floating above it,
             and the solution stands in its own column — lined up with the tips below by
             construction, not by a right-aligned guess at the column's width. -->
        <template v-if="solutionColumnIndex > 0">
          <tr>
            <td
              rowspan="2"
              class="align-middle transition-opacity"
              :class="opacity"
              :style="head(0, 0)"
            >
              <h2 class="text-2xl">Auswertung</h2>
            </td>
            <template v-for="(column, at) in props.columns" :key="column.key">
              <th
                v-if="at + 1 === solutionColumnIndex"
                :id="`${column.key}-solution`"
                class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
                :class="opacity"
                :style="head(0, solutionColumnIndex)"
              >
                Lösung
              </th>
              <td v-else aria-hidden="true"></td>
            </template>
            <td rowspan="2" class="align-bottom">
              <!-- Two elements, not one: the fade outside, the pulse inside. See the points cell. -->
              <span
                v-if="props.live"
                class="block transition-opacity"
                :class="opacity"
                :style="head(0, pointsColumnIndex)"
              >
                <span
                  data-test="scoreboard-live"
                  class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
                >
                  live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
                </span>
              </span>
            </td>
          </tr>
          <!-- `headers`, not `scope` — `scope="col"` would put „Lösung“ over the guesses below,
               whose column header is the game's own label. The cell itself is bare: a solution is
               the one value in the table that is nobody's row, so its surface comes with it. -->
          <tr>
            <template v-for="(column, at) in props.columns" :key="column.key">
              <td
                v-if="at + 1 === solutionColumnIndex"
                :headers="`${column.key}-solution`"
                class="transition-opacity"
                :class="opacity"
                :style="head(1, solutionColumnIndex)"
              >
                <slot name="solution" />
              </td>
              <td v-else aria-hidden="true"></td>
            </template>
          </tr>
        </template>
        <!-- Without a solution the head is one row: the heading runs to the live chip's column. -->
        <tr v-else>
          <td
            :colspan="props.columns.length + 1"
            class="align-bottom transition-opacity"
            :class="opacity"
            :style="head(0, 0)"
          >
            <h2 class="text-2xl">Auswertung</h2>
          </td>
          <td class="align-bottom">
            <span
              v-if="props.live"
              class="block transition-opacity"
              :class="opacity"
              :style="head(0, pointsColumnIndex)"
            >
              <span
                data-test="scoreboard-live"
                class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
              >
                live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
              </span>
            </span>
          </td>
        </tr>
        <!-- The band. The anchor that makes the colour below read as a table. -->
        <tr>
          <th
            scope="col"
            class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
            :class="opacity"
            :style="head(bandRow, 0)"
          >
            Name
          </th>
          <th
            v-for="(column, at) in props.columns"
            :key="column.key"
            scope="col"
            class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
            :class="opacity"
            :style="head(bandRow, at + 1)"
          >
            {{ column.label }}
          </th>
          <th
            scope="col"
            class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
            :class="opacity"
            :style="head(bandRow, pointsColumnIndex)"
          >
            Pkt
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in props.rows" :key="row.userId">
          <th
            scope="row"
            class="truncate px-0.5 text-start font-normal transition-opacity"
            :class="opacity"
            :style="[rowGround(row), body(row.tick, 0)]"
          >
            {{ row.name }}
          </th>
          <td
            v-for="(column, at) in props.columns"
            :key="column.key"
            :data-test="`cell-${column.key}-${row.userId}`"
            class="transition-opacity"
            :class="[opacity, cellClass(column, row)]"
            :style="[groundOf(column, row) ?? {}, body(row.tick, at + 1)]"
          >
            <slot :name="`cell-${column.key}`" :row="row" />
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
            data-test="scoreboard-points"
            class="px-0.5 text-end tabular-nums transition-opacity"
            :class="[opacity, row.provisional ? 'italic' : '']"
            :style="[rowGround(row), body(row.tick, pointsColumnIndex)]"
          >
            <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
              pointsLabel(row.points)
            }}</span
            ><span v-if="row.provisional" class="sr-only"> (vorläufig)</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
