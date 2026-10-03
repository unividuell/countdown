<script setup lang="ts">
/**
 * „Auswertung“ for Entstauber. The table is `RevealScoreboard`; this file decides the three columns,
 * the round's two facts above them (tempo and size, as in the original), and the name cell — a
 * button, because the rows are the curve's legend: tapping one brings that player's line forward.
 * A run's marks (a warning sign: implausible, a turning arrow: after a reload) stand behind the
 * name. Icons, not U+26A0 or U+21BB: phones draw the warning sign as a yellow emoji. Units stand in brackets
 * on the header, never on a value.
 *
 * The warning's hint names the server's reasons to a super-admin only: the other players learn that
 * a run is marked, not the rule that caught it.
 */
import { computed } from 'vue'
import IconRestarted from '~icons/lucide/rotate-cw'
import IconWarning from '~icons/lucide/triangle-alert'
import { useAuth } from '@/auth/useAuth'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import DedusterMark from './DedusterMark.vue'
import type { DedusterRow } from './scoreboard'
import { MIN_HUMAN_MS, type DedusterImplausible } from './types'

const props = defineProps<{
  rows: DedusterRow[]
  live: boolean
  animate: boolean
  selectedUserId: string | null
  intervalMs: number
  tiles: number
}>()

const thousands = new Intl.NumberFormat('de-DE')

const emit = defineEmits<{ select: [userId: string] }>()

const { user } = useAuth()

const IMPLAUSIBLE_HINT = 'Unplausible Zeiten in diesem Lauf'
const RESTARTED_HINT = 'Nach dem Neuladen gespielt'
const REASONS: Record<DedusterImplausible, string> = {
  REACTION_BELOW_HUMAN: `Reaktion unter ${MIN_HUMAN_MS} ms`,
  REACTION_ABOVE_BEAT: 'Reaktion über dem Takt',
  SUBMITTED_BEFORE_RUN_END: 'vor dem Laufende eingegangen',
}

function implausibleHint(row: DedusterRow): string {
  if (user.value?.isSuperAdmin !== true) return IMPLAUSIBLE_HINT
  return `${IMPLAUSIBLE_HINT}: ${row.implausible.map((reason) => REASONS[reason]).join(' · ')}`
}

// 3.75rem: „Max [ms]“ and „Level [%]“ need 53 px at the band's text-xs; 3.5rem leaves 52.
const columns = computed<ScoreboardColumn<DedusterRow>[]>(() => [
  { key: 'avg', label: '⌀ [ms]', fact: 'Max [ms]', width: '3.75rem', align: 'end', numeric: true },
  {
    key: 'level',
    label: 'Level [%]',
    fact: 'Levels',
    width: '3.75rem',
    align: 'end',
    numeric: true,
  },
  // 5.75rem: „mit Applaus“ needs 86 px at body size; 5.5rem leaves 84 and wraps it.
  { key: 'out', label: 'raus', width: '5.75rem' },
])
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Läufe der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <!-- The marks follow the name and never shrink: a long name truncates, the mark stays. -->
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="flex w-full cursor-pointer items-baseline gap-1 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        :aria-pressed="props.selectedUserId === row.userId"
        @click="emit('select', row.userId)"
      >
        <span
          class="min-w-0 truncate"
          :class="props.selectedUserId === row.userId ? 'font-semibold underline' : ''"
          >{{ row.name }}</span
        >
        <DedusterMark
          v-if="row.implausible.length > 0"
          :data-test="`mark-implausible-${row.userId}`"
          :hint="implausibleHint(row)"
          ><IconWarning class="size-[1em]" aria-hidden="true"
        /></DedusterMark>
        <DedusterMark
          v-if="row.restarted"
          :data-test="`mark-restarted-${row.userId}`"
          :hint="RESTARTED_HINT"
          ><IconRestarted class="size-[1em]" aria-hidden="true"
        /></DedusterMark>
      </button>
    </template>

    <template #fact-avg>
      <span data-test="fact-max" class="block px-0.5 text-end tabular-nums">{{
        thousands.format(props.intervalMs)
      }}</span>
    </template>
    <template #fact-level>
      <span data-test="fact-levels" class="block px-0.5 text-end tabular-nums">{{
        props.tiles
      }}</span>
    </template>

    <template #cell-avg="{ row }">{{ row.averageLabel }}</template>
    <template #cell-level="{ row }">{{ row.levelLabel }}</template>
    <template #cell-out="{ row }">{{ row.out ?? '—' }}</template>
  </RevealScoreboard>
</template>
