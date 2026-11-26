<script setup lang="ts">
/**
 * The tower, drawn from the bars the run has fixed — never from the animated pixel. The board is
 * a fixed 3:4 picture; a tall tower scrolls under it so the sliding bar stays in the upper third.
 *
 *   y = 0      ┌──────────┐
 *              │ ▬▬ slider│  ← stays at or below a third of the height
 *   y = H / 3  │ ▬▬▬▬     │
 *              │ ▬▬▬▬▬    │  ← the bars scroll down, off the bottom
 *              └──────────┘
 */
import { computed, useId } from 'vue'
import { prefersReducedMotion } from '@/ui/motion'
import { useDarkScheme } from '@/ui/colorScheme'
import type { Bar } from './tower'
import type { Cut } from './useStackRun'
import { barFill, barHue } from './colors'
import { heightLabel } from './scoreboard'

const BAR_HEIGHT = 60
const FALL_MS = 600
const FALL_UNITS = 800
const GOLD_FROM = '#F7D774'
const GOLD_TO = '#C9971C'

/** Four-pointed stars at fixed spots on the bar, as fractions of its width and height. */
const SPARKLES = [
  { fx: 0.12, fy: 0.3 },
  { fx: 0.3, fy: 0.75 },
  { fx: 0.5, fy: 0.25 },
  { fx: 0.7, fy: 0.7 },
  { fx: 0.88, fy: 0.35 },
]

const props = defineProps<{
  fieldWidth: number
  hueStart: number
  bars: readonly Bar[]
  cuts: readonly Cut[]
  slider: { floor: number; width: number; x: number } | null
  /** The special floor, gold and sparkling; `null` in phase two or while sealed. */
  target: number | null
}>()

const id = useId()
const gradientId = `gold-${id}`
const blurId = `glow-${id}`
const dark = useDarkScheme()
const still = prefersReducedMotion()

const viewHeight = computed(() => Math.round((props.fieldWidth * 4) / 3))

/** The floor's top edge, before scrolling. */
function floorY(floor: number): number {
  return viewHeight.value - BAR_HEIGHT * (floor + 1)
}

const offset = computed(() => {
  const floor = props.slider?.floor ?? props.bars.length

  return Math.max(0, Math.round(viewHeight.value / 3 - floorY(floor)))
})

function fillOf(floor: number): string {
  return floor === props.target
    ? `url(#${gradientId})`
    : barFill(barHue(props.hueStart, floor), dark.value)
}

const top = computed(() => props.bars[props.bars.length - 1])
const topFloor = computed(() => props.bars.length - 1)

/** The gold bar's place, whether resting or sliding; `null` while it is not on the board. */
const gold = computed(() => {
  const target = props.target
  if (target === null) return null

  const rest = props.bars[target]
  if (rest !== undefined) return { left: rest.left, width: rest.width, floor: target }
  if (props.slider !== null && props.slider.floor === target) {
    return { left: props.slider.x, width: props.slider.width, floor: target }
  }

  return null
})

function star(cx: number, cy: number, r: number): string {
  const t = r * 0.25

  return `M${cx} ${cy - r}L${cx + t} ${cy - t}L${cx + r} ${cy}L${cx + t} ${cy + t}L${cx} ${cy + r}L${cx - t} ${cy + t}L${cx - r} ${cy}L${cx - t} ${cy - t}Z`
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${props.fieldWidth} ${viewHeight}`"
    role="img"
    :aria-label="heightLabel(props.bars.length - 1)"
    class="block w-full select-none"
    :style="{ aspectRatio: `${props.fieldWidth} / ${viewHeight}` }"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="GOLD_FROM" />
        <stop offset="1" :stop-color="GOLD_TO" />
      </linearGradient>
      <filter :id="blurId" x="-20%" y="-150%" width="140%" height="400%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
    </defs>

    <g
      data-test="tower"
      class="transition-transform duration-300 ease-out motion-reduce:transition-none"
      :style="{ transform: `translateY(${offset}px)` }"
    >
      <line
        v-if="top"
        data-test="guide"
        :x1="top.left + top.width / 2"
        :x2="top.left + top.width / 2"
        :y1="floorY(topFloor)"
        :y2="-offset"
        class="stroke-current text-on-surface-variant"
        stroke-width="3"
        stroke-dasharray="10 12"
        opacity="0.5"
      />

      <rect
        v-for="(bar, floor) in props.bars"
        :key="floor"
        data-test="bar"
        :x="bar.left"
        :y="floorY(floor)"
        :width="bar.width"
        :height="BAR_HEIGHT"
        :fill="fillOf(floor)"
      />

      <rect
        v-if="props.slider"
        data-test="slider"
        :x="props.slider.x"
        :y="floorY(props.slider.floor)"
        :width="props.slider.width"
        :height="BAR_HEIGHT"
        :fill="fillOf(props.slider.floor)"
      />

      <g v-if="gold" data-test="gold" pointer-events="none">
        <rect
          data-test="glow"
          :x="gold.left"
          :y="floorY(gold.floor)"
          :width="gold.width"
          :height="BAR_HEIGHT"
          :fill="GOLD_FROM"
          :filter="`url(#${blurId})`"
          :opacity="still ? 0.6 : 0.35"
        >
          <animate
            v-if="!still"
            attributeName="opacity"
            values="0.35;0.8;0.35"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </rect>
        <path
          v-for="(spot, i) in SPARKLES"
          :key="i"
          data-test="sparkle"
          :d="star(gold.left + gold.width * spot.fx, floorY(gold.floor) + BAR_HEIGHT * spot.fy, 11)"
          fill="#FFFBE6"
          :opacity="still ? 0.9 : 0"
        >
          <animate
            v-if="!still"
            attributeName="opacity"
            values="0;1;0"
            dur="1.2s"
            :begin="`${(i * 0.24).toFixed(2)}s`"
            repeatCount="indefinite"
          />
        </path>
      </g>

      <template v-if="!still">
        <rect
          v-for="(cut, i) in props.cuts"
          :key="i"
          data-test="cut"
          :x="cut.left"
          :y="floorY(cut.floor)"
          :width="cut.width"
          :height="BAR_HEIGHT"
          :fill="barFill(barHue(props.hueStart, cut.floor), dark)"
        >
          <animate
            attributeName="y"
            :from="floorY(cut.floor)"
            :to="floorY(cut.floor) + FALL_UNITS"
            :dur="`${FALL_MS}ms`"
            fill="freeze"
          />
          <animate attributeName="opacity" from="1" to="0" :dur="`${FALL_MS}ms`" fill="freeze" />
        </rect>
      </template>
    </g>
  </svg>
</template>
