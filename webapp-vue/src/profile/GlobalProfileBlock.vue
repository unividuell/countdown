<script setup lang="ts">
/**
 * The profile that applies wherever no community says otherwise.
 *
 * The avatar beside the fields is the server's answer, not a local guess — see useProfileDraft.
 */
import { watch } from 'vue'
import Avatar from '@/ui/Avatar.vue'
import ActionButton from '@/ui/ActionButton.vue'
import { useAuth } from '@/auth/useAuth'
import { useAction } from '@/ui/useAction'
import { previewAvatar, updateProfile } from '@/api/profile'
import { NAME_MAX, useProfileDraft } from '@/profile/useProfileDraft'
import { saveErrorMessage } from '@/profile/saveError'

// Saving here can change what applies inside a community too — whatever surrounds this block owns
// that knowledge, so it is told rather than asked. On `/profile` there is nothing to tell, and an
// emit nobody listens to costs nothing.
const emit = defineEmits<{ saved: [] }>()

const { user, bootstrap } = useAuth()
const draft = useProfileDraft(previewAvatar)
const { busy, error, run } = useAction(saveErrorMessage)

// `immediate: true` here is not the anti-pattern frontend-state.md's "watch without immediate"
// recipe warns about — that recipe covers a *prop* changing under an already-mounted component,
// where the default `pre` flush updates the flag before the child re-renders. `user` is a
// module-level ref that is normally already populated when this component is created (the
// router guard only admits 'authenticated'), so the callback must also run synchronously at
// setup on that path — `immediate: false` would never fire there and the block would render
// empty. It also still reacts if `user` only resolves after this component has mounted.
//
// `seeded` guards against clobbering an edit in progress: once the draft holds real data, only
// this component's own `save()` may replace it. `save()` itself calls `bootstrap()`, which
// replaces `user.value` again — without this guard that would re-trigger the watcher and
// re-seed over whatever the next edit already typed while that `bootstrap()` round-trip was
// still in flight.
let seeded = false
watch(
  user,
  (me) => {
    if (!me || seeded) return
    seeded = true
    draft.seed(me.displayName, me.bgColorHex, { username: me.username, avatar: me.avatar })
  },
  { immediate: true },
)

function save(): Promise<void> {
  return run(async () => {
    const saved = await updateProfile(draft.body.value)
    draft.seed(saved.displayName, saved.bgColorHex, {
      username: saved.username,
      avatar: saved.avatar,
    })
    await bootstrap()
    emit('saved')
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
