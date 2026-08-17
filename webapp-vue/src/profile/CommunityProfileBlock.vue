<script setup lang="ts">
/**
 * How the viewer appears in ONE community — all of it or none of it.
 *
 * The switch decides what saving does, and nothing else: it is not itself a write, because it
 * would then be the only control on the page that bypasses the save button.
 */
import { onMounted, ref, watch } from 'vue'
import Avatar from '@/ui/Avatar.vue'
import ActionButton from '@/ui/ActionButton.vue'
import { useAction } from '@/ui/useAction'
import {
  deleteMemberProfile,
  getMemberProfile,
  previewMemberAvatar,
  putMemberProfile,
} from '@/api/profile'
import { clampName, NAME_MAX, useProfileDraft } from '@/profile/useProfileDraft'
import { saveErrorMessage } from '@/profile/saveError'
import { ApiError } from '@/api/client'
import type { IdentityView, MemberProfileResponse } from '@/api/types'

const props = defineProps<{ slug: string; communityName: string }>()
const emit = defineEmits<{ saved: [] }>()

const draft = useProfileDraft((body) => previewMemberAvatar(props.slug, body))
const { busy, error, run } = useAction(saveErrorMessage)
const enabled = ref(false)
/** What applies without an override — the sentence shown while the switch is off. */
const inherited = ref<IdentityView | null>(null)
/**
 * No membership row here to carry an override. A super-admin passes `requireActiveMember` without
 * belonging, and then every path of this block asks for a row that does not exist: the GET 404s,
 * and a Speichern would send a DELETE that 404s too.
 */
const noMembership = ref(false)

// `GET .../me/profile` answers the *effective* identity, which equals the inherited one only
// while no override is stored. For a member who has one, this is the only way to ask "what would
// apply with none at all" — reusing the GET's own identity there would show them their own
// override as the thing they supposedly inherit. A failed ask is not worth an error banner: it
// only costs the off-state its preview line, so it is logged and swallowed, never surfaced.
async function refreshInherited(): Promise<void> {
  try {
    inherited.value = await previewMemberAvatar(props.slug, { displayName: null, bgColorHex: null })
  } catch (e) {
    console.error('could not preview the inherited identity', e)
  }
}

async function load(): Promise<void> {
  let profile: MemberProfileResponse
  try {
    profile = await getMemberProfile(props.slug)
  } catch (e) {
    // The shell already renders "Kein Zugriff" for a slug the viewer cannot reach at all, so a
    // 404 that got as far as this block means the community exists for them and the membership
    // row does not.
    if (e instanceof ApiError && e.status === 404) {
      noMembership.value = true
      return
    }
    throw e
  }
  noMembership.value = false
  enabled.value = profile.displayName !== null || profile.bgColorHex !== null
  draft.seed(profile.displayName, profile.bgColorHex, profile.identity)
  if (enabled.value) {
    await refreshInherited()
  } else {
    // No override stored: the effective identity the GET just answered already IS the inherited
    // one, so asking the preview endpoint again would only spend a request to hear the same thing.
    inherited.value = profile.identity
  }
}

onMounted(() => {
  load().catch((e) => console.error('could not load the community profile', e))
})

// Switching on adopts what applies today — the colour AND, when nothing has been typed yet, the
// name — so the avatar does not change the moment somebody opens the block. `seed()` alone only
// gets the colour there (it falls back to the identity's own colour when none is stored); the name
// has no such fallback, so without this it would render empty instead of what is showing
// everywhere else, and without `colorSet` the prefilled colour would be dropped again on save.
// Switching off asks again what would apply with no override — the one on screen is this member's
// own, and leaving it in place would show it as its own replacement.
watch(enabled, (on) => {
  if (on) {
    draft.colorSet.value = true
    if (!draft.name.value) draft.name.value = clampName(inherited.value?.username)
  } else {
    refreshInherited()
  }
})

// The page calls this after a GLOBAL save: what this block inherits has just changed, and the
// sentence above quotes it by name.
defineExpose({ refreshInherited })

function save(): Promise<void> {
  return run(async () => {
    if (enabled.value) {
      const saved = await putMemberProfile(props.slug, draft.body.value)
      draft.seed(saved.displayName, saved.bgColorHex, saved.identity)
    } else {
      await deleteMemberProfile(props.slug)
      await load()
    }
    emit('saved')
  })
}
</script>

<template>
  <section class="rounded border border-neutral-200 p-4">
    <h2 class="mb-1 text-lg font-semibold">Bei {{ props.communityName }}</h2>

    <p v-if="noMembership" data-test="override-none" class="text-sm text-neutral-600">
      Du bist hier kein Mitglied. Einen eigenen Auftritt gibt es nur, wo du dazugehörst.
    </p>

    <template v-else>
      <label class="mb-3 flex items-center gap-2 text-sm">
        <input
          v-model="enabled"
          data-test="override-switch"
          type="checkbox"
          class="size-4 cursor-pointer"
        />
        Eigener Auftritt hier
      </label>

      <p
        v-if="!enabled && inherited"
        data-test="override-inherited"
        class="flex items-center gap-3 text-sm"
      >
        <Avatar v-bind="inherited.avatar" size="sm" />
        <span class="text-neutral-600"
          >Hier gilt dein globales Profil: „{{ inherited.username }}“.</span
        >
      </p>

      <div v-if="enabled" class="flex items-center gap-3">
        <Avatar
          v-if="draft.preview.value"
          data-test="override-preview"
          v-bind="draft.preview.value.avatar"
        />
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <input
            v-model="draft.name.value"
            data-test="override-name"
            type="text"
            :maxlength="NAME_MAX"
            class="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1.5"
          />
          <input
            v-model="draft.colorInput.value"
            data-test="override-color"
            type="color"
            aria-label="Hintergrundfarbe"
            class="h-9 w-12 shrink-0 cursor-pointer rounded border border-neutral-300"
            @input="draft.colorSet.value = true"
          />
        </div>
      </div>

      <div class="mt-3">
        <ActionButton data-test="override-save" :busy="busy" @click="save">Speichern</ActionButton>
      </div>
      <p v-if="error" data-test="override-error" class="mt-2 text-sm text-red-600">{{ error }}</p>
    </template>
  </section>
</template>
