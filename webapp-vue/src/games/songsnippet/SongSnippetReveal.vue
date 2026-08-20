<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { GameEntry } from '@/games/GameEntry'
import { fetchAssetBlob } from '@/api/assets'
import StageBar from './StageBar.vue'
import { usePlayback } from './usePlayback'
import { resolveTrack } from './api'
import type { SongSnippetSolution } from './types'

const SOLUTION_ASSET_KEY = 99
const SOLUTION_SECONDS = 30

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  entries: GameEntry[]
  mineUserId: string | null
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

/** A wrong guess row can be listened to straight from Deezer — resolved fresh, never stored. */
const guessPlayer = usePlayback()
async function playGuess(entry: GameEntry): Promise<void> {
  const guess = entry.guess as { trackId?: number } | null
  if (!guess?.trackId) return
  try {
    const track = await resolveTrack(guess.trackId)
    guessPlayer.setSource(track.previewUrl)
    guessPlayer.restart()
  } catch (err) {
    console.error('[song-snippet] guess preview failed', err)
  }
}

function guessLabel(entry: GameEntry): string {
  const guess = entry.guess as { artist?: string; title?: string } | null
  if (!guess?.title) return '— aufgegeben —'
  return `${guess.artist ?? '?'} — ${guess.title}`
}
function isCorrect(entry: GameEntry): boolean {
  return (entry.outcome as { correct?: boolean } | null)?.correct === true
}
const sorted = computed(() => [...props.entries].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)))
</script>

<template>
  <div class="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- Same slot the question mark held - the layout does not jump. -->
    <img
      v-if="solution.coverUrl"
      :src="solution.coverUrl"
      alt=""
      class="mx-auto h-32 w-32 rounded-xl object-cover"
      data-test="cover"
    />
    <div
      v-else
      class="mx-auto flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl"
    >
      🎵
    </div>

    <p class="text-center">
      <span class="block text-base font-semibold">{{ solution.title }}</span>
      <span class="block text-sm text-neutral-500">{{ solution.artist }}</span>
      <a
        :href="solution.link"
        target="_blank"
        rel="noopener"
        class="text-xs text-neutral-400 underline"
      >
        Auf Deezer öffnen
      </a>
    </p>

    <StageBar
      :durations="durations"
      :total-seconds="SOLUTION_SECONDS"
      :unlocked-seconds="SOLUTION_SECONDS"
      :position-seconds="playback.positionSeconds.value"
    />

    <!-- Same grid as the board's play row (Task 14's `minmax(0,1fr)` fix on both side tracks) so
         the button stays centered and the layout does not shift on reveal. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span class="min-w-0" />
      <button
        type="button"
        data-test="play-solution"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl"
        aria-label="Auflösung abspielen"
        @click="playSolution"
      >
        ▶
      </button>
      <span class="flex min-w-0 items-center justify-self-start pl-4">
        <button
          type="button"
          class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-sm"
          aria-label="Pause"
          @click="playback.pause()"
        >
          ⏸
        </button>
      </span>
    </div>

    <table class="w-full text-sm" data-test="song-scoreboard">
      <tbody>
        <tr
          v-for="entry in sorted"
          :key="entry.userId"
          :class="entry.userId === mineUserId ? 'font-semibold' : ''"
        >
          <td class="py-1 pr-2">{{ entry.username }}</td>
          <td class="min-w-0 py-1 pr-2">
            <span :class="isCorrect(entry) ? 'text-emerald-700' : 'text-neutral-500'">
              {{ guessLabel(entry) }}
            </span>
            <button
              v-if="!isCorrect(entry) && (entry.guess as { trackId?: number } | null)?.trackId"
              type="button"
              class="ml-1 cursor-pointer text-xs underline"
              data-test="play-guess"
              @click="playGuess(entry)"
            >
              anhören
            </button>
          </td>
          <td class="py-1 pr-2 text-right font-mono text-xs text-neutral-500">
            {{ entry.stage != null ? `${durations[entry.stage] ?? '?'}s` : '' }}
          </td>
          <td class="py-1 text-right font-mono">{{ entry.points ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
