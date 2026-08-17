<script setup lang="ts">
/**
 * The profile that applies wherever no community says otherwise.
 *
 * The avatar beside the fields is the server's answer, not a local guess — see useProfileDraft.
 */
import Avatar from '@/ui/Avatar.vue'
import ActionButton from '@/ui/ActionButton.vue'
import { useAuth } from '@/auth/useAuth'
import { useAction } from '@/ui/useAction'
import { previewAvatar, updateProfile } from '@/api/profile'
import { useProfileDraft } from '@/profile/useProfileDraft'

const NAME_MAX = 32

const { user, bootstrap } = useAuth()
const draft = useProfileDraft(previewAvatar)
const { busy, error, run } = useAction(() => 'Speichern fehlgeschlagen.')

// Seeded synchronously, not in onMounted: the router guard only admits 'authenticated', so
// `user.value` is already resolved by the time this component is created — and the very first
// render must already show the stored avatar, not a placeholder that pops in a tick later.
const me = user.value
if (me) {
  draft.seed(me.displayName, me.bgColorHex, { username: me.username, avatar: me.avatar })
}

function save(): Promise<void> {
  return run(async () => {
    const saved = await updateProfile(draft.body.value)
    draft.seed(saved.displayName, saved.bgColorHex, {
      username: saved.username,
      avatar: saved.avatar,
    })
    await bootstrap()
  })
}
</script>

<template>
  <section class="rounded border border-neutral-200 p-4">
    <h2 class="mb-1 text-lg font-semibold">Überall</h2>
    <p class="mb-4 text-sm text-neutral-600">
      So erscheinst du in jeder Spielgemeinschaft, die nichts anderes sagt.
    </p>

    <div class="flex items-center gap-3">
      <Avatar
        v-if="draft.preview.value"
        data-test="global-preview"
        v-bind="draft.preview.value.avatar"
      />
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <input
          v-model="draft.name.value"
          data-test="global-name"
          type="text"
          :maxlength="NAME_MAX"
          :placeholder="user?.githubName ?? user?.githubLogin ?? ''"
          class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5"
        />
        <input
          v-model="draft.colorInput.value"
          data-test="global-color"
          type="color"
          aria-label="Hintergrundfarbe"
          class="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-300"
          @input="draft.colorSet.value = true"
        />
      </div>
    </div>

    <div class="mt-3 flex items-center gap-2">
      <ActionButton data-test="global-save" :busy="busy" @click="save">Speichern</ActionButton>
      <button
        v-if="draft.colorSet.value"
        data-test="global-auto"
        type="button"
        class="cursor-pointer text-sm text-neutral-600 underline"
        @click="draft.colorSet.value = false"
      >
        Farbe automatisch
      </button>
    </div>
    <p v-if="error" data-test="global-error" class="mt-2 text-sm text-red-600">{{ error }}</p>
  </section>
</template>
