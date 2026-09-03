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
import { computed } from 'vue'
import { FADE_MS, TIP_COLUMN, cellDelayMs, headCellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
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

/**
 * Exactly as wide as the chips it holds — `size-6` (`1.5rem`) each, `gap-px` (`1px`) between —
 * instead of a fixed `w-28` that left slack for the „Lösung“/„Tipp“ bands to run past the chips.
 * Derived from `solutionChips`, never a player's row: a give-up row has none, and the solution
 * always carries the full pattern length, so this follows `PATTERN_LENGTH` wherever it goes.
 */
const tipColumnWidth = computed(() => {
  const count = props.solutionChips.length
  return `calc(${count} * 1.5rem + ${Math.max(count - 1, 0)} * 1px)`
})

/** Asked once, when the choreography would start — the same four questions the wheel asks. */
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
  <div data-test="pattern-scoreboard">
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
          data-test="pattern-scoreboard-live"
          class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
        >
          live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
        </span>
      </span>
    </div>

    <table class="mt-2 w-full table-fixed border-separate border-spacing-px">
      <colgroup>
        <col />
        <col :style="{ width: tipColumnWidth }" />
        <col v-if="timed" class="w-14" />
        <col class="w-9" />
      </colgroup>
      <thead>
        <!-- The solution lives in the head, in the tip column's own cell, so it lines up with the
             tip column by construction instead of by a right-aligned guess at its width. -->
        <tr>
          <th aria-hidden="true"></th>
          <th
            class="bg-neutral-900 px-1 text-start text-xs font-normal text-neutral-50 transition-opacity"
            :class="opacity"
            :style="head(0, TIP_COLUMN)"
          >
            Lösung
          </th>
          <th v-if="timed" aria-hidden="true"></th>
          <th aria-hidden="true"></th>
        </tr>
        <tr>
          <td aria-hidden="true"></td>
          <td class="transition-opacity" :class="opacity" :style="head(1, TIP_COLUMN)">
            <div class="flex flex-row gap-px">
              <span
                v-for="chip in props.solutionChips"
                :key="chip.value"
                data-test="solution-chip"
                class="size-6 content-center text-center font-mono text-xs"
                :style="{ backgroundColor: chip.hex, color: chip.ink }"
              >
                {{ chip.value }}
              </span>
            </div>
          </td>
          <td v-if="timed" aria-hidden="true"></td>
          <td aria-hidden="true"></td>
        </tr>
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
            class="truncate px-1 transition-opacity"
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
            <!--
              The pulse may never share an element with the fade. Tailwind's `animate-pulse`
              declares only `50% { opacity: .5 }`, so its implicit 0%/100% endpoints take the
              element's own current opacity, and a running animation outranks a plain class — so
              `animate-pulse` beside `opacity-0` would not stay hidden: it drives 0 → .5 → 0 every
              two seconds and the cell blinks into view from the first frame, ignoring the
              `transition-delay` above. Nesting fixes it: an `opacity-0` ancestor composites its
              whole subtree away whatever the child's own opacity animates to.
            -->
            <span :class="row.provisional ? 'animate-pulse motion-reduce:animate-none' : ''">{{
              row.points ?? '—'
            }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
