<script setup lang="ts">
/**
 * The lab index's game list: every game the server's catalogue has, the community's `OFF` ones
 * included — the lab tests games, not the community's mix.
 *
 * Its own component so the request goes out only behind `LabGate`.
 */
import { onMounted, ref } from 'vue'
import { listGames } from '@/api/games'
import type { GameEntry } from '@/api/types'
import { gameLink } from './options'
import type { LabPhase } from './types'

const props = defineProps<{ slug: string; phase: LabPhase; ramp: boolean }>()

const games = ref<GameEntry[] | null>(null)
const failed = ref(false)

onMounted(async () => {
  try {
    games.value = await listGames(props.slug)
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <p v-if="failed" data-test="lab-games-error" class="text-sm text-error">
    Die Spiele lassen sich gerade nicht laden.
  </p>
  <ul v-else-if="games?.length" data-test="lab-game-list" class="space-y-2">
    <li v-for="game in games" :key="game.id">
      <RouterLink
        :to="gameLink(`/c/${slug}/lab/${game.id}`, phase, ramp)"
        :data-test="`lab-game-${game.id}`"
        class="flex min-h-11 items-center justify-between rounded-lg border border-outline px-4 hover:bg-surface-container"
      >
        <span class="text-sm font-medium">{{ game.displayName }}</span>
        <code class="text-xs text-on-surface-variant">{{ game.id }}</code>
      </RouterLink>
    </li>
  </ul>
  <p v-else-if="games" data-test="lab-no-games" class="text-sm text-on-surface-variant">
    Auf diesem Server ist noch kein Spiel eingetragen.
  </p>
</template>
