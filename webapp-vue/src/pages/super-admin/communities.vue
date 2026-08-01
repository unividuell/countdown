<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DateTime } from 'luxon'
import { listAllCommunities } from '@/api/superAdmin'
import type { SuperAdminCommunity } from '@/api/types'

const communities = ref<SuperAdminCommunity[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

// Format in the community's own zone, never the browser's — the project rule for every
// community-relative timestamp, and it keeps this deterministic wherever CI runs.
function formatDate(iso: string | null, zone: string): string {
  return iso ? DateTime.fromISO(iso, { zone }).toFormat('dd.MM.yyyy') : '—'
}

onMounted(async () => {
  try {
    communities.value = await listAllCommunities()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-4xl px-4 py-8">
    <h1 class="mb-4 text-xl font-semibold">Alle Spielgemeinschaften</h1>
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Spielgemeinschaften konnten nicht geladen werden.
    </p>
    <template v-else>
      <article v-for="c in communities" :key="c.id" data-test="community" class="mb-8">
        <header class="mb-2 flex flex-wrap items-baseline gap-3 border-b pb-1">
          <h2 class="font-semibold">{{ c.name }}</h2>
          <code class="text-xs text-neutral-500">/{{ c.slug }}/</code>
          <span class="grow"></span>
          <RouterLink :to="`/${c.slug}/`" class="text-sm text-blue-700 hover:underline">
            Öffnen
          </RouterLink>
          <RouterLink :to="`/${c.slug}/settings`" class="text-sm text-blue-700 hover:underline">
            Einstellungen
          </RouterLink>
        </header>
        <p v-if="!c.members.length" class="text-sm text-neutral-500">Keine Mitglieder.</p>
        <table v-else class="w-full text-left text-sm">
          <thead>
            <tr class="border-b text-neutral-500">
              <th class="py-1 pr-4 font-medium">Name</th>
              <th class="py-1 pr-4 font-medium">GitHub</th>
              <th class="py-1 pr-4 font-medium">Status</th>
              <th class="py-1 pr-4 font-medium">Admin</th>
              <th class="py-1 font-medium">seit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in c.members" :key="m.userId" data-test="member" class="border-b">
              <td class="py-1 pr-4">{{ m.username }}</td>
              <td class="py-1 pr-4">
                <code>{{ m.githubLogin }}</code>
              </td>
              <td class="py-1 pr-4">
                <span
                  v-if="m.status === 'PENDING'"
                  class="rounded bg-amber-100 px-1.5 text-xs text-amber-800"
                >
                  ausstehend
                </span>
                <span v-else>aktiv</span>
              </td>
              <td class="py-1 pr-4">
                <span
                  v-if="m.isAdmin"
                  data-test="admin-badge"
                  class="rounded bg-blue-600 px-1.5 text-xs text-white"
                >
                  Admin
                </span>
              </td>
              <td class="py-1">{{ formatDate(m.joinedAt, c.startsAtTimezone) }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </template>
  </section>
</template>
