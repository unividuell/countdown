<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getInviteName, joinByToken } from '@/api/communities'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { stashPostLoginRedirect } from '@/auth/postLoginRedirect'
import { communityPath } from '@/communities/routes'

// Public so an invited stranger sees WHO is inviting before GitHub asks them anything.
definePage({ meta: { public: true } })

const route = useRoute('/join/[token]')
const router = useRouter()
const { status, loginWithGitHub } = useAuth()
const state = ref<'loading' | 'invited' | 'pending' | 'error'>('loading')
const name = ref('')
const message = ref('')

function explain(e: unknown): string {
  return e instanceof ApiError && e.status === 410
    ? 'Dieser Einladungslink ist abgelaufen.'
    : 'Dieser Einladungslink ist ungültig.'
}

async function accept(): Promise<void> {
  try {
    const r = await joinByToken(route.params.token)
    if (r.status === 'ALREADY_ACTIVE') {
      await router.replace(communityPath(r.slug))
      return
    }
    state.value = 'pending'
    message.value = `Antrag für „${r.name}“ gestellt — warte auf Bestätigung durch einen Spielleiter.`
  } catch (e) {
    state.value = 'error'
    message.value = explain(e)
  }
}

onMounted(async () => {
  // Signed in, following an invite link IS the acceptance — including the return trip from OAuth.
  if (status.value === 'authenticated') return accept()
  try {
    name.value = (await getInviteName(route.params.token)).name
    state.value = 'invited'
  } catch (e) {
    state.value = 'error'
    message.value = explain(e)
  }
})

function signIn(): void {
  // The route is public now, so the auth guard no longer stashes the destination for us.
  stashPostLoginRedirect(route.fullPath)
  loginWithGitHub()
}
</script>

<template>
  <section class="mx-auto max-w-md py-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-neutral-500">Einladung wird geprüft…</p>

    <template v-else-if="state === 'invited'">
      <p class="mb-6 text-base">Du bist zu „{{ name }}“ eingeladen.</p>
      <button
        data-test="join-accept"
        class="rounded bg-stone-900 px-4 py-2 text-stone-50 hover:bg-stone-700"
        @click="signIn"
      >
        Beitreten
      </button>
    </template>

    <p v-else-if="state === 'pending'" class="text-sm">{{ message }}</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
  </section>
</template>
