<script setup lang="ts">
/**
 * Playing: the photo under dust, the cover over it, the run on top of both, and the rules below.
 *
 * The cover drops with the full ring, not with the payload: then one whole beat of fully dusted grid
 * is on screen before tile 0, and the reveal's round trip runs inside that beat instead of breaking
 * the pulse. That deviates from the cover contract on purpose — the contract protects a scored
 * clock, and this game has none; under the glass lies only dust, which is shown right after anyway.
 *
 * The order never reaches the template: only the count of fallen tiles does, and the set of fallen
 * tiles is derived from it in script.
 */
import { computed, effectScope, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useEventListener, useScrollLock } from '@vueuse/core'
import type { AwardRule } from '@/api/types'
import RevealCover from '@/ui/RevealCover.vue'
import type { SceneState } from '@/ui/sceneState'
import { prefersReducedMotion } from '@/ui/motion'
import DedusterBriefing from './DedusterBriefing.vue'
import { loadPhoto } from './photo'
import dustUrl from './dust.jpg'
import type { DedusterGuessWire, DedusterPayload, DedusterScene } from './types'
import { browserClock, useDedusterRun, type RunResult } from './useDedusterRun'

const RELOAD_NOTE = 'Neu geladen — dein Lauf wird markiert.'
const RIPPLE_MS = 400

const props = defineProps<{
  payload: DedusterPayload | null
  /** The layout and tempo under the cover, while `payload` is still withheld. */
  scene: DedusterScene | null
  sealed: boolean
  disabled: boolean
  /** A guess of this viewer's is already in: the board takes no more taps. */
  submitted: boolean
  /** The round's photo — the scene asset, fetchable before the reveal. */
  photoUrl: string
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

const emit = defineEmits<{ guess: [value: DedusterGuessWire]; reveal: [] }>()

const layout = computed(() => props.payload ?? props.scene)

const sceneState = ref<SceneState>('preparing')
async function preparePhoto(): Promise<void> {
  sceneState.value = 'preparing'
  try {
    await loadPhoto(props.photoUrl)
    sceneState.value = 'ready'
  } catch {
    sceneState.value = 'failed'
  }
}
void preparePhoto()

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

/** Created once the order is known; its own scope so unmounting stops its timers. */
const scope = effectScope()
const run = shallowRef<ReturnType<typeof useDedusterRun> | null>(null)
onBeforeUnmount(() => scope.stop())

function begin(): void {
  const payload = props.payload
  const fullAt = ringFullAt.value
  if (payload === null || fullAt === null || run.value !== null) return
  const restarted = restart.value
  run.value =
    scope.run(() =>
      useDedusterRun({
        order: payload.order,
        intervalMs: payload.intervalMs,
        onEnd: (result: RunResult) => send({ ...result, restarted }),
      }),
    ) ?? null
  // One beat of whole, dusted grid after the full ring; a payload later than that falls at once.
  run.value?.start(fullAt + payload.intervalMs)
}

/**
 * The run plays once, so its guess is kept: a submit that comes back failed (`disabled` true → false,
 * no `submitted`) offers to send exactly that guess again instead of leaving nothing to press.
 */
const lastGuess = shallowRef<DedusterGuessWire | null>(null)
const sendFailed = ref(false)
function send(guess: DedusterGuessWire): void {
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

const revealed = computed(() => {
  const payload = props.payload
  const count = run.value?.revealed.value ?? 0
  return new Set(payload === null ? [] : payload.order.slice(0, count))
})

const running = computed(() => run.value?.running.value === true)
const scrollLocked = useScrollLock(document.body)
watch(running, (now) => {
  scrollLocked.value = now
})

// Mobile browsers throttle timers in the background; without this, switching apps would pause the run.
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) run.value?.abandon()
})

/** Where tile [index] cuts into the field-wide texture: its column and row, never the order. */
function dustOffset(index: number, cols: number, rows: number): string {
  const col = index % cols
  const row = Math.floor(index / cols)
  return `calc(${-col} * 100cqw / ${cols}) calc(${-row} * 100cqh / ${rows})`
}

const field = ref<HTMLDivElement | null>(null)

function onPointerDown(event: PointerEvent): void {
  const current = run.value
  const grid = layout.value
  const el = field.value
  if (current === null || grid === null || el === null || !current.running.value) return
  if (!event.isPrimary || event.button !== 0) return
  const box = el.getBoundingClientRect()
  const x = event.clientX - box.left
  const y = event.clientY - box.top
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((x / box.width) * grid.cols)))
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((y / box.height) * grid.rows)))
  const result = current.tap(row * grid.cols + col)
  if (result !== 'ignored') ripple(el, x, y, result === 'hit')
}

/**
 * Feedback at the finger: without it a hit is only confirmed by the next tile, and the last one
 * never. Green for a hit, a repeat on the same tile included; red for anything else — then it is
 * the last thing the player sees. One element per tap, removed when its animation ends.
 */
function ripple(host: HTMLElement, x: number, y: number, hit: boolean): void {
  if (typeof host.animate !== 'function' || prefersReducedMotion()) return
  const dot = document.createElement('span')
  dot.className = 'pointer-events-none absolute size-16 rounded-full'
  dot.style.left = `${x}px`
  dot.style.top = `${y}px`
  dot.style.backgroundColor = hit ? 'rgb(34 197 94 / 0.55)' : 'rgb(239 68 68 / 0.7)'
  host.appendChild(dot)
  const animation = dot.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 },
    ],
    { duration: RIPPLE_MS, easing: 'ease-out' },
  )
  animation.onfinish = () => dot.remove()
}
</script>

<template>
  <div data-test="deduster-board" class="flex flex-col gap-6">
    <!-- Card-wide, like Musterung's: the field runs edge to edge for the largest tap targets, and
         the bottom padding, cancelled by `-mb-4`, lets the cover's blur fade before the glass ends. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div data-test="deduster-play" :inert="coverShown || undefined">
        <div
          ref="field"
          data-test="deduster-field"
          class="relative w-full overflow-hidden select-none"
          :class="{ 'touch-none cursor-crosshair': running }"
          :style="{ aspectRatio: `${layout.cols} / ${layout.rows}` }"
          @pointerdown="onPointerDown"
        >
          <img
            v-if="sceneState === 'ready'"
            :src="props.photoUrl"
            alt=""
            class="absolute inset-0 size-full"
            draggable="false"
          />
          <!-- No transition on a falling tile: any fade costs reaction time, and differently on every device.
               One continuous dust layer: each tile shifts the seamless texture by its own place in the
               grid, measured against the grid's size (`cq*`), so no tile starts the texture over. -->
          <div
            class="absolute inset-0 grid [container-type:size]"
            :style="{
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
              '--dust': `url(${dustUrl})`,
            }"
          >
            <div
              v-for="cell in layout.cols * layout.rows"
              :key="cell"
              data-test="deduster-cell"
              class="bg-gray-200 bg-(image:--dust) bg-repeat"
              :class="{ 'opacity-0': revealed.has(cell - 1) }"
              :style="{
                backgroundPosition: dustOffset(cell - 1, layout.cols, layout.rows),
                backgroundSize: '256px 256px',
              }"
            />
          </div>
          <!-- The lines lie over dust, photo and ripple alike: a fallen tile keeps its frame to aim at. -->
          <div
            data-test="deduster-lines"
            class="pointer-events-none absolute inset-0 z-10 grid"
            :style="{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }"
          >
            <div
              v-for="cell in layout.cols * layout.rows"
              :key="cell"
              data-test="deduster-line"
              class="border border-black"
            />
          </div>
        </div>
      </div>
      <RevealCover
        v-if="coverShown"
        :state="sceneState"
        :busy="props.disabled"
        :timed="false"
        :beat-ms="layout.intervalMs"
        :note="restart ? RELOAD_NOTE : null"
        @start="onStart"
        @retry="preparePhoto"
      />
    </div>

    <button
      v-if="resendShown"
      type="button"
      data-test="deduster-resend"
      class="h-11 cursor-pointer self-center rounded-md bg-neutral-900 px-6 text-sm font-medium text-white"
      @click="lastGuess && send(lastGuess)"
    >
      Nochmal senden
    </button>

    <DedusterBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
