<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DateTime } from 'luxon'
import { listSuperAdmins } from '@/api/superAdmin'
import type { SuperAdminUser } from '@/api/types'
import IconChevron from '~icons/lucide/chevron-right'

const rows = ref<SuperAdminUser[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

// The column and the allowlist drift by design — the flag is re-derived on every login.
// Naming which source a row comes from is the whole point of this table.
function statusLabel(u: SuperAdminUser): string {
  if (u.flagged && u.allowlisted) return 'Aktiv'
  if (u.allowlisted) return 'Wartet auf ersten Login'
  return 'Nicht mehr auf der Allowlist — Flag erlischt beim nächsten Login'
}
// No community context here, so the app's default zone rather than the browser's.
function formatDate(iso: string | null): string {
  return iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).toFormat('dd.MM.yyyy') : '—'
}

onMounted(async () => {
  try {
    rows.value = await listSuperAdmins()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-3xl px-4 py-8">
    <h1 class="mb-4 text-xl font-semibold">Super-Admin</h1>

    <ul class="mb-8 divide-y rounded border">
      <li>
        <RouterLink
          to="/super-admin/users"
          data-test="nav-entry"
          class="flex min-h-11 items-center px-4 py-3 hover:bg-neutral-100"
        >
          Nutzer
          <IconChevron class="ml-auto size-4 text-neutral-400" />
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/super-admin/communities"
          data-test="nav-entry"
          class="flex min-h-11 items-center px-4 py-3 hover:bg-neutral-100"
        >
          Spielgemeinschaften
          <IconChevron class="ml-auto size-4 text-neutral-400" />
        </RouterLink>
      </li>
    </ul>

    <h2 class="mb-2 font-medium">Super-Admins</h2>
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Super-Admins konnten nicht geladen werden.
    </p>
    <table v-else class="w-full text-left text-sm">
      <thead>
        <tr class="border-b text-neutral-500">
          <th class="py-1 pr-4 font-medium">GitHub</th>
          <th class="py-1 pr-4 font-medium">Name</th>
          <th class="py-1 pr-4 font-medium">Status</th>
          <th class="py-1 font-medium">seit</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in rows" :key="u.githubLogin" data-test="super-admin-row" class="border-b">
          <td class="py-1 pr-4">
            <code>{{ u.githubLogin }}</code>
          </td>
          <td class="py-1 pr-4">{{ u.username ?? '—' }}</td>
          <td class="py-1 pr-4">{{ statusLabel(u) }}</td>
          <td class="py-1">{{ formatDate(u.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
