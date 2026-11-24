<script setup lang="ts">
import { computed, ref } from 'vue'
import MessageCard from '@/communities/fallbacks/MessageCard.vue'
import { winnerMessage } from '@/communities/fallbacks/messages'
import { formatWinnerNames } from '@/members/winner'

// Comma-separated, so a tie of any size and any name length is one edit away.
const input = ref('Fry, Leela')

const names = computed(() =>
  formatWinnerNames(
    input.value
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  ),
)
</script>

<template>
  <MessageCard v-bind="winnerMessage(names)" />

  <section class="mt-8 space-y-2 border-t border-outline pt-4">
    <label class="flex flex-col gap-1 text-sm">
      Gewinner (mit Komma getrennt)
      <input
        v-model="input"
        data-test="card-lab-names"
        type="text"
        class="h-11 rounded-md border border-outline bg-surface px-3"
      />
    </label>
  </section>
</template>
