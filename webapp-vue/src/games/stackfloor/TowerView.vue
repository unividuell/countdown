<script setup lang="ts">
/**
 * The tower, drawn from the bars the run has fixed — never from the animated pixel. Across, the
 * board is the field (every length a share of its width, the same on every phone); up, it is fixed
 * in pixels: the board's height and a bar's thickness do not grow with a wider screen. A tall tower
 * scrolls under it so the sliding bar stays in the upper third. With [fit] (the reveal) the picture
 * zooms out instead, until the whole tower is on it.
 *
 *   y = 0      ┌──────────┐
 *              │ ▬▬ slider│  ← stays at or below a third of the height
 *   y = H / 3  │ ▬▬▬▬     │
 *              │ ▬▬▬▬▬    │  ← the bars scroll down, off the bottom
 *              └──────────┘
 */
import { computed, ref, useId } from 'vue'
import { useElementSize } from '@vueuse/core'
import { prefersReducedMotion } from '@/ui/motion'
import { useDarkScheme } from '@/ui/colorScheme'
import type { Bar } from './tower'
import type { Cut } from './useStackRun'
import { barFill, barHue } from './colors'
import { heightLabel } from './scoreboard'

/** The board's and a bar's height on screen, whatever its width. */
const BOARD_PX = 300
const BAR_PX = 22.5
/** Until the board is measured (and in tests): a 375 px phone, 0.375 px per field unit. */
const FALLBACK_WIDTH_PX = 375
const GOLD_FROM = '#F7D774'
const GOLD_TO = '#C9971C'
/** A perfect stop's flare: bright on the dark board, deep gold on the light one. */
const FLARE_DARK = '#FFFBE6'
const FLARE_LIGHT = '#A87A0E'

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
  /** Floors that landed perfectly: a short sparkle at their bottom corners. */
  perfects: readonly number[]
  fit?: boolean
}>()

const id = useId()
const gradientId = `gold-${id}`
const blurId = `glow-${id}`
const shadeId = `shade-${id}`
const dark = useDarkScheme()
const still = prefersReducedMotion()

const svg = ref<SVGSVGElement | null>(null)
const { width: measured } = useElementSize(svg)
const pxPerUnit = computed(
  () => (measured.value > 0 ? measured.value : FALLBACK_WIDTH_PX) / props.fieldWidth,
)

/** In field units, so a bar's thickness and the board's height stay put in pixels. */
const barHeight = computed(() => BAR_PX / pxPerUnit.value)
const viewHeight = computed(() => Math.round(BOARD_PX / pxPerUnit.value))

/** Screen pixels in field units, for sizes that must not grow with the width. */
function px(value: number): number {
  return value / pxPerUnit.value
}

/** The floor's top edge, before scrolling. */
function floorY(floor: number): number {
  return viewHeight.value - barHeight.value * (floor + 1)
}

const offset = computed(() => {
  if (props.fit) return 0
  const floor = props.slider?.floor ?? props.bars.length

  return Math.max(0, Math.floor(viewHeight.value / 3 - floorY(floor)))
})

/** Fitted: tall enough for every bar plus two floors of air, the board's shape kept, the field centred. */
const view = computed(() => {
  const height = props.fit
    ? Math.max(viewHeight.value, Math.ceil(barHeight.value * (props.bars.length + 2)))
    : viewHeight.value
  const width = Math.round((height * props.fieldWidth) / viewHeight.value)

  return {
    x: -Math.round((width - props.fieldWidth) / 2),
    y: viewHeight.value - height,
    width,
    height,
  }
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
    ref="svg"
    :viewBox="`${view.x} ${view.y} ${view.width} ${view.height}`"
    role="img"
    :aria-label="heightLabel(props.bars.length - 1)"
    class="block w-full select-none"
    :style="{ height: `${BOARD_PX}px` }"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="GOLD_FROM" />
        <stop offset="1" :stop-color="GOLD_TO" />
      </linearGradient>
      <!-- A milled beam lit from above: a narrow bright chamfer on top, a narrow dark one below, the
           face flat between — hard stops, no blur. -->
      <linearGradient :id="shadeId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.5" />
        <stop offset="0.14" stop-color="#fff" stop-opacity="0.5" />
        <stop offset="0.14" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.86" stop-color="#000" stop-opacity="0" />
        <stop offset="0.86" stop-color="#000" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0.35" />
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
        :y2="props.fit ? view.y : -offset"
        class="stroke-current text-on-surface-variant"
        stroke-width="3"
        stroke-dasharray="10 12"
        opacity="0.5"
      />

      <rect
        v-if="gold"
        data-test="glow"
        pointer-events="none"
        :x="gold.left"
        :y="floorY(gold.floor)"
        :width="gold.width"
        :height="barHeight"
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

      <template v-for="(bar, floor) in props.bars" :key="floor">
        <rect
          data-test="bar"
          :x="bar.left"
          :y="floorY(floor)"
          :width="bar.width"
          :height="barHeight"
          :fill="fillOf(floor)"
        />
        <rect
          data-test="shade"
          pointer-events="none"
          :x="bar.left"
          :y="floorY(floor)"
          :width="bar.width"
          :height="barHeight"
          :fill="`url(#${shadeId})`"
        />
      </template>

      <template v-if="props.slider">
        <rect
          data-test="slider"
          :x="props.slider.x"
          :y="floorY(props.slider.floor)"
          :width="props.slider.width"
          :height="barHeight"
          :fill="fillOf(props.slider.floor)"
        />
        <rect
          pointer-events="none"
          :x="props.slider.x"
          :y="floorY(props.slider.floor)"
          :width="props.slider.width"
          :height="barHeight"
          :fill="`url(#${shadeId})`"
        />
      </template>

      <g v-if="gold" data-test="gold" pointer-events="none">
        <path
          v-for="(spot, i) in SPARKLES"
          :key="i"
          data-test="sparkle"
          :d="
            star(gold.left + gold.width * spot.fx, floorY(gold.floor) + barHeight * spot.fy, px(4))
          "
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
        <g v-for="floor in props.perfects" :key="`perfect-${floor}`" data-test="perfect">
          <template v-if="props.bars[floor]">
            <path
              v-for="(cx, i) in [
                props.bars[floor]!.left,
                props.bars[floor]!.left + props.bars[floor]!.width,
              ]"
              :key="i"
              class="stack-sparkle"
              pointer-events="none"
              :d="star(cx, floorY(floor) + barHeight, px(6))"
              :fill="dark ? FLARE_DARK : FLARE_LIGHT"
            />
          </template>
        </g>

        <g
          v-for="(cut, i) in props.cuts"
          :key="i"
          data-test="cut"
          class="stack-fall"
          pointer-events="none"
        >
          <rect
            :x="cut.left"
            :y="floorY(cut.floor)"
            :width="cut.width"
            :height="barHeight"
            :fill="fillOf(cut.floor)"
          />
          <rect
            :x="cut.left"
            :y="floorY(cut.floor)"
            :width="cut.width"
            :height="barHeight"
            :fill="`url(#${shadeId})`"
          />
        </g>
      </template>
    </g>
  </svg>
</template>

<style scoped>
/* A CSS animation starts on insertion; SMIL would count from the SVG's mount and skip a late cut. */
.stack-fall {
  animation: stack-fall 600ms ease-in forwards;
}

/* Flares up and out where the bar met its edges; fill-box, so it scales about its own centre. */
.stack-sparkle {
  transform-box: fill-box;
  transform-origin: center;
  animation: stack-sparkle 500ms ease-out forwards;
}

@keyframes stack-sparkle {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 1;
  }
  40% {
    transform: scale(1.2) rotate(30deg);
    opacity: 1;
  }
  100% {
    transform: scale(0.4) rotate(60deg);
    opacity: 0;
  }
}

@keyframes stack-fall {
  to {
    transform: translateY(800px);
    opacity: 0;
  }
}
</style>
