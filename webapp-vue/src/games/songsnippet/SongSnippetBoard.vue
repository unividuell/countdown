<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import { fetchAssetBlob } from '@/api/assets'
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
const picked = ref<SongSuggestion | null>(null)
const loadingStage = ref(false)

const totalSeconds = computed(() => props.durations[props.durations.length - 1] ?? 15)
const unlockedSeconds = computed(() => props.durations[props.stage] ?? 0)
const lastStage = computed(() => props.stage >= props.durations.length - 1)
const phaseTwo = computed(() => props.awardRule === 'CLOSEST_ONLY')
const stageLabel = computed(() => `${String(unlockedSeconds.value).replace('.', ',')}s`)

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
  async (stage) => {
    const mine = ++stageGeneration
    loadingStage.value = true
    try {
      const blob = await fetchAssetBlob(props.assetUrl(stage))
      if (mine !== stageGeneration) return
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
      objectUrl = URL.createObjectURL(blob)
      playback.setSource(objectUrl)
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
  <div class="flex flex-col gap-5 rounded-xl border border-neutral-200 bg-white p-5">
    <!-- Reserved from the start: the real cover lands in exactly this box after the reveal, so
         the layout never jumps on submitting a guess. -->
    <div
      class="mx-auto flex h-32 w-32 items-center justify-center rounded-xl bg-neutral-100 text-5xl text-neutral-400"
      data-test="cover-placeholder"
    >
      ?
    </div>

    <StageBar
      :durations="durations"
      :total-seconds="totalSeconds"
      :unlocked-seconds="unlockedSeconds"
      :position-seconds="playback.positionSeconds.value"
    />

    <!-- The big play button stays horizontally centered; the smaller pause pays for the
         asymmetry, never the centering. `minmax(0,1fr)` (not a bare `1fr`) on both side tracks —
         a bare `1fr` keeps room for its content's own auto-minimum width, so the wider right
         column (pause button + label) would push the center track off-axis. -->
    <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
      <span class="min-w-0" />
      <button
        type="button"
        data-test="play"
        class="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-amber-400 text-3xl text-neutral-900 disabled:opacity-40"
        :disabled="loadingStage"
        aria-label="Von vorn abspielen"
        @click="playback.restart()"
      >
        ▶
      </button>
      <span class="flex min-w-0 items-center gap-3 justify-self-start pl-4">
        <button
          type="button"
          data-test="pause"
          class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-sm"
          aria-label="Pause"
          @click="playback.pause()"
        >
          ⏸
        </button>
        <span class="font-mono text-sm text-amber-600" data-test="stage-label">{{
          stageLabel
        }}</span>
      </span>
    </div>

    <p v-if="notice" class="text-center text-sm text-amber-700" data-test="song-notice">
      {{ notice }}
    </p>

    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <SongSearchBox :disabled="disabled" @select="picked = $event" />
      </div>
      <div class="flex flex-col items-end">
        <button
          type="button"
          data-test="skip"
          class="h-11 cursor-pointer rounded-full border border-neutral-300 px-4 text-sm disabled:opacity-40"
          :disabled="disabled || lastStage"
          @click="emit('skip', stage)"
        >
          ⏭ Skip
        </button>
        <span class="mt-1 text-xs text-neutral-500">
          {{ phaseTwo ? 'kann den Sieg kosten' : 'kostet nur Ruhm' }}
        </span>
      </div>
    </div>

    <div class="flex flex-col items-center gap-1">
      <HoldButton
        :ready="true"
        :disabled="disabled || picked === null"
        label="Tipp abgeben"
        color="#f59e0b"
        @confirm="picked !== null && emit('guess', picked)"
      />
      <span class="text-xs text-neutral-500">
        {{ phaseTwo ? 'kann die gesamte Runde verbrennen' : 'verbrennt höchstens diese Stufe' }}
      </span>
    </div>

    <div class="flex flex-col items-center gap-1">
      <HoldButton
        :ready="true"
        :disabled="disabled"
        label="Aufgeben"
        color="#a3a3a3"
        @confirm="emit('giveUp')"
      />
    </div>
  </div>
</template>
