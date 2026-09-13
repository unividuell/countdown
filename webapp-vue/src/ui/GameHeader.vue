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
import { BAND_PAD, type Tone } from '@/ui/flipdot/board'
import { elapsedClock, elapsedReading } from '@/ui/elapsedClock'
import { remainingClock, remainingReading } from '@/ui/remainingClock'
import type { PlayClock } from '@/ui/useStartCeremony'
import { useSharedNow } from '@/ui/sharedClock'

const props = withDefaults(
  defineProps<{
    /** Signed, and shown signed: round 3 and round -3 are different rounds. */
    roundNumber: number | null
    title: string | null
    /** ISO instant the round closes at. `null` where there is no such thing — then no board. */
    endsAt: string | null
    /**
     * The timed play's own face, while there is one. `null` — the round countdown — is what every
     * caller without a play of its own passes, which is all of them but two.
     */
    play?: PlayClock | null
    /**
     * Whether the round is scored „winner takes it all“. Colours one thing — the number. The
     * dots stay white: the running stopwatch is already amber, and a timed play only exists in
     * this phase, so amber on both would stop telling the two readouts apart.
     */
    phaseTwo?: boolean
  }>(),
  { play: null, phaseTwo: false },
)

const now = useSharedNow()

/**
 * What the waiting field is a field OF. Never read — a solid field covers every dot of it — so
 * this string is here for its width alone: the stopwatch's own, so the answer arriving flips the
 * digits out of the field instead of resizing the board once more while the play is under way.
 */
const WAITING_WIDTH = '00:00'

/**
 * What the board reads, says and wears — derived in one place, so the faces cannot disagree about
 * which of them is showing.
 */
const face = computed<{ text: string; label: string; tone: Tone; solid: boolean } | null>(() => {
  const play = props.play

  if (play?.phase === 'start') {
    // A bare digit: all three beats are one glyph wide, so they flip into one another instead of
    // relighting the board three times in three seconds.
    return {
      text: play.beat,
      label: `Start in ${play.beat} ${play.beat === '1' ? 'Sekunde' : 'Sekunden'}`,
      tone: 'alarm',
      solid: false,
    }
  }

  // The reveal is in flight, and the lit field is what says so. It costs no state of its own: the
  // board flips into a bitmap of the same width and back out of it when the answer lands.
  if (play?.phase === 'waiting') {
    return { text: WAITING_WIDTH, label: 'Wird aufgedeckt', tone: 'alarm', solid: true }
  }

  const [text, label] =
    play?.phase === 'running'
      ? [elapsedClock(play.since, now.value), elapsedReading(play.since, now.value)]
      : [remainingClock(props.endsAt, now.value), remainingReading(props.endsAt, now.value)]

  if (text === null || label === null) return null
  return { text, label, tone: play?.phase === 'running' ? 'alarm' : 'default', solid: false }
})
</script>

<template>
  <!-- No gutter on the right while a board is up: the dot field is what meets the card's edge, and
       the blank columns inside it are the gutter. Without a board there is nothing to meet it, so
       the band pays for its own. -->
  <div
    data-test="game-header"
    class="flex h-9 items-center gap-2 bg-stone-700 pl-4 text-stone-50"
    :class="{ 'pr-4': face === null }"
  >
    <span
      v-if="roundNumber !== null"
      data-test="game-header-round"
      class="shrink-0 text-sm tabular-nums"
      :class="phaseTwo ? 'text-phase-two' : 'text-phase-one'"
    >
      <!-- Visible: the bare number. Spoken: what it is a number of — the band is the only place
           the round is named. -->
      <span class="sr-only">Runde </span>{{ roundNumber }}
    </span>
    <h1 data-test="game-header-title" class="min-w-0 flex-1 truncate text-sm font-semibold">
      {{ title }}
    </h1>
    <!-- `shrink-0`, so a long game name loses characters before the clock loses digits: the name
         is still readable truncated, a truncated readout is a wrong time. Height-driven like the
         app header's board — the viewBox ratio supplies the width. Self-describing here (nothing
         wraps it), so its own aria-label is the announcement. -->
    <FlipDotBoard
      v-if="face !== null"
      data-test="game-header-clock"
      class="h-full w-auto shrink-0"
      :text="face.text"
      :label="face.label"
      :tone="face.tone"
      :solid="face.solid"
      :pad="BAND_PAD"
    />
  </div>
</template>
