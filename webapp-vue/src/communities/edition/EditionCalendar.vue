<script setup lang="ts">
/**
 * An edition's rounds as a week grid, display only. Columns are weeks (Mon–Sun), one cell per
 * round; tapping a cell shows its detail line below.
 *
 *   Nov.        Dez.
 *   .  ▪  ▪  ▪  ▪        <- Mon
 *   .  ▪  ▪  ▪  ▪        <- Tue
 *   ▪  ▪  ▪  ▪  ▪        <- Wed ...
 *
 * Only the grid scrolls sideways, inside its own container; the page never does.
 */
import { computed, ref } from 'vue'
import IconLock from '~icons/lucide/lock'
import type { CellKind, GridCell } from './editionGrid'

const props = defineProps<{ cells: GridCell[] }>()

const KIND_LABEL: Record<CellKind, string> = {
  none: 'kein Spiel',
  'phase-one': 'Phase 1',
  'phase-two': 'Phase 2',
  target: 'Ziel',
}

const KIND_COLOR: Record<CellKind, string> = {
  none: 'bg-stone-200',
  'phase-one': 'bg-phase-one',
  'phase-two': 'bg-phase-two',
  target: 'bg-stone-900',
}

/** The tapped round, not its cell: the cells recompute while the form is edited. */
const selectedRound = ref<number | null>(null)

const selected = computed(() => props.cells.find((c) => c.round === selectedRound.value) ?? null)

/** Monday-padding in front, so that the first cell lands on its weekday row. */
const padBefore = computed(() => (props.cells.length ? props.cells[0]!.start.weekday - 1 : 0))

/** Fills the last week, so that the grid always has whole columns. */
const padAfter = computed(() =>
  (padBefore.value + props.cells.length) % 7 === 0
    ? 0
    : 7 - ((padBefore.value + props.cells.length) % 7),
)

/**
 * The month name goes above the column holding a month's first cell; the first column always has
 * one. A column gets at most one label: when the first cell and a 1st share a week, the later
 * month wins.
 */
const months = computed(() => {
  const byColumn = new Map<number, string>()
  props.cells.forEach((c, i) => {
    if (i === 0 || c.start.day === 1) {
      byColumn.set(
        Math.floor((padBefore.value + i) / 7) + 1,
        c.start.setLocale('de').toFormat('MMM'),
      )
    }
  })

  return [...byColumn].map(([column, label]) => ({ column, label }))
})

const columns = computed(() => Math.ceil((padBefore.value + props.cells.length) / 7))

const detail = computed(() => {
  const c = selected.value
  if (!c) return ''

  const parts = [
    `Runde ${c.round}`,
    c.start.setLocale('de').toFormat('EEE, d. MMM HH:mm'),
    KIND_LABEL[c.kind],
  ]
  if (c.today) parts.push('heute')
  if (c.freezesHere) parts.push('ab hier fix')

  return parts.join(' · ')
})

/** Legend entries; `sample` says how to draw the swatch, mirroring the cell styling. */
const LEGEND: { label: string; kind?: CellKind; sample?: 'today' | 'fix' }[] = [
  { label: 'kein Spiel', kind: 'none' },
  { label: 'Phase 1', kind: 'phase-one' },
  { label: 'Phase 2', kind: 'phase-two' },
  { label: 'Ziel', kind: 'target' },
  { label: 'heute', sample: 'today' },
  { label: 'ab hier fix', sample: 'fix' },
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div data-test="edition-scroll" class="overflow-x-auto p-1">
      <div class="grid w-max gap-1" :style="{ gridTemplateColumns: `repeat(${columns}, 2.5rem)` }">
        <span
          v-for="m in months"
          :key="m.column"
          data-test="edition-month"
          class="text-xs text-neutral-500"
          :style="{ gridColumn: m.column, gridRow: 1 }"
          >{{ m.label }}</span
        >
      </div>

      <div
        data-test="edition-grid"
        class="mt-1 grid w-max grid-flow-col gap-1"
        :style="{ gridTemplateRows: 'repeat(7, 2.5rem)', gridAutoColumns: '2.5rem' }"
      >
        <span v-for="i in padBefore" :key="`pre-${i}`" data-test="edition-pad" />

        <button
          v-for="c in cells"
          :key="c.round"
          type="button"
          data-test="edition-cell"
          :data-round="c.round"
          class="relative flex size-10 cursor-pointer items-center justify-center rounded text-xs"
          :class="[
            KIND_COLOR[c.kind],
            c.kind === 'none' ? 'text-neutral-600' : 'text-white',
            c.today ? 'ring-2 ring-neutral-900 ring-offset-1' : '',
            c.freezesHere ? 'border-l-4 border-red-600' : '',
            selected?.round === c.round ? 'outline-2 outline-sky-500' : '',
          ]"
          :aria-label="`Runde ${c.round}`"
          @click="selectedRound = c.round"
        >
          {{ c.start.day }}
          <IconLock
            v-if="c.freezesHere"
            class="absolute right-0.5 top-0.5 size-3"
            aria-hidden="true"
          />
        </button>

        <span v-for="i in padAfter" :key="`post-${i}`" data-test="edition-pad" />
      </div>
    </div>

    <p data-test="edition-detail" class="min-h-5 text-sm text-neutral-700">{{ detail }}</p>

    <ul data-test="edition-legend" class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      <li v-for="l in LEGEND" :key="l.label" class="flex items-center gap-1.5">
        <span
          class="relative flex size-4 items-center justify-center rounded"
          :class="[
            l.kind ? KIND_COLOR[l.kind] : 'bg-stone-200',
            l.sample === 'today' ? 'ring-2 ring-neutral-900 ring-offset-1' : '',
            l.sample === 'fix' ? 'border-l-4 border-red-600' : '',
          ]"
          aria-hidden="true"
        >
          <IconLock v-if="l.sample === 'fix'" class="size-3" />
        </span>
        {{ l.label }}
      </li>
    </ul>
  </div>
</template>
