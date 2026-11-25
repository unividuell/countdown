<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RosterMemberResponse } from '@/api/types'
import { pickPoster, posterList } from '@/communities/fallbacks/poster/posters'

const COLORS = ['#8e44ad', '#e67e22', '#16a085', '#c0392b', '#2980b9', '#f1c40f', '#7f8c8d']

const title = ref('Hüttenwochenende 2026')
const gameRounds = ref(25)
// „Name Punkte“, comma-separated: ties and long names are one edit away.
const input = ref('Fry 12, Leela 12, Bender 9, Amy 7, Hermes 4, Zoidberg 0')
// Stands in for the edition id; the community page draws from the real one.
const seed = ref('0193f1c2-7a4b-7c3d-9e8f-0123456789ab')
/** A poster id, or '' to take the seed's pick. */
const override = ref('')

const members = computed<RosterMemberResponse[]>(() =>
  input.value
    .split(',')
    .map((part) => part.trim().match(/^(.+?)(?:\s+(-?\d+))?$/))
    .filter((m) => m !== null)
    .map((m, i) => ({
      userId: `lab-${i}`,
      shortName: m[1]!.slice(0, 4).toUpperCase(),
      fullName: m[1]!,
      bgColorHex: COLORS[i % COLORS.length]!,
      points: { stable: Number(m[2] ?? 0) },
      streak: 0,
    })),
)

const picked = computed(() => pickPoster(seed.value))
const poster = computed(() => posterList.find((p) => p.id === override.value) ?? picked.value)
</script>

<template>
  <component :is="poster.component" :title="title" :members="members" :game-rounds="gameRounds" />

  <section class="mt-8 space-y-3 border-t border-outline pt-4">
    <label class="flex flex-col gap-1 text-sm">
      Mitspielende („Name Punkte“, mit Komma getrennt)
      <input
        v-model="input"
        data-test="card-lab-members"
        type="text"
        class="h-11 rounded-md border border-outline bg-surface px-3"
      />
    </label>

    <div class="flex gap-3">
      <label class="flex flex-1 flex-col gap-1 text-sm">
        Titel
        <input
          v-model="title"
          data-test="card-lab-title"
          type="text"
          class="h-11 rounded-md border border-outline bg-surface px-3"
        />
      </label>
      <label class="flex w-28 flex-col gap-1 text-sm">
        Spielrunden
        <input
          v-model.number="gameRounds"
          data-test="card-lab-rounds"
          type="number"
          min="1"
          inputmode="numeric"
          class="h-11 rounded-md border border-outline bg-surface px-3"
        />
      </label>
    </div>

    <label class="flex flex-col gap-1 text-sm">
      Seed (Edition-ID)
      <input
        v-model="seed"
        data-test="card-lab-seed"
        type="text"
        class="h-11 rounded-md border border-outline bg-surface px-3 font-mono text-xs"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      Variante
      <select
        v-model="override"
        data-test="card-lab-variant"
        class="h-11 rounded-md border border-outline bg-surface px-3"
      >
        <option value="">Aus Seed: {{ picked.title }}</option>
        <option v-for="p in posterList" :key="p.id" :value="p.id">{{ p.title }}</option>
      </select>
    </label>
  </section>
</template>
