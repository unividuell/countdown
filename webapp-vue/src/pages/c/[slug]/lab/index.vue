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
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCommunityContext } from '@/communities/context'
import LabOptions from '@/gamelab/LabOptions.vue'
import { labGameList } from '@/gamelab/games'
import { gameLink, phaseFrom, rampFrom, withPhase, withRamp } from '@/gamelab/options'
import { switchPlayerHref } from '@/gamelab/switchPlayer'
import type { LabPhase } from '@/gamelab/types'

const { community } = useCommunityContext()
const route = useRoute()
const router = useRouter()

// The settings that hold for any game, chosen here and carried into every link — in this page's
// URL too, so coming back from a game keeps them.
const phase = computed(() => phaseFrom(route.query))
const ramp = computed(() => rampFrom(route.query))

function writePhase(next: LabPhase): void {
  router.replace({ query: withPhase(route.query, next) })
}

function writeRamp(on: boolean): void {
  router.replace({ query: withRamp(route.query, on) })
}
</script>

<template>
  <div>
    <h1 class="mb-1 text-lg font-semibold">Spiel-Labor</h1>
    <p class="mb-4 text-sm text-on-surface-variant">Testrunde in „{{ community.name }}“</p>

    <ul v-if="labGameList.length" data-test="lab-game-list" class="space-y-2">
      <li v-for="game in labGameList" :key="game.id">
        <RouterLink
          :to="gameLink(`/c/${community.slug}/lab/${game.id}`, phase, ramp)"
          :data-test="`lab-game-${game.id}`"
          class="flex min-h-11 items-center justify-between rounded-lg border border-outline px-4 hover:bg-surface-container"
        >
          <span class="text-sm font-medium">{{ game.title }}</span>
          <code class="text-xs text-on-surface-variant">{{ game.id }}</code>
        </RouterLink>
      </li>
    </ul>
    <p v-else data-test="lab-no-games" class="text-sm text-on-surface-variant">
      Im Labor ist noch kein Spiel eingetragen.
    </p>

    <section data-test="lab-index-options" class="mt-8 space-y-2 border-t border-outline pt-4">
      <h2 class="text-xs font-semibold tracking-wide text-on-surface/40 uppercase">
        Für jedes Spiel
      </h2>
      <LabOptions :phase="phase" :ramp="ramp" @phase-change="writePhase" @ramp-change="writeRamp" />
      <!-- Full page load: the picker is server-rendered HTML, and the redirect lands back here. -->
      <a
        data-test="lab-switch-player"
        :href="switchPlayerHref(route.fullPath)"
        class="flex h-11 w-fit cursor-pointer items-center rounded-md border border-outline px-3 text-sm hover:bg-surface-container"
      >
        Spieler wechseln
      </a>
    </section>
  </div>
</template>
