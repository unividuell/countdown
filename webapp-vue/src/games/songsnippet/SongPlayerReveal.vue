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
import PlayButton from './PlayButton.vue'
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
/** The board's reason, on this side of the round: a fetch can outlive the card that started it. */
let alive = true
/**
 * One fetch, however impatiently the button is tapped. `loaded` cannot do this job on its own — it
 * is set after the await, so every tap before the first answer would start another fetch, and of the
 * object URLs they created only the last would ever be revoked. A ref rather than a plain flag,
 * because the button draws its waiting ring from it: 30 seconds of hook is a longer wait than the
 * board's own, and the first tap pays for it.
 */
const loading = ref(false)

/** Loaded on the first tap, not on mount — browser policies want a gesture anyway. */
async function playSolution(): Promise<void> {
  if (!loaded.value && props.assetUrl) {
    if (loading.value) return
    loading.value = true
    try {
      const blob = await fetchAssetBlob(props.assetUrl(SOLUTION_ASSET_KEY))
      if (!alive) return
      objectUrl = URL.createObjectURL(blob)
      playback.setSource(objectUrl)
      loaded.value = true
    } catch (err) {
      // The board logs its own failed stage the same way. Without this, a failed solution fetch
      // leaves an unhandled rejection behind, since a click handler's promise has no other owner.
      console.error('[song-snippet] solution audio failed', err)
      return
    } finally {
      loading.value = false
    }
  }
  playback.restart()
}

/** Same lifecycle as the board's own snippet blob: the object URL outlives nothing beyond this
 * component. */
onUnmounted(() => {
  alive = false
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- The cover lands at the height the board's band of hits held, and at the size one of those
         covers had — `song-cover` is that one measurement, shared by both screens. The link rides
         on the cover itself; there is no separate link line to push the bar down. -->
    <div class="flex justify-center">
      <a
        :href="solution.link"
        target="_blank"
        rel="noopener"
        class="song-cover block aspect-square"
        data-test="deezer-link"
        aria-label="Auf Deezer öffnen"
        title="Auf Deezer öffnen"
      >
        <img
          v-if="solution.coverUrl"
          :src="solution.coverUrl"
          alt=""
          class="h-full w-full rounded-xl object-cover"
          data-test="cover"
        />
        <span
          v-else
          class="flex h-full w-full items-center justify-center rounded-xl bg-neutral-100 text-5xl"
        >
          🎵
        </span>
      </a>
    </div>

    <!-- Two lines, because either of them can be long: „Das geht ab [wir feiern die ganze Nacht]"
         next to its artist had nowhere to go on a phone. On the board this same slot holds the
         search field, so the bar below sits at the same height on both screens. -->
    <div class="h-12" data-test="solution-line">
      <p class="truncate text-center text-sm leading-6 font-medium">{{ solution.title }}</p>
      <p class="truncate text-center text-sm leading-6 text-neutral-500">{{ solution.artist }}</p>
    </div>

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
      <PlayButton label="Auflösung abspielen" :waiting="loading" @press="playSolution()" />
      <span class="min-w-0" />
    </div>
  </div>
</template>
