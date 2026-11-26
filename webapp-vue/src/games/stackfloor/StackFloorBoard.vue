<script setup lang="ts">
/**
 * Playing: the tower, the cover over it, the run on top of both, and the rules below.
 *
 * The run starts at the later of the full ring and the payload's arrival, so a slow reveal never
 * gives the sliding bar a head start. The foundation stands under the cover from the scene alone.
 */
import { computed, effectScope, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useScrollLock } from '@vueuse/core'
import type { AwardRule } from '@/api/types'
import RevealCover from '@/ui/RevealCover.vue'
import { inBackground } from '@/ui/motion'
import { useSoundStage } from '@/ui/useSoundAwake'
import { browserClock } from '@/games/deduster/useDedusterRun'
import StackFloorBriefing from './StackFloorBriefing.vue'
import TowerView from './TowerView.vue'
import { playStop } from './stopSound'
import { foundation } from './tower'
import { geometryOf } from './types'
import type { StackFloorGuess, StackFloorPayload, StackFloorScene } from './types'
import { useStackRun } from './useStackRun'

const RELOAD_NOTE = 'Neu geladen — dein Lauf wird markiert.'

const props = defineProps<{
  payload: StackFloorPayload | null
  /** The foundation and the first hue under the cover, while `payload` is still withheld. */
  scene: StackFloorScene | null
  sealed: boolean
  disabled: boolean
  /** A guess of this viewer's is already in: the board takes no more taps. */
  submitted: boolean
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

const emit = defineEmits<{ guess: [value: StackFloorGuess]; reveal: [] }>()

// Its knocks are governed by the header's sound switch, which wakes the graph while it is here.
useSoundStage()

/**
 * Mounted with the payload, without a guess, and never sealed in this mount: the reveal happened
 * before a reload. The server cannot tell a crash from intent, so the run may go again — marked.
 */
const sawSealed = ref(props.sealed)
watch(
  () => props.sealed,
  (sealed) => {
    if (sealed) sawSealed.value = true
  },
)
const restart = computed(() => !sawSealed.value && props.payload !== null && !props.submitted)

/** When the hold completed, on the run's clock. `null` while the cover lies. */
const ringFullAt = ref<number | null>(null)
const coverShown = computed(
  () => ringFullAt.value === null && !props.submitted && (props.sealed || restart.value),
)

/** Created once the geometry is known; its own scope so unmounting stops its timers. */
const scope = effectScope()
const run = shallowRef<ReturnType<typeof useStackRun> | null>(null)
let frameId = 0

function loop(): void {
  const current = run.value
  if (current === null || !current.running.value) return

  current.frame()
  frameId = requestAnimationFrame(loop)
}

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  scope.stop()
})

function begin(): void {
  const payload = props.payload
  const fullAt = ringFullAt.value
  if (payload === null || fullAt === null || run.value !== null) return

  const restarted = restart.value
  run.value =
    scope.run(() =>
      useStackRun({
        geometry: geometryOf(payload),
        pauseMs: payload.pauseMs,
        onEnd: (clicks) => send({ clicks, restarted }),
      }),
    ) ?? null
  run.value?.start(fullAt)
  frameId = requestAnimationFrame(loop)
}

/**
 * The run plays once, so its guess is kept: a submit that comes back failed (`disabled` true → false,
 * no `submitted`) offers to send exactly that guess again instead of leaving nothing to press.
 */
const lastGuess = shallowRef<StackFloorGuess | null>(null)
const sendFailed = ref(false)
function send(guess: StackFloorGuess): void {
  lastGuess.value = guess
  sendFailed.value = false
  emit('guess', guess)
}
const resendShown = computed(() => sendFailed.value && !props.disabled && !props.submitted)

function onStart(): void {
  ringFullAt.value = browserClock.now()
  if (props.sealed) emit('reveal')
  else begin()
}

watch(
  () => props.payload,
  () => begin(),
)

// A reveal that failed hands `disabled` back while the round is still sealed: lay the cover again.
watch(
  () => props.disabled,
  (now, before) => {
    if (before && !now && props.sealed && run.value === null) ringFullAt.value = null
    if (before && !now && lastGuess.value !== null && !props.submitted) sendFailed.value = true
  },
)

const running = computed(() => run.value?.running.value === true)
const scrollLocked = useScrollLock(document.body)
watch(running, (now) => {
  scrollLocked.value = now
})

const cuts = computed(() => run.value?.cuts.value ?? [])
const slider = computed(() => run.value?.slider.value ?? null)

const layout = computed(() => props.payload ?? props.scene)

const shownBars = computed(() => {
  if (run.value !== null) return run.value.bars.value
  const geometry = layout.value
  if (geometry === null) return []

  return [foundation({ ...geometry, speedNum: 1, speedDen: 1, maxFloors: 1 })]
})

function onPointerDown(event: PointerEvent): void {
  const current = run.value
  if (current === null || !current.running.value) return
  if (!event.isPrimary || event.button !== 0) return

  const result = current.tap()
  if (result !== 'ignored' && !inBackground()) playStop()
}
</script>

<template>
  <div data-test="stack-floor-board" class="flex flex-col gap-6">
    <!-- Card-wide: the tower runs edge to edge for the largest tap target; the bottom padding,
         cancelled by `-mb-4`, lets the cover's blur fade before the glass ends. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div
        data-test="stack-floor-play"
        :inert="coverShown || undefined"
        class="select-none"
        :class="{ 'touch-none': running }"
        @pointerdown="onPointerDown"
      >
        <TowerView
          :field-width="layout.fieldWidth"
          :hue-start="layout.hueStart"
          :bars="shownBars"
          :cuts="cuts"
          :slider="slider"
          :target="props.payload?.target ?? null"
        />
      </div>
      <RevealCover
        v-if="coverShown"
        state="ready"
        :busy="props.disabled"
        :timed="false"
        :note="restart ? RELOAD_NOTE : null"
        @start="onStart"
      />
    </div>

    <button
      v-if="resendShown"
      type="button"
      data-test="stack-floor-resend"
      class="h-11 cursor-pointer self-center rounded-md bg-inverse-surface px-6 text-sm font-medium text-inverse-on-surface"
      @click="lastGuess && send(lastGuess)"
    >
      Erneut senden
    </button>

    <StackFloorBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
