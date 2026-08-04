<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { listUsers } from '@/api/superAdmin'
import type { SuperAdminUserListEntry } from '@/api/types'

const rows = ref<SuperAdminUserListEntry[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

onMounted(async () => {
  try {
    rows.value = await listUsers()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink to="/super-admin" class="mb-4 inline-block text-sm text-blue-700 hover:underline">
      ← Super-Admin
    </RouterLink>
    <h1 class="mb-4 text-xl font-semibold">Nutzer</h1>

    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error'" class="text-sm text-red-600">
      Die Nutzer konnten nicht geladen werden.
    </p>
    <p v-else-if="!rows.length" class="text-sm text-neutral-500">Noch keine Nutzer.</p>
    <ul v-else class="divide-y rounded border">
      <li v-for="u in rows" :key="u.userId" data-test="user-row">
        <RouterLink
          :to="`/super-admin/users/${u.userId}`"
          class="flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-neutral-100"
        >
          <span class="min-w-0">
            <span class="block truncate">{{ u.username }}</span>
            <code class="block truncate text-xs text-neutral-500">@{{ u.githubLogin }}</code>
          </span>
          <span class="ml-auto flex shrink-0 gap-1">
            <!-- Super-admin subsumes the clearance, so the two badges are exclusive. -->
            <span
              v-if="u.isSuperAdmin"
              data-test="super-admin-badge"
              class="rounded bg-blue-600 px-1.5 text-xs text-white"
            >
              Super-Admin
            </span>
            <span
              v-else-if="u.communityCreationAllowed"
              data-test="clearance-badge"
              class="rounded bg-emerald-100 px-1.5 text-xs text-emerald-800"
            >
              Erstellen erlaubt
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
