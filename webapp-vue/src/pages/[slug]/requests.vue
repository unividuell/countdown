<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, approveMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const error = ref<string | null>(null)
const pending = computed(() => all.value.filter((m) => m.status === 'PENDING'))

async function load(): Promise<void> {
  all.value = await listMembers(slug)
}
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await fn()
    await load()
    await refresh() // update the shell pending badge
  } catch {
    error.value = 'Aktion fehlgeschlagen.'
  }
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Beitrittsanfragen</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <p v-if="!pending.length" class="text-sm text-neutral-500">Keine offenen Anfragen.</p>
    <ul class="space-y-2">
      <li
        v-for="m in pending"
        :key="m.userId"
        class="flex items-center justify-between gap-2 border-b py-2 text-sm"
      >
        <span>{{ m.username }}</span>
        <span class="flex gap-2">
          <button
            data-test="approve"
            class="rounded border px-2 py-0.5"
            @click="run(() => approveMember(slug, m.userId))"
          >
            Bestätigen
          </button>
          <button
            class="rounded border px-2 py-0.5 text-red-600"
            @click="run(() => removeMember(slug, m.userId))"
          >
            Ablehnen
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>
