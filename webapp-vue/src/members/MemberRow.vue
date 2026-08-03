<script setup lang="ts">
/**
 * The ranking row, ported from the origin app's UserStatus, plus a fly-in.
 *
 * The row is laid out normally and only carries a `transform`, so the resting place is by
 * definition offset 0 and the layout never moves. Transforms are written straight to the DOM
 * rather than through reactive state — 120 substeps a second through Vue's scheduler would be
 * pointless work.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createSwarm, defaultTuning, type Swarm } from './swarm'
import { readableTextColor } from './readableTextColor'
import type { RosterMemberResponse } from '@/api/types'

const props = defineProps<{ members: RosterMemberResponse[] }>()

const row = ref<HTMLElement | null>(null)
const settled = ref(false)
let items: HTMLElement[] = []
let swarm: Swarm | null = null
let raf = 0
let lastFrame = 0

const textColors = computed(() => props.members.map((m) => readableTextColor(m.bgColorHex)))

function paint(): void {
  if (!swarm) return
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    const p = swarm.particles[i]
    if (!el || !p) continue
    el.style.transform = `translate3d(${p.x - p.tx}px, ${p.y - p.ty}px, 0) rotate(${p.tilt}deg)`
  }
}

function finish(): void {
  swarm = null
  for (const el of items) el.style.transform = ''
  // Only now may the row clip: `overflow-x: auto` computes `overflow-y` to `auto` as well, which
  // would cut the flying circles off at the ~62px band.
  settled.value = true
}

function tick(now: number): void {
  if (!swarm) return
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  swarm.step(dt)
  if (swarm.finished) return finish()
  paint()
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  const host = row.value
  if (!host) return
  items = [...host.querySelectorAll<HTMLElement>('[data-swarm-item]')]
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced && items.length > 0) {
    const targets = items.map((el) => {
      // The circle, not the column: collisions are circle-to-circle, and the points pill below
      // would drag the centre downwards.
      const circle = el.querySelector<HTMLElement>('[data-swarm-circle]') ?? el
      const r = circle.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    swarm = createSwarm({
      targets,
      stage: { width: window.innerWidth, height: window.innerHeight },
      tuning: defaultTuning,
    })
    // Paint the scattered start before revealing, so the row never flashes in place first.
    paint()
    lastFrame = performance.now()
    raf = requestAnimationFrame(tick)
  } else {
    settled.value = true
  }
  host.style.visibility = 'visible'
})

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div
    ref="row"
    data-test="row"
    class="flex w-full"
    :class="settled ? 'no-scrollbar overflow-x-auto' : 'overflow-visible'"
    style="visibility: hidden"
  >
    <div class="flex -space-x-2 p-0.5">
      <div
        v-for="(m, index) in members"
        :key="m.userId"
        data-swarm-item
        class="flex w-12 shrink-0 flex-col -space-y-1.5 will-change-transform"
        :style="{ zIndex: members.length - index }"
        :aria-label="`${m.fullName}, ${m.points.stable} Punkte`"
      >
        <div
          data-swarm-circle
          class="flex size-12 place-content-around rounded-full ring-2 ring-white"
          :style="{ background: m.bgColorHex, color: textColors[index] }"
        >
          <div class="place-self-center rotate-[-40deg] text-sm font-medium">{{ m.shortName }}</div>
        </div>
        <div
          class="h-4 w-6 place-self-center overflow-hidden rounded-lg bg-yellow-400 text-center text-xs whitespace-nowrap text-neutral-900 ring-1 ring-white"
        >
          {{ m.points.stable }}
        </div>
        <span
          v-if="m.points.live"
          data-test="live-points"
          class="z-20 animate-pulse self-end rounded-lg bg-rose-600 px-1 text-xs text-white ring-1 ring-yellow-400"
        >
          +{{ m.points.live }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tailwind v4 has no scrollbar utility; on a phone this strip is swiped, and a visible
   horizontal scrollbar there is a layout bug rather than an affordance. */
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
