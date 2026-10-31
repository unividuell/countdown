<script setup lang="ts">
/**
 * Playing Peilung: the field, a line saying what a tap does now, the hold that hands in.
 *
 *   ┌──────────────┐
 *   │  SonarField  │   covered until its cover is clicked; the cover names the count
 *   └──────────────┘
 *   1. Klick: Ping, 2. Klick: Markieren – noch 3
 *        ( Abgeben )   once every clip has its pin
 *
 * A tap goes through `flow.ts`; the board acts on its effect and on the host's answers:
 *
 *   cover click ─▶ unlock: playback session, graph, sounds, bed ─▶ unlocked, once the graph runs
 *   field tap   ─▶ ping: skip(stage, at) ─┬─ steps grows by it ─▶ engine.ping, wave, settle timer
 *                                         └─ request over, no step ─▶ refused, synced
 *   graph stops, page hidden ─▶ locked: the cover again; hidden, the bed stops until its click,
 *                               or the sound's return if a ping out or its wave kept the cover off
 *
 * Rings and pins are saved as a draft on every change; the pings live on the server.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { AwardRule, StepView } from '@/api/types'
import { audioGraph } from '@/ui/audio'
import HoldButton from '@/ui/HoldButton.vue'
import { deviceStorage } from '../drafts'
import { loadDraft, saveDraft } from './draft'
import EchoLocateBriefing from './EchoLocateBriefing.vue'
import { EchoEngine, loadSounds, shotsOf } from './engine'
import type { EchoSounds } from './engine'
import {
  guessOf,
  initialFlow,
  landed,
  locked,
  refused,
  settle,
  statusLine,
  synced,
  tap,
  unlocked,
} from './flow'
import type { FlowState } from './flow'
import { dbToGain } from './noise'
import SonarField from './SonarField.vue'
import { asEcho, asPing } from './types'
import type { EchoHit, EchoLocateGuess, EchoLocatePayload, Point } from './types'

const props = defineProps<{
  payload: EchoLocatePayload
  /** My pings so far, each with the server's answer. */
  steps: StepView[]
  /** The round's clips by place; `null` where one is missing, and that place stays silent. */
  clipSrcs: (string | null)[]
  /** Where the draft lives; `null` keeps rings and pins in memory only. */
  draftKey: string | null
  disabled: boolean
  awardRule: AwardRule | null
  awardPoints: number | null
  /** My avatar colour, for my pins. */
  myColorHex: string
}>()

const emit = defineEmits<{ guess: [value: EchoLocateGuess]; skip: [stage: number, input: Point] }>()

/** The field's own ground, so the button reads as part of it. */
const BUTTON_COLOR = '#1e1b4b'

interface Audio {
  engine: EchoEngine
  sounds: EchoSounds & { bed: AudioBuffer }
}

const storage = deviceStorage()

/** A step's input as a point; an unreadable one still counts, at the centre, so stages align. */
const pings = computed(() =>
  props.steps.map(
    (step) =>
      asPing(step.input, props.payload.grid) ?? {
        x: props.payload.grid / 2,
        y: props.payload.grid / 2,
      },
  ),
)

/** The round as the server's pings and the draft under the current key have it, covered. */
function fresh(): FlowState {
  return initialFlow({
    clips: props.payload.clips,
    pings: props.payload.pings,
    steps: pings.value,
    draft: props.draftKey === null ? null : loadDraft(storage, props.draftKey, props.payload),
  })
}

const flow = shallowRef<FlowState>(fresh())

const status = computed(() => statusLine(flow.value))
const canHandIn = computed(() => !props.disabled && guessOf(flow.value) !== null)

/** Cleared on unmount: a load or an answer that resolves later must start nothing. */
let alive = true
let engine: EchoEngine | null = null
/** Set by the unlock tap, replaced when a clip arrives later; `null` without Web Audio. */
let audio: Promise<Audio | null> | null = null
let settleTimer: ReturnType<typeof setTimeout> | undefined
/** The shared graph from the first unlock on; `null` before, and without Web Audio. */
const graph = shallowRef<AudioContext | null>(null)

/** iOS mutes Web Audio under the ring/silent switch unless the session says „playback“. */
function claimPlayback(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
}

/**
 * Runs inside the click, so the browser lets the graph start; the field opens once it runs. A
 * refused start leaves the cover on, for the next click to try again.
 */
function unlock(): void {
  claimPlayback()
  const ctx = audioGraph()
  if (ctx === null) {
    flow.value = unlocked(flow.value)
    return
  }

  graph.value = ctx
  if (audio === null) {
    load(ctx)
  } else {
    restartBed()
  }

  if (ctx.state === 'running') {
    flow.value = unlocked(flow.value)
    return
  }

  ctx
    .resume()
    .then(() => {
      if (ctx.state !== 'running') throw new Error(`the graph is ${ctx.state}`)
      if (alive) flow.value = unlocked(flow.value)
    })
    .catch((err: unknown) => {
      console.warn('[echo-locate] the browser kept the audio graph suspended', err)
    })
}

/** A bed stopped while the page was hidden starts again; a playing one plays on. */
function restartBed(): void {
  const gain = dbToGain(props.payload.bedDb)
  void audio?.then((ready) => ready?.engine.startBed(ready.sounds.bed, gain))
}

/** The engine comes with the first sounds, and only while the board is still there. */
function load(ctx: AudioContext): void {
  audio = loadSounds(ctx, props.clipSrcs).then((sounds) => {
    if (!alive) return null

    if (engine === null) {
      engine = new EchoEngine(ctx)
      engine.startBed(sounds.bed, dbToGain(props.payload.bedDb))
    }

    return { engine, sounds }
  })
}

/** The cover's click, a gesture iOS accepts; closed, a tap only unlocks, wherever and whenever. */
function onStart(): void {
  if (props.disabled || flow.value.phase !== 'closed') return

  const { effect } = tap(flow.value, { x: 0, y: 0 }, performance.now(), props.payload.speed)
  if (effect?.kind === 'unlock') unlock()
}

/** Closed, the field's pointerdown is no gesture on iOS: only the cover unlocks. */
function onTap(at: Point, tMs: number): void {
  if (props.disabled || flow.value.phase === 'closed') return

  const { state, effect } = tap(flow.value, at, tMs, props.payload.speed)

  // Pings are few and never repeat: one nobody would hear stays unspent, under the cover.
  if (effect?.kind === 'ping' && !audible()) {
    flow.value = locked(settle(flow.value, tMs))
    return
  }

  flow.value = state
  if (effect?.kind === 'ping') emit('skip', effect.stage, effect.at)
}

/** Whether a ping would be heard now. Without Web Audio there is nothing to wait for. */
function audible(): boolean {
  if (document.visibilityState === 'hidden') return false

  return graph.value === null || graph.value.state === 'running'
}

/** Back under the cover while nothing would be heard: only its click resumes the graph. */
function guard(): void {
  if (!audible()) flow.value = locked(flow.value)
}

/**
 * The sound went or came back: page shown or hidden, graph running or not. Back while a ping or its
 * wave runs, no cover came, so the bed comes back by itself.
 */
function checkSound(): void {
  if (audible() && flow.value.phase !== 'closed') restartBed()
  guard()
}

// iOS suspends the graph for a call, an app switch or the lock screen; a tap cannot resume it.
useEventListener(graph, 'statechange', checkSound)

// A hidden page plays nothing on. The shared graph is not suspended: other games use it.
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden') engine?.stopBed()
  checkSound()
})

// Whatever moves the round on — a wave that ends, a refused ping, a start over — may find the
// sound stopped meanwhile.
watch(() => flow.value.phase, guard)

/** Over again from the server's pings and the draft; an open field stays open. */
function restart(): void {
  clearTimeout(settleTimer)
  engine?.hush()
  flow.value = flow.value.phase === 'closed' ? fresh() : unlocked(fresh())
}

/** The open ping's answer: schedule its sounds, then start its wave where they will be heard. */
async function launch(hits: EchoHit[]): Promise<void> {
  const ready = await audio
  // A second arrival of the same answer finds the wave already started.
  if (!alive || flow.value.phase !== 'loading') return

  const start = performance.now() + (ready?.engine.headStartMs ?? 0)
  const soundMs = ready ? ready.engine.ping(shotsOf(hits, ready.sounds, props.payload.noiseDb)) : 0
  const travelMs = (props.payload.reach / props.payload.speed) * 1000

  // Marking lasts for the wave and the last sound, whichever ends later.
  flow.value = landed(flow.value, start, start + Math.max(travelMs, soundMs))
  armSettle()
}

/** Ends the wave on time though nobody taps; a tap settles it first anyway. */
function armSettle(): void {
  clearTimeout(settleTimer)
  const { phase, waves } = flow.value
  const endMs = waves[waves.length - 1]?.endMs ?? null
  if (phase !== 'wave' || endMs === null) return

  settleTimer = setTimeout(
    () => {
      flow.value = synced(settle(flow.value, performance.now()), pings.value)
      armSettle()
    },
    Math.max(0, endMs - performance.now()),
  )
}

function samePoint(a: Point | undefined, b: Point | null): boolean {
  return a !== undefined && b !== null && a.x === b.x && a.y === b.y
}

// The length, never the array: the host hands over a new one on every render.
watch(
  () => props.steps.length,
  (length, before) => {
    // The server took my pings back: the lab's reset or „forget mine“. A real round never does.
    if (length < before) {
      restart()
      return
    }

    const state = flow.value
    if (state.phase !== 'loading') {
      flow.value = synced(state, pings.value)
      return
    }

    const open = state.waves.length - 1
    const step = props.steps[open]
    if (step === undefined) return

    if (samePoint(pings.value[open], state.pending)) {
      void launch(asEcho(step.answer) ?? [])
      return
    }

    // The server counted another ping in this place — one whose answer got lost. Ours did not count.
    flow.value = synced(refused(state), pings.value)
  },
)

// The request is over and brought no step for the open ping: it did not get through.
watch(
  () => props.disabled,
  (now, before) => {
    const state = flow.value
    if (!before || now || state.phase !== 'loading') return

    if (props.steps.length < state.waves.length) flow.value = synced(refused(state), pings.value)
  },
)

// A clip that arrives after the start would stay silent all round otherwise.
watch(
  () => JSON.stringify(props.clipSrcs),
  () => {
    const ctx = audioGraph()
    if (audio !== null && ctx !== null) load(ctx)
  },
)

// A lab phase switch keeps the board and changes its key: that round's draft comes along.
watch(
  () => props.draftKey,
  (key) => {
    if (key !== null) restart()
  },
)

watch([() => flow.value.rings, () => flow.value.pins], ([rings, pins]) => {
  if (props.draftKey !== null) saveDraft(storage, props.draftKey, { rings, pins })
})

function handIn(): void {
  const guess = guessOf(flow.value)
  if (!props.disabled && guess !== null) emit('guess', guess)
}

onBeforeUnmount(() => {
  alive = false
  clearTimeout(settleTimer)
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div data-test="echo-locate-board" class="flex flex-col gap-6">
    <div class="flex flex-col items-center gap-3">
      <SonarField
        class="self-stretch"
        :clips="props.payload.clips"
        :grid="props.payload.grid"
        :speed="props.payload.speed"
        :reach="props.payload.reach"
        :waves="flow.waves"
        :rings="flow.rings"
        :pins="flow.pins"
        :pin-color-hex="props.myColorHex"
        :pending="flow.pending"
        :covered="flow.phase === 'closed'"
        :disabled="props.disabled"
        @tap="onTap"
        @start="onStart"
      />
      <!-- Empty under the cover, at its height: nothing jumps when it fills. -->
      <p data-test="echo-locate-status" aria-live="polite" class="min-h-7 text-center text-lg">
        {{ status }}
      </p>

      <!-- `HoldButton` fills its parent and has no size of its own. -->
      <div class="relative size-24 shrink-0" :class="{ 'opacity-40': !canHandIn }">
        <HoldButton
          :ready="true"
          :disabled="!canHandIn"
          label="Schätzung abgeben — gedrückt halten"
          :color="BUTTON_COLOR"
          @confirm="handIn"
        />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-white"
        >
          Abgeben
        </span>
      </div>
    </div>

    <EchoLocateBriefing
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      :tolerance-radius="props.payload.toleranceRadius"
      :clips="props.payload.clips"
    />
  </div>
</template>
