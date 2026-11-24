<script setup lang="ts">
/**
 * One card of the card lab: the card where the round sits on the community page, its controls
 * under it — the game lab's order.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { cardLabList } from '@/cardlab/cards'
import LabGate from '@/gamelab/LabGate.vue'

const route = useRoute('/c/[slug]/card-lab/[card]/')
const cardId = computed(() => String(route.params.card ?? ''))
const card = computed(() => cardLabList.find((c) => c.id === cardId.value))
</script>

<template>
  <LabGate title="Karten-Labor">
    <!-- mt-6: the community page's gap above the round. -->
    <div v-if="card" class="mt-6">
      <component :is="card.component" :key="card.id" />
    </div>
    <div v-else data-test="card-lab-unknown" class="py-8 text-center">
      <h1 class="mb-2 text-lg font-semibold">Unbekannte Karte</h1>
      <p class="text-sm text-on-surface-variant">
        Für „{{ cardId }}“ gibt es im Labor keine Karte.
      </p>
    </div>
  </LabGate>
</template>
