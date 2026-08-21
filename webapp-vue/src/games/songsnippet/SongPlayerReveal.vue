<script setup lang="ts">
/**
 * The song after the round: the cover where the question mark stood, its name, the full 30s bar,
 * and a transport row identical to the board's — the solution as something you look at and play,
 * the counterpart of the board's guessing head.
 *
 * Every box here is the size and the place the board's own head gives it, which is what keeps the
 * scoreboard below from moving when the round resolves.
 */
import { onUnmounted, ref } from 'vue'
import { fetchAssetBlob } from '@/api/assets'
import PlayerIcon from './PlayerIcon.vue'
import StageBar from './StageBar.vue'
import { usePlayback } from './usePlayback'
import type { SongSnippetSolution } from './types'

const SOLUTION_ASSET_KEY = 99
const SOLUTION_SECONDS = 30

const props = defineProps<{
  solution: SongSnippetSolution
  durations: number[]
  // `| undefined` (not a bare `?`) because the reveal always binds this attribute — never omits
  // it — passing through its own optional prop, which can itself be `undefined`; see the
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
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The cover lands in exactly the box the question mark held, in exactly the row the board
         lays out the same way. The link rides on the cover itself; there is no separate link line
         to push the bar down. -->
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
  </div>
</template>
