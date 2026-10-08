<script setup lang="ts">
/**
 * „Auswertung“: every guess of the round as a table, best first.
 *
 * The layout is Guess Hue's scoreboard, cell for cell, and the three quiet things that hold it
 * together are the same: the near-black head band as an anchor, thin white gutters between all
 * cells, and an ink decision per row. Colour does one job here rather than two — identity, the row
 * *is* the player, in the colour their avatar has above the card. Nothing about being right is said
 * in type or in green; the guess, the time and the score say it.
 *
 * The one thing this table does beyond showing: every guess can be played from it — the wrong ones
 * because „what did they hear instead?“ is the question a reveal leaves open, the right ones because
 * a row that plays and a row that does not would look like a verdict, and the verdict is the score.
 */
import { ref } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import PlayerIcon from './PlayerIcon.vue'
import { usePlayback } from './usePlayback'
import { resolveTrack } from './api'
import type { ScoreRow } from './scoreboard'

/**
 * The guess is by far the longest text in the table, so it takes what the other columns leave:
 * a quarter for the name (`name-width` below), enough for „15,0“, and the score's own column.
 */
const COLUMNS: ScoreboardColumn<ScoreRow>[] = [
  { key: 'tip', label: 'Tipp', align: 'start' },
  { key: 'time', label: 'Zeit [s]', width: '3rem', align: 'end', numeric: true },
]

const props = defineProps<{
  rows: ScoreRow[]
  /** True while a score can still be overtaken — then the head carries the „live“ chip. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

/**
 * A wrong guess plays straight from Deezer — resolved fresh, never stored. One player for all the
 * rows: whichever is tapped takes it over, and `usePlayback` sees to it that the solution above
 * goes quiet when it does.
 */
const player = usePlayback()
const playingTrackId = ref<number | null>(null)
/**
 * The row whose preview URL is being fetched. A tap here costs a round trip to Deezer before any
 * sound arrives, and on a phone that is long enough to look like nothing happened — so the row says
 * it is working rather than leaving the player to tap again.
 */
const resolvingTrackId = ref<number | null>(null)

async function toggle(row: ScoreRow): Promise<void> {
  if (row.trackId === null) return
  if (isPlaying(row)) {
    player.pause()
    return
  }
  resolvingTrackId.value = row.trackId
  try {
    const track = await resolveTrack(row.trackId)
    playingTrackId.value = row.trackId
    player.setSource(track.previewUrl)
    player.restart()
  } catch (err) {
    console.error('[song-snippet] guess preview failed', err)
  } finally {
    // Only the newest tap may put the spinner away; an older one leaves it to its successor.
    if (resolvingTrackId.value === row.trackId) resolvingTrackId.value = null
  }
}

/**
 * Both ask „is this row the one" — and both have to rule out the rows that are nobody's: a row
 * without a track (a player who gave up) carries `trackId: null`, which would match a `null` state
 * and claim every idle moment as its own.
 */
function isPlaying(row: ScoreRow): boolean {
  return row.trackId !== null && playingTrackId.value === row.trackId && player.playing.value
}

function isResolving(row: ScoreRow): boolean {
  return row.trackId !== null && resolvingTrackId.value === row.trackId
}
</script>

<template>
  <!-- `text-sm` rather than the table's own size: this is the one scoreboard whose tip is a long
       piece of text, and „Titel · Artist“ has to fit beside a play button. -->
  <RevealScoreboard
    v-if="props.rows.length > 0"
    class="text-sm"
    :rows="props.rows"
    :columns="COLUMNS"
    name-width="25%"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #cell-tip="{ row }">
      <!-- The button leads, so every playable row starts on the same axis and the titles line up
           behind it. A row with nothing to play has nothing to line up with: its dash sits in the
           middle of the cell instead. -->
      <span
        class="flex min-w-0 items-center gap-1"
        :class="row.trackId === null ? 'justify-center' : ''"
      >
        <span
          v-if="isResolving(row)"
          class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current motion-reduce:animate-none"
          data-test="guess-spinner"
          role="status"
          aria-label="Tipp wird geladen"
        />
        <button
          v-else-if="row.trackId !== null"
          type="button"
          class="shrink-0 cursor-pointer text-sm"
          data-test="play-guess"
          :aria-label="isPlaying(row) ? 'Pause' : 'Tipp anhören'"
          @click="toggle(row)"
        >
          <PlayerIcon :name="isPlaying(row) ? 'pause' : 'play'" />
        </button>
        <span class="truncate" data-test="guess-label">{{ row.guessLabel }}</span>
      </span>
    </template>

    <template #cell-time="{ row }">{{ row.timeLabel }}</template>
  </RevealScoreboard>
</template>
