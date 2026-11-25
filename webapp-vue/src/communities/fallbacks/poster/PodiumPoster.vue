<script setup lang="ts">
/**
 * The closing poster as a podium, in the ramp posters' type: heavy capitals set to the full width.
 *
 *   HÜTTEHÜTTE '27 ········ 2027-06-24
 *   ▪  confetti in the players' colours  ▴
 *            GLÜCKWUNSCH
 *            FRY · LEELA            one line per winner
 *   [2]      [1]      [3]           solid steps, numbers cut out
 *   1  FRY ······················ 12
 *   25 RUNDEN │ 6 DABEI │ 52 PUNKTE
 *   ███ UND JETZT VIEL SPAẞ ZUSAMMEN ███
 *
 * On `inverse-surface`, as the countdown card: dark in the light, light in the dark. Phase two's
 * colour takes its inverse twin there.
 */
import { computed } from 'vue'
import IconMedal from '~icons/lucide/medal'
import Avatar from '@/ui/Avatar.vue'
import PosterPrint from '@/ui/ramp/PosterPrint.vue'
import { winnerMessage } from '@/communities/fallbacks/messages'
import { formatWinnerNames } from '@/members/winner'
import { hash32 } from '@/lib/hash32'
import { targetDay, yearSuffix } from '@/communities/editionDate'
import FitLine from './FitLine.vue'
import type { PosterProps } from './posters'
import { podium, standings } from './standings'

const props = defineProps<PosterProps>()

const table = computed(() => standings(props.members))
const steps = computed(() => podium(table.value))
const winners = computed(() => table.value.filter((r) => r.rank === 1 && r.points > 0))
const totalPoints = computed(() => table.value.reduce((sum, r) => sum + r.points, 0))

const message = computed(() =>
  winnerMessage(formatWinnerNames(winners.value.map((r) => r.member.fullName))),
)

// The header's title, year suffix included, and the final's day: `HÜTTEHÜTTE '27 · 2027-06-24`.
const heading = computed(() => `${props.title}${yearSuffix(props.targetAt, props.targetTimezone)}`)
const day = computed(() => targetDay(props.targetAt, props.targetTimezone))

const STEP_HEIGHTS: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' }
// Rise order: third first, the winner last.
const STEP_DELAYS: Record<number, string> = { 1: '360ms', 2: '180ms', 3: '0ms' }

// Scattered from the title and the players: the same scatter on every device and every visit.
const CONFETTI = 22
const confetti = computed(() =>
  Array.from({ length: CONFETTI }, (_, i) => {
    const h = hash32(`${props.title}:${i}`)
    const member = props.members[i % Math.max(1, props.members.length)]

    return {
      left: `${h % 100}%`,
      top: `${(h >>> 7) % 100}%`,
      size: `${6 + ((h >>> 14) % 7)}px`,
      rotate: `${(h >>> 17) % 90}deg`,
      triangle: ((h >>> 24) & 1) === 1,
      color: member?.bgColorHex ?? 'var(--color-inverse-phase-two)',
      delay: `${(h >>> 20) % 600}ms`,
    }
  }),
)
</script>

<template>
  <div
    data-test="poster-podium"
    class="round-bleed overflow-hidden bg-inverse-surface text-inverse-on-surface sm:rounded-xl"
    :style="{ '--ground': 'var(--color-inverse-surface)' }"
  >
    <h2 class="sr-only">{{ message.title }}</h2>

    <PosterPrint data-test="poster-print" :left="heading" :right="day" />

    <div class="relative px-4 pt-6 pb-2" aria-hidden="true">
      <span
        v-for="(bit, i) in confetti"
        :key="i"
        class="confetti absolute block"
        :class="{ triangle: bit.triangle }"
        :style="{
          left: bit.left,
          top: bit.top,
          width: bit.size,
          height: bit.size,
          rotate: bit.rotate,
          backgroundColor: bit.color,
          animationDelay: bit.delay,
        }"
      />

      <div class="relative flex flex-col items-center gap-1">
        <IconMedal class="mb-2 size-9 text-inverse-phase-two" />
        <FitLine text="Glückwunsch" :max="64" class="w-full text-inverse-phase-two" />
        <FitLine
          v-for="row in winners"
          :key="row.member.userId"
          :text="row.member.fullName"
          :max="96"
          class="w-full"
        />
      </div>
    </div>

    <ol class="mt-6 flex items-end justify-center gap-1 px-4" aria-label="Siegerpodest">
      <li
        v-for="step in steps"
        :key="step.rank"
        data-test="poster-step"
        class="flex w-1/3 flex-col items-center"
      >
        <div class="mb-2 flex flex-wrap justify-center -space-x-2">
          <Avatar
            v-for="row in step.rows"
            :key="row.member.userId"
            class="pop"
            :style="{ animationDelay: `calc(${STEP_DELAYS[step.rank]} + 500ms)` }"
            :short-name="row.member.shortName"
            :bg-color-hex="row.member.bgColorHex"
            :size="step.rank === 1 ? 'lg' : 'sm'"
            :title="row.member.fullName"
          />
        </div>
        <div
          class="rise flex w-full justify-center bg-inverse-on-surface pt-2 text-inverse-surface"
          :class="STEP_HEIGHTS[step.rank]"
          :style="{ animationDelay: STEP_DELAYS[step.rank] }"
        >
          <span class="text-5xl font-black tracking-tighter">{{ step.rank }}</span>
        </div>
      </li>
    </ol>

    <ol class="mx-4 mt-4 divide-y divide-inverse-on-surface/15">
      <li
        v-for="row in table"
        :key="row.member.userId"
        data-test="poster-row"
        class="flex items-center gap-3 py-2"
        :class="{ 'text-inverse-phase-two': row.rank === 1 && row.points > 0 }"
      >
        <span class="w-8 text-right text-2xl font-black tracking-tighter tabular-nums">
          {{ row.rank }}
        </span>
        <Avatar
          :short-name="row.member.shortName"
          :bg-color-hex="row.member.bgColorHex"
          size="sm"
        />
        <span class="min-w-0 flex-1 truncate text-sm font-bold tracking-wide uppercase">
          {{ row.member.fullName }}
        </span>
        <span class="text-2xl font-black tracking-tighter tabular-nums">{{ row.points }}</span>
      </li>
    </ol>

    <dl
      data-test="poster-stats"
      class="mx-4 mt-6 grid grid-cols-3 divide-x divide-inverse-on-surface/15 border-y border-inverse-on-surface/15 text-center"
    >
      <div class="flex flex-col-reverse py-3">
        <dt class="text-[10px] font-medium tracking-[0.2em] uppercase opacity-70">Runden</dt>
        <dd class="text-4xl font-black tracking-tighter tabular-nums">{{ gameRounds }}</dd>
      </div>
      <div class="flex flex-col-reverse py-3">
        <dt class="text-[10px] font-medium tracking-[0.2em] uppercase opacity-70">Dabei</dt>
        <dd class="text-4xl font-black tracking-tighter tabular-nums">{{ members.length }}</dd>
      </div>
      <div class="flex flex-col-reverse py-3">
        <dt class="text-[10px] font-medium tracking-[0.2em] uppercase opacity-70">Punkte</dt>
        <dd class="text-4xl font-black tracking-tighter tabular-nums">{{ totalPoints }}</dd>
      </div>
    </dl>

    <p class="sr-only">{{ message.text }}</p>
    <div class="mt-6 bg-inverse-on-surface px-4 pt-3 pb-2 text-inverse-surface" aria-hidden="true">
      <FitLine :text="message.text" :max="40" />
    </div>
  </div>
</template>

<style scoped>
.triangle {
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

@media (prefers-reduced-motion: no-preference) {
  /* Each animation holds its first frame through its delay: nothing shows before its turn. */
  .confetti {
    animation: confetti-fall 900ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
  }

  .rise {
    transform-origin: bottom;
    animation: rise 600ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  }

  .pop {
    animation: pop 400ms cubic-bezier(0.3, 1.6, 0.5, 1) backwards;
  }
}

@keyframes confetti-fall {
  from {
    opacity: 0;
    translate: 0 -48px;
  }
}

@keyframes rise {
  from {
    transform: scaleY(0);
  }
}

@keyframes pop {
  from {
    transform: scale(0);
  }
}
</style>
