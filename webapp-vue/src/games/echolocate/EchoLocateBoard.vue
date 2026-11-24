<script setup lang="ts">
/**
 * Playing Peilung: the field, a line saying what a click does now, the hold that hands in and beside
 * it the broom that clears the marks.
 *
 *   ┌──────────────┐
 *   │  SonarField  │   open from the start; names the count until the first ping
 *   └──────────────┘
 *   1. Klick: Ping, 2. Klick: Markieren
 *   Lang drücken: Pin setzen oder entfernen
 *   ═══○ ( Abgeben )    (🧹)   volume; hand-in once every clip has its pin; the broom clears the
 *                               rings only — pins and pings stay
 *
 * A click goes through `flow.ts`; the board acts on its effect and on the host's answers:
 *
 *   short click ─▶ sound on if it is not (iOS: the release is a gesture) ─▶ ping: skip(stage, at)
 *                  ─┬─ steps grows by it ─▶ engine.ping, wave, settle timer
 *                   └─ request over, no step ─▶ refused, synced
 *   long click  ─▶ a pin set or lifted, whatever runs
 *   page hidden ─▶ the bed stops; the next click starts it again
 *
 * Rings and pins are saved as a draft on every change; the pings live on the server.
 */
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import type { AwardRule, StepView } from '@/api/types'
import { audioGraph } from '@/ui/audio'
import HoldLock from '@/ui/HoldLock.vue'
import { useFieldTouch, useHoldLock } from '@/ui/useHoldLock'
import { playWhoosh } from '@/ui/whooshSound'
import { deviceStorage } from '../drafts'
import { loadDraft, saveDraft } from './draft'
import EchoLocateBriefing from './EchoLocateBriefing.vue'
import EchoLocateControls from './EchoLocateControls.vue'
import { EchoEngine, loadSounds, shotsOf } from './engine'
import type { EchoSounds } from './engine'
import {
  clearRings,
  guessOf,
  hold,
  initialFlow,
  landed,
  PIN_HINT,
  PINS_FULL,
  refused,
  settle,
  statusLine,
  synced,
  tap,
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

/** The round as the server's pings and the draft under the current key have it. */
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
const hasRings = computed(() => flow.value.rings.some((ring) => ring.length > 0))
const canHandIn = computed(() => !props.disabled && guessOf(flow.value) !== null)

// As in Place Patch: while the hand-in ring rises the field greys, a finger on it cancels the
// hold, and its tap pings nothing — the pins cannot change under a hold about to send them.
const { progress: holdProgress, locked: holdLocked, onProgress, unlock: unlockHold } = useHoldLock()
const { touching, onDown: onFieldDown, onUp: onFieldUp, takeTap } = useFieldTouch(holdLocked)

/** Cleared on unmount: a load or an answer that resolves later must start nothing. */
let alive = true
let engine: EchoEngine | null = null
/** Set by the unlock tap, replaced when a clip arrives later; `null` without Web Audio. */
let audio: Promise<Audio | null> | null = null
let settleTimer: ReturnType<typeof setTimeout> | undefined
/** The shared graph from the first unlock on; `null` before, and without Web Audio. */
const graph = shallowRef<AudioContext | null>(null)

/**
 * Runs inside the release of a short click, a gesture the browser lets start the graph. Called on
 * every one: the first loads the sounds, a later one brings back a bed the hidden page stopped or a
 * graph iOS suspended. A refused start leaves it to the next click.
 */
function ensureSound(): void {
  const ctx = audioGraph()
  if (ctx === null) return

  graph.value = ctx
  if (audio === null) {
    load(ctx)
  } else {
    restartBed()
  }

  if (ctx.state === 'running') return

  ctx.resume().catch((err: unknown) => {
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

/** The short click: a ping, or a mark during a wave. The first one is the first ping. */
function onTap(at: Point, tMs: number): void {
  if (takeTap() || props.disabled) return

  ensureSound()
  const { state, effect } = tap(flow.value, at, tMs, props.payload.speed)
  flow.value = state
  if (effect?.kind === 'ping') emit('skip', effect.stage, effect.at)
}

/** How long the line says why a long click set nothing. */
const NOTICE_MS = 3000

const pinHint = shallowRef(PIN_HINT)
let noticeTimer: ReturnType<typeof setTimeout> | undefined

/** The long click: a pin set or lifted, at any time — but not under a hand-in about to send them. */
function onHold(at: Point): void {
  if (takeTap() || props.disabled || holdLocked.value) return

  const next = hold(flow.value, at)
  // Unchanged with every pin set: the click missed them all and there is no pin left to set.
  if (next === flow.value && next.pins.length >= next.clips) {
    pinHint.value = PINS_FULL
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (pinHint.value = PIN_HINT), NOTICE_MS)
  }
  flow.value = next
}

function onClearRings(): void {
  flow.value = clearRings(flow.value)
  playWhoosh()
}

// iOS suspends the graph for a call, an app switch or the lock screen; the next click resumes it.
useEventListener(graph, 'statechange', () => {
  if (graph.value?.state === 'running' && document.visibilityState !== 'hidden') restartBed()
})

// A hidden page plays nothing on. The shared graph is not suspended: other games use it.
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState === 'hidden') engine?.stopBed()
  else if (graph.value?.state === 'running') restartBed()
})

/** Over again from the server's pings and the draft. */
function restart(): void {
  clearTimeout(settleTimer)
  engine?.hush()
  flow.value = fresh()
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
  unlockHold()
  const guess = guessOf(flow.value)
  if (!props.disabled && guess !== null) emit('guess', guess)
}

onBeforeUnmount(() => {
  alive = false
  clearTimeout(settleTimer)
  clearTimeout(noticeTimer)
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div data-test="echo-locate-board" class="flex flex-col gap-6">
    <div class="flex flex-col items-center gap-3">
      <!-- Capture: the hand-in hold must hear every finger on the field first. -->
      <div
        data-test="echo-locate-field"
        class="relative self-stretch"
        @pointerdown.capture="onFieldDown"
        @pointerup.capture="onFieldUp"
        @pointercancel.capture="onFieldUp"
        @lostpointercapture.capture="onFieldUp"
      >
        <SonarField
          :clips="props.payload.clips"
          :grid="props.payload.grid"
          :speed="props.payload.speed"
          :reach="props.payload.reach"
          :waves="flow.waves"
          :rings="flow.rings"
          :pins="flow.pins"
          :pin-color-hex="props.myColorHex"
          :pending="flow.pending"
          @tap="onTap"
          @hold="onHold"
        />
        <HoldLock
          v-if="holdLocked"
          data-test="echo-locate-lock"
          class="rounded-lg"
          :progress="holdProgress"
        />
      </div>
      <EchoLocateControls
        :status="status"
        :pin-hint="pinHint"
        :can-hand-in="canHandIn"
        :has-rings="hasRings"
        :touching="touching"
        :color-hex="props.myColorHex"
        @hand-in="handIn"
        @progress="onProgress"
        @clear-rings="onClearRings"
      />
    </div>

    <EchoLocateBriefing
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      :tolerance-radius="props.payload.toleranceRadius"
      :clips="props.payload.clips"
    />
  </div>
</template>
