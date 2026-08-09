<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, approveMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'
import ActionButton from '@/ui/ActionButton.vue'
import { useKeyedAction } from '@/ui/useAction'

useAdminGuard()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const pending = computed(() => all.value.filter((m) => m.status === 'PENDING'))
const { isBusy, error, run } = useKeyedAction()

async function load(): Promise<void> {
  all.value = await listMembers(slug)
}

function approve(userId: string): Promise<void> {
  return run(`approve:${userId}`, async () => {
    await approveMember(slug, userId)
    await load()
    await refresh() // update the shell pending badge
  })
}

function reject(userId: string): Promise<void> {
  return run(`reject:${userId}`, async () => {
    await removeMember(slug, userId)
    await load()
    await refresh() // update the shell pending badge
  })
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
          <ActionButton
            :data-test="`approve-${m.userId}`"
            :busy="isBusy(`approve:${m.userId}`)"
            class="rounded border px-2 py-0.5"
            @click="approve(m.userId)"
          >
            Bestätigen
          </ActionButton>
          <ActionButton
            :data-test="`reject-${m.userId}`"
            :busy="isBusy(`reject:${m.userId}`)"
            class="rounded border px-2 py-0.5 text-red-600"
            @click="reject(m.userId)"
          >
            Ablehnen
          </ActionButton>
        </span>
      </li>
    </ul>
  </section>
</template>
