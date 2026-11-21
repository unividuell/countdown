<script setup lang="ts">
/**
 * „Auswertung“ for Augenmaß: the shared table with the tip as B's length and its signed distance
 * from the truth, in tenths of the round's unit. The name is a button — tapping it toggles
 * that player's outline on the reveal's field.
 *
 *                     Lösung    Toleranz*
 *   Auswertung           200,0        ±50,0
 *   Name             Tipp [cm] Abstand [cm]   Pkt
 *   anna                 160,0        −40,0     1
 *                     * bis 25 % zu groß oder zu klein
 *
 * Without B's measure the tip falls back to a factor, commas aligned (`1,90×`), the distance to
 * percent (`−23 %`).
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import { FADE_MS, headCellDelayMs, isStill } from '@/games/revealChoreography'
import { useRevealArming } from '@/ui/useRevealArming'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import DecimalAligned from './DecimalAligned.vue'
import { solutionText, toleranceText, type ScoreboardRow, type Truth } from './scoreboard'

const props = defineProps<{
  rows: ScoreboardRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
  /** Whose outlines are on the field. */
  selected: readonly string[]
  /** The true factor between A and B. */
  factor: number
  /** `null` in phase two — there is no gate there. */
  tolerance: number | null
  /** `null` without B's measure: then factors. */
  truth: Truth | null
  /** When the rows start landing: after B's growth. */
  resultsDelayMs?: number
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const solution = computed(() => solutionText(props.factor, props.truth))
const tolerance = computed(() => toleranceText(props.tolerance, props.truth))

/** The unit in the header, `Tipp [cm]`; factors carry their own `×`. */
const unit = computed(() => (props.truth === null ? '' : ` [${props.truth.unit}]`))

/** The gate in percent beneath the table, explaining the head's `±50,0`. */
const toleranceNote = computed(() => {
  if (props.truth === null || props.tolerance === null) return null

  return `* bis ${Math.round(props.tolerance * 100)} % zu groß oder zu klein`
})

/**
 * Lengths take what their widest text and the header need, nothing more: one `ch` spare for the
 * sign, the padding on top. The header stays on one line: `Abstand [mm]` measures 84 px in the
 * head's `text-xs`, about 0.44rem a character — 0.45rem keeps it single-line. Factors keep
 * `factorWidth`.
 */
function width(factorWidth: string, label: string, texts: readonly (string | null)[]): string {
  if (props.truth === null) return factorWidth

  const ch = Math.max(...texts.map((text) => text?.length ?? 0)) + 1
  const labelRem = label.length * 0.45 + 0.25

  return `max(calc(${ch}ch + 0.25rem), ${labelRem}rem)`
}

/**
 * The note arrives with the cell it explains: the tolerance sits in the head block's first row, in
 * the third grid column (name, tip, distance) — the same beat RevealScoreboard gives that cell.
 */
const { shown } = useRevealArming(isStill(props.animate))
const noteFade = {
  transitionDuration: `${FADE_MS}ms`,
  transitionDelay: `${headCellDelayMs(1, 2)}ms`,
}

const columns = computed<ScoreboardColumn<ScoreboardRow>[]>(() => [
  {
    key: 'tip',
    label: `Tipp${unit.value}`,
    fact: 'Lösung',
    width: width('3.5rem', `Tipp${unit.value}`, [
      solution.value,
      ...props.rows.map((row) => row.tip),
    ]),
    align: 'end',
    numeric: true,
  },
  {
    key: 'off',
    label: `Abstand${unit.value}`,
    ...(props.tolerance === null
      ? {}
      : { fact: toleranceNote.value === null ? 'Toleranz' : 'Toleranz*' }),
    width: width('3.5rem', `Abstand${unit.value}`, [
      tolerance.value,
      ...props.rows.map((row) => row.off),
    ]),
    align: 'end',
    numeric: true,
  },
])

/** Digits before the comma of the widest number in a column, so every comma sits on one line. */
function intCh(texts: readonly (string | null)[]): number {
  return Math.max(1, ...texts.map((text) => /^\d+/.exec(text ?? '')?.[0].length ?? 0))
}

const tipCh = computed(() => intCh([solution.value, ...props.rows.map((row) => row.tip)]))

/** What follows the factor: `×`. */
const TIP_REST_EM = 0.75

/** Like PaintRatio's head values: the solution row's ground, right-aligned like the column. */
const FACT = 'block bg-surface-container-highest px-0.5 text-end text-on-surface tabular-nums'
</script>

<template>
  <div class="flex flex-col gap-1">
    <RevealScoreboard
      :rows="props.rows"
      :columns="columns"
      caption="Alle Tipps der Runde, nach Punkten sortiert"
      :live="props.live"
      :animate="props.animate"
      :results-delay-ms="props.resultsDelayMs"
    >
      <template #name="{ row }">
        <button
          type="button"
          :data-test="`select-${row.userId}`"
          class="flex w-full cursor-pointer items-baseline gap-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
          :aria-pressed="props.selected.includes(row.userId)"
          @click="emit('select', row.userId)"
        >
          <span
            class="min-w-0 truncate"
            :class="props.selected.includes(row.userId) ? 'font-semibold underline' : ''"
            >{{ row.name }}</span
          >
        </button>
      </template>

      <!-- Tenths right-aligned in tabular digits line up by themselves; factors need help. -->
      <template #fact-tip>
        <span data-test="match-scale-solution" :class="FACT"
          ><template v-if="props.truth !== null">{{ solution }}</template
          ><DecimalAligned v-else :text="solution" :int-ch="tipCh" :rest-em="TIP_REST_EM"
        /></span>
      </template>
      <template v-if="tolerance !== null" #fact-off>
        <span data-test="match-scale-tolerance" :class="FACT">{{ tolerance }}</span>
      </template>

      <template #cell-tip="{ row }"
        ><template v-if="props.truth !== null">{{ row.tip }}</template
        ><DecimalAligned v-else :text="row.tip" :int-ch="tipCh" :rest-em="TIP_REST_EM"
      /></template>
      <template #cell-off="{ row }">{{ row.off }}</template>
    </RevealScoreboard>

    <p
      v-if="toleranceNote !== null"
      data-test="match-scale-tolerance-legend"
      class="text-end text-xs text-on-surface-variant transition-opacity"
      :class="shown ? 'opacity-100' : 'opacity-0'"
      :style="noteFade"
    >
      {{ toleranceNote }}
    </p>
  </div>
</template>
