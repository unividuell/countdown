<script setup lang="ts">
/**
 * The card lab's index: every card the community page shows where no game is. Gated with the game
 * lab, and like it linked from nowhere.
 */
import { cardLabList } from '@/cardlab/cards'
import { useCommunityContext } from '@/communities/context'
import LabGate from '@/gamelab/LabGate.vue'

const { community } = useCommunityContext()
</script>

<template>
  <LabGate title="Karten-Labor">
    <div>
      <div class="mb-1 flex items-baseline justify-between">
        <h1 class="text-lg font-semibold">Karten-Labor</h1>
        <RouterLink
          :to="`/c/${community.slug}/lab`"
          data-test="lab-other"
          class="text-lg text-on-surface-variant hover:text-on-surface"
        >
          Spiel-Labor
        </RouterLink>
      </div>
      <p class="mb-4 text-sm text-on-surface-variant">
        Karten ohne Spiel in „{{ community.name }}“
      </p>

      <ul data-test="card-lab-list" class="space-y-2">
        <li v-for="card in cardLabList" :key="card.id">
          <RouterLink
            :to="`/c/${community.slug}/card-lab/${card.id}`"
            :data-test="`card-lab-${card.id}`"
            class="flex min-h-11 items-center justify-between rounded-lg border border-outline px-4 hover:bg-surface-container"
          >
            <span class="text-sm font-medium">{{ card.title }}</span>
            <code class="text-xs text-on-surface-variant">{{ card.id }}</code>
          </RouterLink>
        </li>
      </ul>
    </div>
  </LabGate>
</template>
