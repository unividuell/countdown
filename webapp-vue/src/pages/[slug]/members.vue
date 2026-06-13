<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listMembers, promoteMember, demoteMember, removeMember } from '@/api/communities'
import type { MemberResponse } from '@/api/types'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'

useAdminGuard()
const { community } = useCommunityContext()
const slug = community.value.slug
const all = ref<MemberResponse[]>([])
const error = ref<string | null>(null)
const active = computed(() => all.value.filter((m) => m.status === 'ACTIVE'))

async function load(): Promise<void> {
  all.value = await listMembers(slug)
}
async function run(fn: () => Promise<void>): Promise<void> {
  error.value = null
  try {
    await fn()
    await load()
  } catch (e) {
    error.value =
      (e as { status?: number }).status === 409
        ? 'Die Community braucht mindestens einen Admin.'
        : 'Aktion fehlgeschlagen.'
  }
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
          <button
            v-if="!m.isAdmin"
            class="rounded border px-2 py-0.5"
            @click="run(() => promoteMember(slug, m.userId))"
          >Zu Admin</button>
          <button
            v-else
            class="rounded border px-2 py-0.5"
            @click="run(() => demoteMember(slug, m.userId))"
          >Admin entz.</button>
          <button
            data-test="remove"
            class="rounded border px-2 py-0.5 text-red-600"
            @click="run(() => removeMember(slug, m.userId))"
          >Entfernen</button>
        </span>
      </li>
    </ul>
  </section>
</template>
