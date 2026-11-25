<script setup lang="ts">
/**
 * The closing poster as a podium: the edition's name, the congratulation, the top three ranks on
 * their steps, the full table under it, and what the run amounted to.
 */
import { computed } from 'vue'
import IconMedal from '~icons/lucide/medal'
import Avatar from '@/ui/Avatar.vue'
import RoundSurface from '@/ui/RoundSurface.vue'
import { winnerMessage } from '@/communities/fallbacks/messages'
import { formatWinnerNames } from '@/members/winner'
import type { PosterProps } from './posters'
import { podium, standings } from './standings'

const props = defineProps<PosterProps>()

const table = computed(() => standings(props.members))
const steps = computed(() => podium(table.value))

const message = computed(() =>
  winnerMessage(
    formatWinnerNames(
      table.value.filter((r) => r.rank === 1 && r.points > 0).map((r) => r.member.fullName),
    ),
  ),
)

const STEP_HEIGHTS: Record<number, string> = { 1: 'h-20', 2: 'h-14', 3: 'h-10' }
</script>

<template>
  <RoundSurface data-test="poster-podium">
    <div class="flex flex-col items-center text-center">
      <p class="font-mono text-[11px] tracking-[0.14em] text-on-surface-variant uppercase">
        {{ title }}
      </p>
      <IconMedal class="mt-4 size-8 text-primary" aria-hidden="true" />
      <h2 class="mt-2 text-xl font-semibold text-balance text-on-surface">{{ message.title }}</h2>

      <ol class="mt-6 flex w-full items-end justify-center gap-2" aria-label="Siegerpodest">
        <li
          v-for="step in steps"
          :key="step.rank"
          data-test="poster-step"
          class="flex w-1/3 max-w-32 flex-col items-center"
        >
          <div class="mb-2 flex flex-wrap justify-center -space-x-2">
            <Avatar
              v-for="row in step.rows"
              :key="row.member.userId"
              :short-name="row.member.shortName"
              :bg-color-hex="row.member.bgColorHex"
              :size="step.rank === 1 ? 'lg' : 'sm'"
              :title="row.member.fullName"
            />
          </div>
          <div
            class="flex w-full justify-center rounded-t-md bg-surface-container pt-1 font-mono text-lg font-semibold text-on-surface"
            :class="STEP_HEIGHTS[step.rank]"
          >
            {{ step.rank }}
          </div>
        </li>
      </ol>

      <ol class="w-full divide-y divide-outline border-t border-outline text-left text-sm">
        <li
          v-for="row in table"
          :key="row.member.userId"
          data-test="poster-row"
          class="flex items-center gap-3 py-2"
        >
          <span class="w-6 text-right text-on-surface-variant tabular-nums">{{ row.rank }}.</span>
          <Avatar
            :short-name="row.member.shortName"
            :bg-color-hex="row.member.bgColorHex"
            size="sm"
          />
          <span class="min-w-0 flex-1 truncate text-on-surface">{{ row.member.fullName }}</span>
          <span class="font-medium text-on-surface tabular-nums">{{ row.points }}</span>
        </li>
      </ol>

      <p data-test="poster-stats" class="mt-6 text-sm text-on-surface-variant">
        {{ gameRounds }} Spielrunden · {{ members.length }} Mitspielende
      </p>
      <p class="mt-1 text-base font-semibold text-on-surface">{{ message.text }}</p>
    </div>
  </RoundSurface>
</template>
