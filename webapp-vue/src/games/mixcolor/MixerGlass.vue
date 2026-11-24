<script setup lang="ts">
/**
 * The circle from above. Empty, neutral grey (counts for nothing); mixed, a still circle in the mix
 * colour. Adding colour stirs it: the blob spirals into the centre, streaks of it swirl over the
 * fill while the fill fades to the new mix, then the streaks fade and stop.
 *
 * Reduced motion: no blob, no swirl; the fill still fades over.
 */
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  fill: string | null
  splashes: { id: number; hex: string; angle: number }[]
}>()

const clipId = `mixer-glass-${useId()}`
const EMPTY = '#8C8C8C'
const ARMS = 7
const TURNS = 1.3
const WIDTH = 2.2
const OPACITY = 0.45
const PERIOD = '0.7s'
const FADE_MS = 600

const calm = prefersReducedMotion()

// Arms where r grows linearly with the angle: a stirred-liquid look.
const arms = Array.from({ length: ARMS }, (_, arm) => {
  const steps = 60
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const angle = (arm / ARMS + t * TURNS) * Math.PI * 2
    const r = 4 + t * 42

    return `${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`
  })

  return `M${points.join('L')}`
})

// Stirring while blobs are in flight; the streaks then fade (FADE_MS) and unmount.
const stirring = computed(() => !calm && props.splashes.length > 0)
const streaksMounted = ref(false)
const streakColorKept = ref('transparent')
const streakColor = computed(() => props.splashes.at(-1)?.hex ?? streakColorKept.value)
let unmountTimer: ReturnType<typeof setTimeout> | undefined

watch(stirring, (now) => {
  clearTimeout(unmountTimer)
  if (now) {
    streaksMounted.value = true
  } else {
    unmountTimer = setTimeout(() => (streaksMounted.value = false), FADE_MS)
  }
})

// The last colour outlives the blob, through the fade.
watch(
  () => props.splashes.at(-1)?.hex,
  (hex) => {
    if (hex) streakColorKept.value = hex
  },
)

onBeforeUnmount(() => clearTimeout(unmountTimer))
</script>

<template>
  <svg viewBox="-50 -50 100 100" class="h-full w-full" aria-hidden="true">
    <defs>
      <clipPath :id="clipId">
        <circle r="47" />
      </clipPath>
    </defs>

    <circle r="49" fill="none" stroke="rgb(255 255 255 / 0.55)" stroke-width="2" />
    <circle data-test="mixer-fill" r="47" :fill="fill ?? EMPTY" class="mixer-fill" />

    <g
      v-if="streaksMounted"
      :clip-path="`url(#${clipId})`"
      class="streaks"
      :class="{ fading: !stirring }"
      :style="{ '--fade': `${FADE_MS}ms` }"
    >
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0"
          to="360"
          :dur="PERIOD"
          repeatCount="indefinite"
        />
        <path
          v-for="(d, i) in arms"
          :key="i"
          :d="d"
          fill="none"
          :stroke="streakColor"
          :stroke-opacity="OPACITY"
          :stroke-width="WIDTH"
          stroke-linecap="round"
        />
      </g>
    </g>

    <g v-if="!calm" :clip-path="`url(#${clipId})`">
      <circle
        v-for="splash in splashes"
        :key="splash.id"
        r="7"
        :fill="splash.hex"
        class="splash"
        :style="{ '--a': `${splash.angle}deg` }"
      />
    </g>
  </svg>
</template>

<style scoped>
.mixer-fill {
  transition: fill 700ms ease-out;
}

.streaks {
  opacity: 1;
  transition: opacity 150ms ease-out;
}

.streaks.fading {
  opacity: 0;
  transition-duration: var(--fade);
}

.splash {
  transform-box: view-box;
  transform-origin: 0 0;
  /* Resting state: gone. The animation only covers the way in. */
  opacity: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .splash {
    animation: splash-in 900ms ease-in forwards;
  }
}

@keyframes splash-in {
  from {
    transform: rotate(var(--a)) translateX(34px) scale(1);
    opacity: 1;
  }
  to {
    transform: rotate(calc(var(--a) + 280deg)) translateX(2px) scale(0.2);
    opacity: 0;
  }
}
</style>
