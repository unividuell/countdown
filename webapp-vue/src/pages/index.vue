<script setup lang="ts">
import { useRouter } from 'vue-router'
import { landingFailed, resolveLandingTarget } from '@/communities/landingGuard'

// The landing redirect is resolved in a router guard before this route commits, so on
// the happy path this component never renders. It exists for the failure case.
const router = useRouter()

async function retry(): Promise<void> {
  const target = await resolveLandingTarget()
  landingFailed.value = target === null
  if (target) router.replace(target).catch((e) => console.error('navigation failed', e))
}
</script>

<template>
  <section v-if="landingFailed" class="mx-auto max-w-md py-8 text-center">
    <h1 class="mb-2 text-lg font-semibold">Etwas ist schiefgelaufen</h1>
    <p class="mb-4 text-sm text-neutral-600">
      Deine Spielgemeinschaften konnten nicht geladen werden.
    </p>
    <button
      type="button"
      data-test="landing-retry"
      class="cursor-pointer rounded border px-3 py-1.5 text-sm hover:bg-neutral-200"
      @click="retry"
    >
      Erneut versuchen
    </button>
  </section>
</template>
