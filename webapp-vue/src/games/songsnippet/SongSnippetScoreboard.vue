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
import PlayerIcon from './PlayerIcon.vue'
import { usePlayback } from './usePlayback'
import { resolveTrack } from './api'
import type { ScoreRow } from './scoreboard'

const COLUMNS = ['Name', 'Tipp', 'Zeit', 'Pkt']

const props = defineProps<{
  rows: ScoreRow[]
  /** True while a score can still be overtaken — then the head carries the „live“ chip. */
  live: boolean
}>()

/**
 * A wrong guess plays straight from Deezer — resolved fresh, never stored. One player for all the
 * rows: whichever is tapped takes it over, and `usePlayback` sees to it that the solution above
 * goes quiet when it does.
 */
const player = usePlayback()
const playingTrackId = ref<number | null>(null)

async function toggle(row: ScoreRow): Promise<void> {
  if (row.trackId === null) return
  if (isPlaying(row)) {
    player.pause()
    return
  }
  try {
    const track = await resolveTrack(row.trackId)
    playingTrackId.value = row.trackId
    player.setSource(track.previewUrl)
    player.restart()
  } catch (err) {
    console.error('[song-snippet] guess preview failed', err)
  }
}

function isPlaying(row: ScoreRow): boolean {
  return playingTrackId.value === row.trackId && player.playing.value
}

/** U+2014. An unscored row says „nothing here“, and a hyphen would read as a minus. */
function pointsLabel(points: number | null): string {
  return points === null ? '—' : String(points)
}

function ground(row: ScoreRow) {
  return { backgroundColor: row.colorHex, color: row.ink }
}
</script>

<template>
  <table
    v-if="props.rows.length > 0"
    data-test="song-scoreboard"
    class="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5 text-sm"
  >
    <caption class="sr-only">
      Alle Tipps der Runde, nach Punkten sortiert
    </caption>
    <!-- The guess is the longest text in the table, so it gets what the other three do not need:
         a third for the name, and just enough for a „15s“ and a two-digit score. -->
    <colgroup>
      <col class="w-1/3" />
      <col />
      <col class="w-10" />
      <col class="w-8" />
    </colgroup>
    <thead>
      <tr>
        <td colspan="2" class="align-bottom">
          <h2 class="text-2xl">Auswertung</h2>
        </td>
        <td />
        <td class="align-bottom">
          <span
            v-if="props.live"
            data-test="song-scoreboard-live"
            class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
          >
            live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
          </span>
        </td>
      </tr>
      <!-- The band. The anchor that makes the colour below read as a table. -->
      <tr>
        <th
          v-for="label in COLUMNS"
          :key="label"
          scope="col"
          class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white"
        >
          {{ label }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in props.rows" :key="row.userId">
        <th scope="row" class="truncate px-0.5 text-start font-normal" :style="ground(row)">
          {{ row.name }}
        </th>
        <td class="px-0.5" :style="ground(row)">
          <!-- The button leads, so every playable row starts on the same axis and the titles line
               up behind it. A row with nothing to play has nothing to line up with: its dash sits
               in the middle of the cell instead. -->
          <span
            class="flex min-w-0 items-center gap-1"
            :class="row.trackId === null ? 'justify-center' : ''"
          >
            <button
              v-if="row.trackId !== null"
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
        </td>
        <td class="px-0.5 text-end tabular-nums" :style="ground(row)">{{ row.timeLabel }}</td>
        <td
          data-test="song-scoreboard-points"
          class="px-0.5 text-end tabular-nums"
          :class="row.provisional ? 'italic' : ''"
          :style="ground(row)"
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
