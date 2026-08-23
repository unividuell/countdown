<script setup lang="ts">
// The band above a round: which round it is, which game, and how long it stays playable.
//
// Mounted by whoever puts a game on a page — `rounds/RoundCard.vue` and the lab's game page — the
// same rule `RoundSurface` follows, and for the same reason: board and reveal must show this in
// exactly the same place, and a header a game mounted itself is a header two crossfading games
// would stack two of.
//
// Pure props, no fetch: the lab has no round of its own and derives its numbers from the seed, so
// anything this component knew about `RoundResponse` would be a thing the lab had to fake.
import { computed } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { remainingClock, remainingReading } from '@/ui/remainingClock'
import { useSharedNow } from '@/ui/sharedClock'

const props = defineProps<{
  /** Signed, and shown signed: round 3 and round -3 are different rounds. */
  roundNumber: number | null
  title: string | null
  /** ISO instant the round closes at. `null` where there is no such thing — then no board. */
  endsAt: string | null
}>()

const now = useSharedNow()
const clock = computed(() => remainingClock(props.endsAt, now.value))
const reading = computed(() => remainingReading(props.endsAt, now.value))
</script>

<template>
  <div data-test="game-header" class="flex h-9 items-center gap-2 bg-stone-700 px-4 text-stone-50">
    <span
      v-if="roundNumber !== null"
      data-test="game-header-round"
      class="shrink-0 text-sm tabular-nums text-stone-400"
    >
      <!-- Visible: the bare number. Spoken: what it is a number of — the band is the only place
           the round is named. The colon is decoration and stays out of the reading. -->
      <span class="sr-only">Runde </span>{{ roundNumber }}<span aria-hidden="true">:</span>
    </span>
    <h1 data-test="game-header-title" class="min-w-0 flex-1 truncate text-sm font-semibold">
      {{ title }}
    </h1>
    <!-- `shrink-0`, so a long game name loses characters before the clock loses digits: the name
         is still readable truncated, a truncated readout is a wrong time. Height-driven like the
         app header's board — the viewBox ratio supplies the width. Self-describing here (nothing
         wraps it), so its own aria-label is the announcement. -->
    <FlipDotBoard
      v-if="clock !== null && reading !== null"
      data-test="game-header-clock"
      class="h-[18px] w-auto shrink-0"
      :text="clock"
      :label="reading"
    />
  </div>
</template>
