<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { fetchAssetBlob } from '@/api/assets'
import PlayerIcon from './PlayerIcon.vue'
import StageBar from './StageBar.vue'
import { usePlayback } from './usePlayback'
import { resolveTrack } from './api'
import { scoreRows } from './scoreboard'
import type { ScoreRow } from './scoreboard'
import type { SongSnippetSolution } from './types'

const SOLUTION_ASSET_KEY = 99
const SOLUTION_SECONDS = 30
const COLUMNS = ['Name', 'Tipp', 'Zeit', 'Pkt']

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  entries: GameEntry[]
  awardRule?: AwardRule | null
  // `| undefined` (not a bare `?`) because `SongSnippetGame` always binds this attribute — never
  // omits it — passing through its own optional prop, which can itself be `undefined`; see the
  // `exactOptionalPropertyTypes` note in `frontend.md` and `LabControls.vue`/`MemberRow.vue` for
  // the same shape.
  assetUrl?: ((key: number) => string) | undefined
}>()

const playback = usePlayback()
const loaded = ref(false)
let objectUrl: string | null = null

/** Loaded on the first tap, not on mount — browser policies want a gesture anyway. */
async function playSolution(): Promise<void> {
  if (!loaded.value && props.assetUrl) {
    const blob = await fetchAssetBlob(props.assetUrl(SOLUTION_ASSET_KEY))
    objectUrl = URL.createObjectURL(blob)
    playback.setSource(objectUrl)
    loaded.value = true
  }
  playback.restart()
}

/** Same lifecycle as the board's own snippet blob: the object URL outlives nothing beyond this
 * component. */
onUnmounted(() => {
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})

/**
 * A wrong guess can be listened to straight from Deezer — resolved fresh, never stored. One player
 * for all of them: whichever row is tapped takes it over, and `usePlayback` sees to it that the
 * solution above goes quiet when it does.
 */
const guessPlayer = usePlayback()
const playingTrackId = ref<number | null>(null)

async function toggleGuess(row: ScoreRow): Promise<void> {
  if (row.trackId === null) return
  if (isPlaying(row)) {
    guessPlayer.pause()
    return
  }
  try {
    const track = await resolveTrack(row.trackId)
    playingTrackId.value = row.trackId
    guessPlayer.setSource(track.previewUrl)
    guessPlayer.restart()
  } catch (err) {
    console.error('[song-snippet] guess preview failed', err)
  }
}

function isPlaying(row: ScoreRow): boolean {
  return playingTrackId.value === row.trackId && guessPlayer.playing.value
}

const rows = computed(() =>
  scoreRows({
    entries: props.entries,
    durations: props.durations,
    awardRule: props.awardRule ?? null,
  }),
)
const live = computed(() => rows.value.some((row) => row.provisional))

/** U+2014. An unscored row says „nothing here“, and a hyphen would read as a minus. */
function pointsLabel(points: number | null): string {
  return points === null ? '—' : String(points)
}

function ground(row: ScoreRow) {
  return { backgroundColor: row.colorHex, color: row.ink }
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- The cover lands in exactly the box the question mark held, in exactly the row the board
         lays out the same way — so resolving the round moves nothing below it. The link rides on
         the cover itself; there is no separate link line to push the bar down. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start">
      <span class="min-w-0" />
      <a
        :href="solution.link"
        target="_blank"
        rel="noopener"
        data-test="deezer-link"
        aria-label="Auf Deezer öffnen"
        title="Auf Deezer öffnen"
      >
        <img
          v-if="solution.coverUrl"
          :src="solution.coverUrl"
          alt=""
          class="h-32 w-32 rounded-xl object-cover"
          data-test="cover"
        />
        <span
          v-else
          class="flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl"
        >
          🎵
        </span>
      </a>
      <span class="min-w-0" />
    </div>

    <p class="h-6 truncate text-center text-sm leading-6" data-test="solution-line">
      {{ solution.title }} · {{ solution.artist }}
    </p>

    <StageBar
      :durations="durations"
      :total-seconds="SOLUTION_SECONDS"
      :unlocked-seconds="SOLUTION_SECONDS"
      :position-seconds="playback.positionSeconds.value"
    />

    <!-- The board's play row, same grid and same sizes, so nothing jumps on reveal. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span class="min-w-0 justify-self-end pr-4">
        <button
          type="button"
          data-test="pause-solution"
          class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-xl text-neutral-700"
          aria-label="Pause"
          @click="playback.pause()"
        >
          <PlayerIcon name="pause" />
        </button>
      </span>
      <button
        type="button"
        data-test="play-solution"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl text-neutral-900"
        aria-label="Auflösung abspielen"
        @click="playSolution"
      >
        <PlayerIcon name="play" />
      </button>
      <span class="min-w-0" />
    </div>

    <!-- Guess Hue's table, cell for cell: the near-black head band as the anchor, thin white
         gutters between the cells, and every row on its player's own colour. -->
    <table
      v-if="rows.length > 0"
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
              v-if="live"
              data-test="song-scoreboard-live"
              class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic motion-reduce:animate-none"
            >
              live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
            </span>
          </td>
        </tr>
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
        <tr v-for="row in rows" :key="row.userId">
          <th scope="row" class="truncate px-0.5 text-start font-normal" :style="ground(row)">
            {{ row.name }}
          </th>
          <td class="px-0.5" :style="ground(row)">
            <span class="flex min-w-0 items-center gap-1">
              <span class="truncate" data-test="guess-label">{{ row.guessLabel }}</span>
              <!-- Only a wrong guess is worth hearing: the right one is the solution above. -->
              <button
                v-if="!row.correct && row.trackId !== null"
                type="button"
                class="shrink-0 cursor-pointer text-sm"
                data-test="play-guess"
                :aria-label="isPlaying(row) ? 'Pause' : 'Tipp anhören'"
                @click="toggleGuess(row)"
              >
                <PlayerIcon :name="isPlaying(row) ? 'pause' : 'play'" />
              </button>
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
  </div>
</template>
