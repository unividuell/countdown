<script setup lang="ts">
/**
 * Playing Anrührung: the target field with the circle in it, the fill bar, one nozzle per pigment
 * and the hold that hands in.
 *
 *   ┌──────────────────┐
 *   │  target colour   │
 *   │     ( circle )   │   grey while empty; the last answer's colour after
 *   └──────────────────┘
 *   ▕████░░░░▏ 2 / 20
 *   (C) (M) (Y) (W) (K)   a tap is one drop, one server step
 *   ( Fertig )            the last drop holds it by itself, once
 *
 * What is confirmed is what `steps` holds. A tap locks the nozzles until `steps` grows or the
 * request ends without a step (refused); no queue.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AwardRule, StepView } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import { readableTextColor } from '@/ui/readableTextColor'
import MixColorBriefing from './MixColorBriefing.vue'
import MixerGlass from './MixerGlass.vue'
import { glassOf } from './types'
import type { MixColorPayload } from './types'

const props = defineProps<{
  payload: MixColorPayload
  /** My drops so far, each with the server's answer. */
  steps: StepView[]
  disabled: boolean
  awardRule: AwardRule | null
  awardPoints: number | null
  /** My avatar colour: the hold wears it. */
  myColorHex: string
}>()

const emit = defineEmits<{
  skip: [stage: number, input: { base: string }]
  guess: [value: { drops: number }]
}>()

const SPLASH_MS = 900

const drops = computed(() => props.steps.length)
const full = computed(() => drops.value >= props.payload.capacity)
const fill = computed(() => glassOf(props.steps.at(-1)?.answer) ?? null)

/** Set by a tap; the host's answer or refusal clears it. */
const pending = ref(false)
const locked = computed(() => props.disabled || pending.value)

watch(
  () => props.steps.length,
  () => (pending.value = false),
)
watch(
  () => props.disabled,
  (now, before) => {
    if (before && !now) pending.value = false
  },
)

const splashes = ref<{ id: number; hex: string; angle: number }[]>([])
let splashId = 0
const timers = new Set<ReturnType<typeof setTimeout>>()

function splash(hex: string): void {
  const id = splashId++
  splashes.value = [...splashes.value, { id, hex, angle: Math.random() * 360 }]

  const timer = setTimeout(() => {
    timers.delete(timer)
    splashes.value = splashes.value.filter((s) => s.id !== id)
  }, SPLASH_MS)
  timers.add(timer)
}

onBeforeUnmount(() => timers.forEach(clearTimeout))

function drop(key: string, hex: string): void {
  if (locked.value || full.value) return

  pending.value = true
  splash(hex)
  emit('skip', drops.value, { base: key })
}

// A full circle holds "Fertig" itself, once per mount: after a failed hand-in the player decides.
const spent = ref(false)
const autoHold = computed(() => full.value && !locked.value && !spent.value)

watch(autoHold, (now, before) => {
  if (before && !now) spent.value = true
})

function submit(): void {
  if (locked.value || drops.value < 1) return

  emit('guess', { drops: drops.value })
}
</script>

<template>
  <div data-test="mix-color-board" class="flex flex-col gap-6">
    <div class="flex flex-col gap-4">
      <div
        data-test="mix-color-field"
        class="flex aspect-square w-full items-center justify-center rounded-lg"
        :style="{ backgroundColor: props.payload.targetHex }"
      >
        <div class="aspect-square w-[58%]">
          <MixerGlass :fill="fill" :splashes="splashes" />
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div
          class="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant"
          role="progressbar"
          aria-label="Füllstand"
          :aria-valuenow="drops"
          aria-valuemin="0"
          :aria-valuemax="props.payload.capacity"
        >
          <div
            class="h-full bg-primary"
            :style="{ width: `${Math.min(100, (drops / props.payload.capacity) * 100)}%` }"
          />
        </div>
        <span class="text-sm tabular-nums">{{ drops }} / {{ props.payload.capacity }}</span>
      </div>

      <div class="flex justify-center gap-3">
        <button
          v-for="pigment in props.payload.pigments"
          :key="pigment.key"
          type="button"
          :aria-label="pigment.name"
          :disabled="locked || full"
          class="size-12 rounded-full border border-outline disabled:opacity-40"
          :style="{ backgroundColor: pigment.hex }"
          @click="drop(pigment.key, pigment.hex)"
        />
      </div>

      <!-- `HoldButton` fills its parent and has no size of its own. -->
      <div class="flex justify-center">
        <div class="relative size-20" :class="{ 'opacity-40': locked || drops < 1 }">
          <HoldButton
            :ready="true"
            :disabled="locked || drops < 1"
            :auto-hold="autoHold"
            label="Mischung abgeben — gedrückt halten"
            :color="props.myColorHex"
            @confirm="submit"
          />
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold"
            :style="{ color: readableTextColor(props.myColorHex) }"
          >
            Fertig
          </span>
        </div>
      </div>
    </div>

    <MixColorBriefing
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      :capacity="props.payload.capacity"
    />
  </div>
</template>
