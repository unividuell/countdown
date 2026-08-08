<script setup lang="ts">
/**
 * The lab's index: which games can be tried in this community.
 *
 * It lives under `/c/:slug/lab` rather than at the root because a test round is always played
 * inside a real community — that is the whole point of testing here instead of on a scratch page.
 *
 * Links carry no seed on purpose. The game page rolls one and writes it into the URL, so there is
 * exactly one place that decides what an absent seed means, and following a link twice gives two
 * different rounds — which is what you want from an index.
 *
 * See docs/superpowers/specs/2026-08-08-game-lab-design.md.
 */
import { useCommunityContext } from '@/communities/context'
import { labGameList } from '@/gamelab/games'

const { community } = useCommunityContext()
</script>

<template>
  <div>
    <h1 class="mb-1 text-lg font-semibold">Spiel-Labor</h1>
    <p class="mb-4 text-sm text-neutral-600">Testrunde in „{{ community.name }}“</p>

    <ul v-if="labGameList.length" data-test="lab-game-list" class="space-y-2">
      <li v-for="game in labGameList" :key="game.id">
        <RouterLink
          :to="`/c/${community.slug}/lab/${game.id}`"
          :data-test="`lab-game-${game.id}`"
          class="flex min-h-11 items-center justify-between rounded-lg border border-neutral-200 px-4 hover:bg-neutral-100"
        >
          <span class="text-sm font-medium">{{ game.title }}</span>
          <code class="text-xs text-neutral-500">{{ game.id }}</code>
        </RouterLink>
      </li>
    </ul>
    <p v-else data-test="lab-no-games" class="text-sm text-neutral-600">
      Im Labor ist noch kein Spiel eingetragen.
    </p>
  </div>
</template>
