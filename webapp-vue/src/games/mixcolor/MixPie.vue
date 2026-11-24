<script setup lang="ts">
/**
 * The selected mixes as slices of the circle, each marked with a dot in its player's colour. Laid
 * over `MixerGlass` in the same view box, inside its ring; with no slice the glass's grey shows
 * through.
 *
 *       ╭───╮
 *      │ ● ╱ │    every mix comes in, on or off, in a fixed order; the ones on share the circle
 *      │  ╱ ●│    from the start angle, so a slice always sits between the same neighbours
 *       ╰───╯
 *
 * A slice switched on grows from nothing while the others make room; one switched off shrinks away
 * and the others close the gap (`FADE_MS`). The mount shows the selection as it is. Reduced motion
 * or a background tab: no tween.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { wedgeMid, wedgePath, wedges } from './pie'

const props = defineProps<{
  slices: { key: string; hex: string; dot: string; on: boolean }[]
  /** Degrees where the first slice begins. */
  start: number
}>()

const R = 47
const DOT_R = 4
const DOT_AT = 30
const FADE_MS = 450

/** A slice's weight runs `from` → `to`, starting at the first frame after the switch. */
interface Tween {
  weight: number
  from: number
  to: number
  since: number | null
}

const target = (on: boolean) => (on ? 1 : 0)

const tweens = ref(
  new Map<string, Tween>(
    props.slices.map((slice) => {
      const at = target(slice.on)
      return [slice.key, { weight: at, from: at, to: at, since: null }]
    }),
  ),
)

let frame = 0

const ease = (t: number) => 1 - (1 - t) ** 3
const moving = () => [...tweens.value.values()].some((tween) => tween.weight !== tween.to)

function step(now: number): void {
  for (const tween of tweens.value.values()) {
    if (tween.weight === tween.to) continue

    tween.since ??= now
    const t = Math.min(1, (now - tween.since) / FADE_MS)
    tween.weight = t === 1 ? tween.to : tween.from + (tween.to - tween.from) * ease(t)
  }

  frame = moving() ? requestAnimationFrame(step) : 0
}

watch(
  () => props.slices.map((slice) => [slice.key, slice.on] as const),
  (next) => {
    const calm = prefersReducedMotion() || inBackground()

    for (const [key, on] of next) {
      const to = target(on)
      const tween = tweens.value.get(key)

      if (tween === undefined) {
        tweens.value.set(key, { weight: to, from: to, to, since: null })
      } else if (tween.to !== to) {
        Object.assign(tween, { from: tween.weight, to, since: null })
        if (calm) tween.weight = to
      }
    }

    if (!calm && frame === 0 && moving()) frame = requestAnimationFrame(step)
  },
)

onBeforeUnmount(() => cancelAnimationFrame(frame))

const drawn = computed(() => {
  const weights = props.slices.map((slice) => tweens.value.get(slice.key)?.weight ?? 0)
  const all = wedges(weights, props.start)

  return props.slices.flatMap((slice, at) =>
    weights[at]! > 0
      ? [
          {
            ...slice,
            weight: weights[at]!,
            path: wedgePath(all[at]!, R),
            mid: wedgeMid(all[at]!, DOT_AT),
          },
        ]
      : [],
  )
})
</script>

<template>
  <svg viewBox="-50 -50 100 100" class="h-full w-full" aria-hidden="true">
    <path
      v-for="slice in drawn"
      :key="slice.key"
      data-test="pie-slice"
      :d="slice.path"
      :fill="slice.hex"
    />

    <circle
      v-for="slice in drawn"
      :key="slice.key"
      data-test="pie-dot"
      :cx="slice.mid.x"
      :cy="slice.mid.y"
      :r="DOT_R * slice.weight"
      :fill="slice.dot"
      stroke="white"
      stroke-width="1"
    />
  </svg>
</template>
