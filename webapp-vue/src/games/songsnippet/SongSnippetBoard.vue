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

/**
 * How long a verdict stands before the bar drops it again. It is a remark, not a state: „falsch" is
 * already told by the bar growing and the field emptying, so the sentence only has to be caught
 * once. Long enough to read twelve words, short enough that it is gone before the next guess.
 */
const VERDICT_MS = 2000
const verdict = ref<string | null>(null)
let verdictTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.notice,
  (notice) => {
    clearTimeout(verdictTimer)
    verdict.value = notice
    if (notice !== null) {
      verdictTimer = setTimeout(() => {
        verdict.value = null
      }, VERDICT_MS)
    }
  },
)

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
  clearTimeout(verdictTimer)
})
</script>

<template>
  <div class="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
    <!-- The hits first, then the field, then the bar: the band stands where the reveal puts the
         cover, and the field where it puts the title, so resolving the round moves nothing. Both
         rows belong to the search box, which spaces them exactly like this card does. -->
    <SongSearchBox :disabled="disabled" @select="emit('guess', $event)" />

    <StageBar
      :durations="durations"
      :total-seconds="totalSeconds"
      :unlocked-seconds="unlockedSeconds"
      :position-seconds="playback.positionSeconds.value"
      :notice="verdict"
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
        <button
          type="button"
          data-test="skip"
          class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 border-neutral-300 text-xl text-neutral-700 disabled:opacity-40"
          :disabled="disabled || lastStage"
          aria-label="Nächste Stufe freischalten"
          :title="`Nächste Stufe freischalten — ${skipCost}`"
          @click="emit('skip', stage)"
        >
          <PlayerIcon name="skip" />
        </button>
      </span>
    </div>

    <!-- Last and to the side: giving up is the one thing here nobody should reach for by accident,
         so it sits below everything the round is actually played with. -->
    <div class="flex justify-end">
      <button
        type="button"
        data-test="give-up"
        class="cursor-pointer rounded-lg border border-neutral-300 px-2.5 py-1 text-xs whitespace-nowrap text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
        :disabled="disabled"
        @click="emit('giveUp')"
      >
        Aufgeben
      </button>
    </div>
  </div>
</template>
