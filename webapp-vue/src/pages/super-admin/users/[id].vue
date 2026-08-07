<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { DateTime } from 'luxon'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import { getUser, setCommunityCreation } from '@/api/superAdmin'
import type { SuperAdminUserDetail } from '@/api/types'

const route = useRoute('/super-admin/users/[id]')
const id = String(route.params.id)

const user = ref<SuperAdminUserDetail | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const { busy, error, run } = useAction(() => 'Die Freischaltung konnte nicht geändert werden.')

// No community context here, so the app's default zone rather than the browser's.
function formatDate(iso: string | null): string {
  return iso ? DateTime.fromISO(iso, { zone: 'Europe/Berlin' }).toFormat('dd.MM.yyyy') : '—'
}

const allowed = computed(() => user.value?.communityCreationAllowed ?? false)

// Toggling the column would have no visible effect for a super-admin, and a control that does
// nothing is worse than none — so it is disabled and the reason is spelled out.
const locked = computed(() => user.value?.isSuperAdmin ?? false)

async function toggle(): Promise<void> {
  // The invariant belongs in the handler, not only in the button's disabled attribute: a super
  // admin's stored column has no effect on what they may do, so there is nothing to toggle.
  if (locked.value) return
  // No optimistic UI: adopt the server's answer, or keep the state we had.
  await run(async () => {
    user.value = await setCommunityCreation(id, !allowed.value)
  })
}

onMounted(async () => {
  try {
    user.value = await getUser(id)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-8">
    <RouterLink
      to="/super-admin/users"
      class="mb-4 inline-block text-sm text-blue-700 hover:underline"
    >
      ← Nutzer
    </RouterLink>

    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Lade…</p>
    <p v-else-if="state === 'error' || !user" class="text-sm text-red-600">
      Der Nutzer konnte nicht geladen werden.
    </p>
    <template v-else>
      <h1 class="text-xl font-semibold">{{ user.username }}</h1>
      <code class="mb-6 block text-sm text-neutral-500">@{{ user.githubLogin }}</code>

      <dl class="mb-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-neutral-500">GitHub-Login</dt>
        <dd>
          <code>{{ user.githubLogin }}</code>
        </dd>
        <dt class="text-neutral-500">GitHub-Name</dt>
        <dd>{{ user.githubName ?? '—' }}</dd>
        <dt class="text-neutral-500">Anzeigename</dt>
        <dd>{{ user.displayName ?? '—' }}</dd>
        <dt class="text-neutral-500">E-Mail</dt>
        <dd>{{ user.email ?? '—' }}</dd>
        <dt class="text-neutral-500">Farbe</dt>
        <dd>
          <span v-if="user.bgColorHex" class="flex items-center gap-2">
            <span
              class="inline-block size-4 rounded border"
              :style="{ backgroundColor: user.bgColorHex }"
            />
            <code>{{ user.bgColorHex }}</code>
          </span>
          <span v-else>—</span>
        </dd>
        <dt class="text-neutral-500">Mitglied seit</dt>
        <dd>{{ formatDate(user.createdAt) }}</dd>
        <dt class="text-neutral-500">zuletzt geändert</dt>
        <dd>{{ formatDate(user.updatedAt) }}</dd>
      </dl>

      <h2 class="mb-1 font-medium">Spielgemeinschaften erstellen</h2>
      <p class="mb-3 text-sm text-neutral-600">
        <span v-if="locked">Super-Admins dürfen immer erstellen.</span>
        <span v-else-if="allowed">Dieser Nutzer darf eigene Spielgemeinschaften erstellen.</span>
        <span v-else>Dieser Nutzer darf keine eigenen Spielgemeinschaften erstellen.</span>
      </p>
      <ActionButton data-test="toggle-clearance" :busy="busy" :disabled="locked" @click="toggle">
        {{ allowed ? 'Berechtigung entziehen' : 'Freischalten' }}
      </ActionButton>
      <p v-if="error" data-test="toggle-error" class="mt-3 text-sm text-red-600">{{ error }}</p>
    </template>
  </section>
</template>
