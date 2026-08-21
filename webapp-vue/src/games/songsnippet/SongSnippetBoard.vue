<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import { fetchAssetBlob } from '@/api/assets'
import PlayerIcon from './PlayerIcon.vue'
import StageBar from './StageBar.vue'
import SongSearchBox from './SongSearchBox.vue'
import { usePlayback } from './usePlayback'
import type { SongSuggestion } from './api'

const props = defineProps<{
  durations: number[]
  stage: number
  awardRule: AwardRule | null
  disabled: boolean
  assetUrl: (key: number) => string
  notice: string | null
}>()

const emit = defineEmits<{
  guess: [SongSuggestion]
  skip: [number]
  giveUp: []
}>()

const playback = usePlayback()
const loadingStage = ref(false)

const totalSeconds = computed(() => props.durations[props.durations.length - 1] ?? 15)
const unlockedSeconds = computed(() => props.durations[props.stage] ?? 0)
const lastStage = computed(() => props.stage >= props.durations.length - 1)
const phaseTwo = computed(() => props.awardRule === 'CLOSEST_ONLY')
const skipCost = computed(() => (phaseTwo.value ? 'kann den Sieg kosten' : 'kostet nur Ruhm'))

let objectUrl: string | null = null
/**
 * Only the newest fetch may win — the same generation guard `SongSearchBox` uses. Two quick stage
 * advances can otherwise let the OLDER stage's `fetchAssetBlob` resolve last and overwrite the
 * newer source; `fetchAssetBlob` takes no `signal` today, so the generation check (not
 * cancellation) is what makes a stale response inert.
 */
let stageGeneration = 0
watch(
  () => props.stage,
  async (stage, previous) => {
    const mine = ++stageGeneration
    loadingStage.value = true
    try {
      const blob = await fetchAssetBlob(props.assetUrl(stage))
      if (mine !== stageGeneration) return
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
      objectUrl = URL.createObjectURL(blob)
      playback.setSource(objectUrl)
      // A stage only ever grows by skipping or by guessing wrong, and both mean „let me hear the
      // longer one" — so the new clip plays itself. `previous` is undefined on the immediate run:
      // arriving at a round must not start sounding on its own.
      if (previous !== undefined) playback.restart()
    } catch (err) {
      console.error('[song-snippet] stage audio failed', err)
    } finally {
      if (mine === stageGeneration) loadingStage.value = false
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <div class="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- The cover's row, laid out exactly like the reveal's: the box stays horizontally centered
         (both side tracks `minmax(0,1fr)`, so neither one's content can push it off-axis) and only
         the give-up button rides along in the right track. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start">
      <span class="min-w-0" />
      <div
        class="flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl text-neutral-400"
        data-test="cover-placeholder"
      >
        ?
      </div>
      <span class="min-w-0 justify-self-end">
        <button
          type="button"
          data-test="give-up"
          class="cursor-pointer rounded-lg border border-neutral-300 px-2.5 py-1 text-xs whitespace-nowrap text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          :disabled="disabled"
          @click="emit('giveUp')"
        >
          Aufgeben
        </button>
      </span>
    </div>

    <!-- The slot the reveal fills with „Titel · Artist“, held open here so nothing below it moves
         when the round resolves. -->
    <p class="h-6 text-center text-sm leading-6" aria-hidden="true" data-test="title-slot"></p>

    <StageBar
      :durations="durations"
      :total-seconds="totalSeconds"
      :unlocked-seconds="unlockedSeconds"
      :position-seconds="playback.positionSeconds.value"
    />

    <!-- Play stays horizontally centered, flanked by its two smaller siblings: pause on the left,
         skip on the right. Both side tracks are `minmax(0,1fr)` so the wider one cannot shift the
         middle. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span class="min-w-0 justify-self-end pr-4">
        <button
          type="button"
          data-test="pause"
          class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-xl text-neutral-700"
          aria-label="Pause"
          @click="playback.pause()"
        >
          <PlayerIcon name="pause" />
        </button>
      </span>
      <button
        type="button"
        data-test="play"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl text-neutral-900 disabled:opacity-40"
        :disabled="loadingStage"
        aria-label="Von vorn abspielen"
        @click="playback.restart()"
      >
        <PlayerIcon name="play" />
      </button>
      <span class="min-w-0 justify-self-start pl-4">
        <!-- Outline only, and its colour is the whole warning: quiet green while a skip merely
             costs glory, quiet red once it can cost the round. -->
        <button
          type="button"
          data-test="skip"
          class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 text-xl text-neutral-700 disabled:opacity-40"
          :class="phaseTwo ? 'border-rose-300' : 'border-emerald-300'"
          :disabled="disabled || lastStage"
          aria-label="Nächste Stufe freischalten"
          :title="`Nächste Stufe freischalten — ${skipCost}`"
          @click="emit('skip', stage)"
        >
          <PlayerIcon name="skip" />
        </button>
      </span>
    </div>

    <!-- Always present, so a verdict appearing never pushes the search field down. -->
    <p class="h-5 text-center text-sm text-amber-700" data-test="song-notice">{{ notice }}</p>

    <div>
      <SongSearchBox :disabled="disabled" @select="emit('guess', $event)" />
      <p class="mt-1.5 text-center text-xs text-neutral-500">
        {{ phaseTwo ? 'kann die gesamte Runde verbrennen' : 'verbrennt höchstens diese Stufe' }}
      </p>
    </div>
  </div>
</template>
