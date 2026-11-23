<script setup lang="ts">
/**
 * The streak badge on a roster avatar: the band's icon, sized and placed by `streak.ts`, outlined
 * in the surface colour so it stands off the avatar and its neighbours. Fixed fills, not colour
 * roles: the icon looks the same in light and dark, only the outline follows the surface.
 *
 * A rise while mounted flares it — it stretches up, flashes and settles. On a new band the old
 * icon fades out beneath the new one. Never on mount, never on a fall.
 *
 *   0 ─────── 0.4 ─────── 0.7 ─────── 1      600 ms, ease-out, pivot on the foot (50% 90%)
 *   squat     stretched   settling    rest   k = old size / new size, 0.5 on a new band
 *   k·(1.05, 0.7)  (0.88, 1.38)  (1.06, 0.94)  1
 *   bright 1  1.9         1.2         1
 */
import { computed, nextTick, ref, watch } from 'vue'
import { bandOf, markBox, markSize, type StreakBand } from './streak'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const FLARE_MS = 600
const FADE_MS = 250

type Look =
  | { kind: 'flame'; outer: string; inner: string }
  | { kind: 'diamond'; light: string; mid: string; dark: string; line: string; glint: boolean }

const RUBY = { light: '#fecdd3', mid: '#e11d48', dark: '#9f1239', line: '#881337' }

const LOOKS: Record<StreakBand, Look> = {
  'flame-orange': { kind: 'flame', outer: '#f97316', inner: '#facc15' },
  'flame-blue': { kind: 'flame', outer: '#2563eb', inner: '#e0f2fe' },
  'diamond-ice': {
    kind: 'diamond',
    light: '#e0f2fe',
    mid: '#7dd3fc',
    dark: '#0284c7',
    line: '#0369a1',
    glint: false,
  },
  'diamond-ruby': { kind: 'diamond', ...RUBY, glint: false },
  'diamond-ruby-glint': { kind: 'diamond', ...RUBY, glint: true },
}

const props = defineProps<{ streak: number }>()

const root = ref<HTMLElement | null>(null)
/** The streak of the icon fading out beneath a new band. */
const fading = ref<number | null>(null)
/** Bumped per flare: a fade that finishes after a newer flare began removes nothing. */
let flares = 0

/** One drawn icon: the current one, or the old one fading out beneath it. */
const layers = computed(() => {
  const out = []
  if (fading.value !== null) out.push(layerOf(fading.value, 'streak-mark-fading'))
  if (bandOf(props.streak)) out.push(layerOf(props.streak, 'streak-mark'))
  return out
})

function layerOf(streak: number, test: string) {
  const band = bandOf(streak)!
  const size = markSize(streak)
  const { left, top } = markBox(size)
  return {
    test,
    band,
    look: LOOKS[band],
    // 28 / size viewBox units are 1.4px at every size.
    stroke: 28 / size,
    style: { left: `${left}px`, top: `${top}px`, width: `${size}px`, height: `${size}px` },
  }
}

function canFlare(): boolean {
  return (
    typeof Element.prototype.animate === 'function' && !prefersReducedMotion() && !inBackground()
  )
}

watch(
  () => props.streak,
  (now, before) => {
    if (now <= before || !bandOf(now)) return
    const oldBand = bandOf(before)
    const newBand = oldBand !== bandOf(now)
    const animated = canFlare()
    // The old icon stays for its fade, which only a new band has.
    fading.value = animated && newBand && oldBand ? before : null
    if (!animated) return

    const k = newBand ? 0.5 : markSize(before) / markSize(now)
    const flare = ++flares
    void nextTick(() => play(k, newBand, flare))
  },
)

function play(k: number, newBand: boolean, flare: number): void {
  root.value?.querySelector('[data-test="streak-mark"]')?.animate(
    [
      {
        offset: 0,
        transform: `scale(${k * 1.05}, ${k * 0.7})`,
        filter: 'brightness(1)',
        opacity: newBand ? 0 : 1,
      },
      { offset: 0.4, transform: 'scale(0.88, 1.38)', filter: 'brightness(1.9)', opacity: 1 },
      { offset: 0.7, transform: 'scale(1.06, 0.94)', filter: 'brightness(1.2)', opacity: 1 },
      { offset: 1, transform: 'scale(1)', filter: 'brightness(1)', opacity: 1 },
    ],
    { duration: FLARE_MS, easing: 'ease-out' },
  )

  const old = root.value?.querySelector('[data-test="streak-mark-fading"]')
  if (!old) return
  old
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' })
    .finished.then(
      () => {
        if (flare === flares) fading.value = null
      },
      () => {},
    )
}
</script>

<template>
  <div v-if="layers.length > 0" ref="root" class="pointer-events-none absolute inset-0">
    <svg
      v-for="l in layers"
      :key="l.test"
      :data-test="l.test"
      :data-band="l.band"
      viewBox="0 0 20 20"
      class="absolute origin-[50%_90%] overflow-visible"
      :style="l.style"
    >
      <template v-if="l.look.kind === 'flame'">
        <path
          d="M10 1 C12 5 16 7 16 12 A6 6 0 0 1 4 12 C4 9 6 8 7 5 C8 7 9 8 10 8 C10 6 9.5 3.5 10 1 Z"
          :fill="l.look.outer"
          stroke="var(--color-surface)"
          :stroke-width="l.stroke"
          stroke-linejoin="round"
        />
        <path
          d="M10 9 C11 11 13 12 13 14 A3 3 0 0 1 7 14 C7 12.5 8.5 11.5 10 9 Z"
          :fill="l.look.inner"
        />
      </template>
      <template v-else>
        <polygon
          points="5,3.5 15,3.5 18.5,8 10,18 1.5,8"
          :fill="l.look.mid"
          stroke="var(--color-surface)"
          :stroke-width="l.stroke"
          stroke-linejoin="round"
        />
        <polygon points="5,3.5 15,3.5 13,8 7,8" :fill="l.look.light" />
        <polygon points="1.5,8 7,8 10,18" :fill="l.look.dark" />
        <polygon points="13,8 18.5,8 10,18" :fill="l.look.light" opacity=".55" />
        <polyline points="1.5,8 18.5,8" fill="none" :stroke="l.look.line" stroke-width=".6" />
        <polyline
          points="5,3.5 7,8 10,3.5 13,8 15,3.5"
          fill="none"
          :stroke="l.look.line"
          stroke-width=".6"
          stroke-linejoin="round"
        />
        <polyline points="7,8 10,18 13,8" fill="none" :stroke="l.look.line" stroke-width=".6" />
        <template v-if="l.look.glint">
          <path
            class="glint"
            d="M17 -1 Q17.4 1.6 20 2 Q17.4 2.4 17 5 Q16.6 2.4 14 2 Q16.6 1.6 17 -1 Z"
            fill="#fff"
            :stroke="l.look.line"
            stroke-width=".35"
          />
          <path
            class="glint glint-late"
            d="M2.5 -0.5 Q2.8 1.2 4.5 1.5 Q2.8 1.8 2.5 3.5 Q2.2 1.8 0.5 1.5 Q2.2 1.2 2.5 -0.5 Z"
            fill="#fff"
            :stroke="l.look.line"
            stroke-width=".3"
          />
        </template>
      </template>
    </svg>
  </div>
</template>

<!-- The glint: two stars flashing in turn, each visible around 80% of a 2.4s cycle. Still and
     visible under reduced motion, which is the resting state without the animation. -->
<style scoped>
.glint {
  animation: streak-glint 2.4s ease-in-out infinite;
}

.glint-late {
  animation-delay: -1.2s;
}

@keyframes streak-glint {
  0%,
  65%,
  95%,
  100% {
    opacity: 0;
  }
  80% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .glint {
    animation: none;
  }
}
</style>
