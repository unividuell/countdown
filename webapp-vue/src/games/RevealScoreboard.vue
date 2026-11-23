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
 * The clock before „Pkt“ is shared too, whenever a row has one: like the name and the points it is
 * the entry's own (`GameEntry.durationMs`). What differs is only what stands between „Name“ and the
 * clock, and that arrives through `cell-<key>` slots — see `scoreboardColumns.ts`. The table's box
 * is complete from the moment it mounts and only its ink appears, so nothing here ever moves — see
 * the design doc.
 *
 * A column may name its unit (`unit: 'cm'`): a band row beneath the whole table prints `[cm]`
 * under that column only, so a label stays short and its column narrow.
 *
 *   Name           Tipp  Abstand   Zeit   Pkt
 *   anna            160      −40  01:05     1
 *                  [cm]     [cm]  [mm:ss]
 *
 * Rows that are no player's — Anmaßung's Kollektiv Kommune — come through the `foot` slot, which
 * gets the table's columns (the clock included) and stands above the units.
 *
 * A game may fill the name cell through the `name` slot — Entstauber puts a button there that picks
 * the player's line in its curve.
 */
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { hasDurations } from '@/games/durations'
import {
  FADE_MS,
  RESULTS_DELAY_MS,
  cellDelayMs,
  headCellDelayMs,
  isStill,
} from '@/games/revealChoreography'
import { announceResults } from '@/ui/resultsLanding'
import { useRevealArming } from '@/ui/useRevealArming'
import type { ScoreboardColumn, ScoreboardRow } from './scoreboardColumns'

const props = defineProps<{
  rows: Row[]
  /** The game's columns, after „Name“. The table adds „Name“, the clock and „Pkt“ itself. */
  columns: ScoreboardColumn<Row>[]
  /** What the table is, for a screen reader. */
  caption: string
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** Width of the name column. Omitted, it takes what the fixed columns leave over. */
  nameWidth?: string | undefined
  /** When the rows start landing, where a game's own reveal runs past `RESULTS_DELAY_MS`. */
  resultsDelayMs?: number | undefined
  /**
   * Rows wait while true, for a game whose verdict comes at a moment only known at runtime
   * (Verrohrung's end sound). Released, they land from that moment on.
   */
  resultsHeld?: boolean | undefined
}>()

const clock: ScoreboardColumn<Row> = {
  key: 'clock',
  label: 'Zeit',
  unit: 'mm:ss',
  width: '3.5rem',
  align: 'end',
}

/** The game's columns, then the clock whenever a row has one. */
const tableColumns = computed(() =>
  hasDurations(props.rows) ? [...props.columns, clock] : props.columns,
)

/** Grid column, so „Name“ at 0 is counted: every delay below is an index into the same row. */
const pointsColumnIndex = computed(() => tableColumns.value.length + 1)
/** Two head rows when any column carries a fact — a solution, a round's tempo. */
const hasHeadBlock = computed(() => tableColumns.value.some((column) => column.fact !== undefined))
const bandRow = computed(() => (hasHeadBlock.value ? 2 : 1))
/** A band row beneath the table whenever a column names its unit. */
const hasUnits = computed(() => tableColumns.value.some((column) => column.unit !== undefined))

const still = isStill(props.animate)

/** Held from the start, the rows count from their release rather than from mount. */
const heldAtMount = props.resultsHeld === true
const resultsDelayMs = heldAtMount ? 0 : (props.resultsDelayMs ?? RESULTS_DELAY_MS)

/**
 * The first row landing is news the roster must not tell first (`ui/resultsLanding`). Only a
 * reveal that just happened here announces: a reload or the history lands no news.
 */
let landing: ReturnType<typeof setTimeout> | undefined

const { shown } = useRevealArming(still, () => {
  if (props.animate && !heldAtMount) landing = setTimeout(announceResults, resultsDelayMs)
})

onMounted(() => {
  if (props.animate && still && !heldAtMount) announceResults()
})

watch(
  () => props.resultsHeld,
  (held) => {
    if (props.animate && !held) announceResults()
  },
)

onBeforeUnmount(() => clearTimeout(landing))

const opacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))
const rowOpacity = computed(() =>
  shown.value && props.resultsHeld !== true ? 'opacity-100' : 'opacity-0',
)

function fade(delayMs: number) {
  return { transitionDuration: `${FADE_MS}ms`, transitionDelay: `${delayMs}ms` }
}

function head(row: number, column: number) {
  return fade(headCellDelayMs(row, column))
}

function body(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length, resultsDelayMs))
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
          v-for="column in tableColumns"
          :key="column.key"
          :style="column.width === undefined ? undefined : { width: column.width }"
        />
        <!-- 2rem: three digits need 29 px at body size, the 1px inset leaves 30. The live chip is
             wider; it overhangs to the left, into the head's empty cells. -->
        <col style="width: 2rem" />
      </colgroup>
      <thead>
        <!-- Head block with facts — the solution, a round's tempo: the heading spans both rows in
             column one, so it reads level with them and against the table's edge rather than
             floating above it, and each fact stands in its own column — lined up with the tips
             below by construction, not by a right-aligned guess at the column's width. -->
        <template v-if="hasHeadBlock">
          <tr>
            <td
              rowspan="2"
              class="align-middle transition-opacity"
              :class="opacity"
              :style="head(0, 0)"
            >
              <h2 class="text-2xl">Auswertung</h2>
            </td>
            <template v-for="(column, at) in tableColumns" :key="column.key">
              <th
                v-if="column.fact !== undefined"
                :id="`${column.key}-fact`"
                class="bg-inverse-surface px-0.5 text-start text-xs font-normal text-inverse-on-surface transition-opacity"
                :class="opacity"
                :style="head(0, at + 1)"
              >
                {{ column.fact }}
              </th>
              <td v-else aria-hidden="true"></td>
            </template>
            <td rowspan="2" class="align-bottom">
              <!-- Two elements, not one: the fade outside, the pulse inside. See the points cell. -->
              <span
                v-if="props.live"
                class="flex justify-end transition-opacity"
                :class="opacity"
                :style="head(0, pointsColumnIndex)"
              >
                <span
                  data-test="scoreboard-live"
                  class="bg-live shrink-0 animate-pulse rounded-md px-1.5 text-center text-sm text-on-live italic motion-reduce:animate-none"
                >
                  live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
                </span>
              </span>
            </td>
          </tr>
          <!-- `headers`, not `scope` — `scope="col"` would put „Lösung“ over the guesses below,
               whose column header is the game's own label. The cell itself is bare: a fact is no
               player's row, so its surface — or none — comes with it. -->
          <tr>
            <template v-for="(column, at) in tableColumns" :key="column.key">
              <td
                v-if="column.fact !== undefined"
                :headers="`${column.key}-fact`"
                class="transition-opacity"
                :class="opacity"
                :style="head(1, at + 1)"
              >
                <slot :name="`fact-${column.key}`" />
              </td>
              <td v-else aria-hidden="true"></td>
            </template>
          </tr>
        </template>
        <!-- With neither the head is one row: the heading runs to the live chip's column. -->
        <tr v-else>
          <td
            :colspan="tableColumns.length + 1"
            class="align-bottom transition-opacity"
            :class="opacity"
            :style="head(0, 0)"
          >
            <h2 class="text-2xl">Auswertung</h2>
          </td>
          <td class="align-bottom">
            <span
              v-if="props.live"
              class="flex justify-end transition-opacity"
              :class="opacity"
              :style="head(0, pointsColumnIndex)"
            >
              <span
                data-test="scoreboard-live"
                class="bg-live shrink-0 animate-pulse rounded-md px-1.5 text-center text-sm text-on-live italic motion-reduce:animate-none"
              >
                live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
              </span>
            </span>
          </td>
        </tr>
        <!-- The band. The anchor that makes the colour below read as a table. -->
        <tr data-test="scoreboard-band">
          <th
            scope="col"
            class="bg-inverse-surface px-0.5 text-start text-xs font-normal text-inverse-on-surface transition-opacity"
            :class="opacity"
            :style="head(bandRow, 0)"
          >
            Name
          </th>
          <th
            v-for="(column, at) in tableColumns"
            :key="column.key"
            scope="col"
            class="bg-inverse-surface px-0.5 text-start text-xs font-normal text-inverse-on-surface transition-opacity"
            :class="opacity"
            :style="head(bandRow, at + 1)"
          >
            {{ column.label }}
          </th>
          <th
            scope="col"
            class="bg-inverse-surface px-0.5 text-start text-xs font-normal text-inverse-on-surface transition-opacity"
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
            :class="rowOpacity"
            :style="[rowGround(row), body(row.tick, 0)]"
          >
            <slot name="name" :row="row">{{ row.name }}</slot>
          </th>
          <td
            v-for="(column, at) in tableColumns"
            :key="column.key"
            :data-test="`cell-${column.key}-${row.userId}`"
            class="transition-opacity"
            :class="[rowOpacity, cellClass(column, row)]"
            :style="[groundOf(column, row) ?? {}, body(row.tick, at + 1)]"
          >
            <span v-if="column === clock" class="font-mono text-xs">{{
              row.durationLabel ?? '—'
            }}</span>
            <slot v-else :name="`cell-${column.key}`" :row="row" />
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
            class="px-px text-end tabular-nums transition-opacity"
            :class="[rowOpacity, row.provisional ? 'italic' : '']"
            :style="[rowGround(row), body(row.tick, pointsColumnIndex)]"
          >
            <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
              pointsLabel(row.points)
            }}</span
            ><span v-if="row.provisional" class="sr-only"> (vorläufig)</span>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="hasUnits || $slots.foot !== undefined">
        <slot name="foot" :columns="tableColumns" />
        <!-- The units, in the band's dress, under the whole table and only beneath the columns that
             have one: the labels above stay short, the columns narrow. -->
        <tr v-if="hasUnits" data-test="scoreboard-units">
          <td aria-hidden="true"></td>
          <template v-for="(column, at) in tableColumns" :key="column.key">
            <th
              v-if="column.unit !== undefined"
              scope="col"
              class="bg-inverse-surface px-0.5 text-end text-xs font-normal whitespace-nowrap text-inverse-on-surface transition-opacity"
              :class="opacity"
              :style="head(bandRow + 1, at + 1)"
            >
              {{ column.unitName }}[{{ column.unit }}]
            </th>
            <td v-else aria-hidden="true"></td>
          </template>
          <td aria-hidden="true"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
