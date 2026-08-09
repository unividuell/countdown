<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, promoteMember, demoteMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'
import ActionButton from '@/ui/ActionButton.vue'
import { useKeyedAction } from '@/ui/useAction'

useAdminGuard()
const { community } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const active = computed(() => all.value.filter((m) => m.status === 'ACTIVE'))
const { isBusy, error, run } = useKeyedAction((e) =>
  (e as { status?: number }).status === 409
    ? 'Die Community braucht mindestens einen Admin.'
    : 'Aktion fehlgeschlagen.',
)

async function load(): Promise<void> {
  all.value = await listMembers(slug)
}

function promote(userId: string): Promise<void> {
  return run(`promote:${userId}`, async () => {
    await promoteMember(slug, userId)
    await load()
  })
}

function demote(userId: string): Promise<void> {
  return run(`demote:${userId}`, async () => {
    await demoteMember(slug, userId)
    await load()
  })
}

function remove(userId: string): Promise<void> {
  return run(`remove:${userId}`, async () => {
    await removeMember(slug, userId)
    await load()
  })
}
onMounted(load)
</script>

<template>
  <section class="mx-auto max-w-lg py-8">
    <h1 class="mb-4 text-xl font-semibold">Mitglieder</h1>
    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>
    <ul class="space-y-2">
      <li
        v-for="m in active"
        :key="m.userId"
        class="flex items-center justify-between gap-2 border-b py-2 text-sm"
      >
        <span>{{ m.username }} <em v-if="m.isAdmin" class="text-neutral-500">(Admin)</em></span>
        <span class="flex gap-2">
          <ActionButton
            v-if="!m.isAdmin"
            :data-test="`promote-${m.userId}`"
            :busy="isBusy(`promote:${m.userId}`)"
            class="rounded border px-2 py-0.5"
            @click="promote(m.userId)"
          >
            Zu Admin
          </ActionButton>
          <ActionButton
            v-else
            :data-test="`demote-${m.userId}`"
            :busy="isBusy(`demote:${m.userId}`)"
            class="rounded border px-2 py-0.5"
            @click="demote(m.userId)"
          >
            Admin entz.
          </ActionButton>
          <ActionButton
            :data-test="`remove-${m.userId}`"
            :busy="isBusy(`remove:${m.userId}`)"
            class="rounded border px-2 py-0.5 text-red-600"
            @click="remove(m.userId)"
          >
            Entfernen
          </ActionButton>
        </span>
      </li>
    </ul>
  </section>
</template>
