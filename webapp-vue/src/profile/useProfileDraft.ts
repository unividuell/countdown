import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { IdentityView, UpdateProfileRequest } from '@/api/types'

/** How long a field may rest before the server is asked what it would draw. */
export const PREVIEW_DEBOUNCE_MS = 300

/**
 * What `ProfileFields.MAX_NAME_LENGTH` allows, stated once for this runtime. Two blocks share the
 * limit, and a form constraint has to exist on both sides of the wire anyway.
 */
export const NAME_MAX = 32

/**
 * The value a name field may hold. `maxlength` governs typing, never assignment, and both blocks
 * prefill from values the server does not bound — an inherited `githubName`, or a `display_name`
 * stored before the server grew this limit. A field holding more than the server accepts turns
 * every preview into a 400 and leaves the last good avatar on screen: a preview that saving
 * cannot produce, which is the one failure this design must not have.
 */
export function clampName(raw: string | null | undefined): string {
  return (raw ?? '').slice(0, NAME_MAX)
}

/** Only used until the first seed lands, and never sent: `colorSet` decides what is sent. */
const PLACEHOLDER_COLOR = '#888888'

export interface ProfileDraft {
  name: Ref<string>
  colorInput: Ref<string>
  colorSet: Ref<boolean>
  body: ComputedRef<UpdateProfileRequest>
  preview: Ref<IdentityView | null>
  seed: (displayName: string | null, bgColorHex: string | null, identity: IdentityView) => void
}

/**
 * One editable profile: the two fields, what they mean on the wire, and the avatar they would
 * produce.
 *
 * The avatar is NOT computed here. The four characters come from a rule that lives once, in
 * Kotlin, so the draft asks the server for them — debounced, because it asks while the user types.
 */
export function useProfileDraft(
  fetchPreview: (body: UpdateProfileRequest) => Promise<IdentityView>,
): ProfileDraft {
  const name = ref('')
  const colorInput = ref(PLACEHOLDER_COLOR)
  const colorSet = ref(false)
  const preview = ref<IdentityView | null>(null)

  const body = computed<UpdateProfileRequest>(() => ({
    displayName: name.value.trim() || null,
    bgColorHex: colorSet.value ? colorInput.value : null,
  }))

  function seed(
    displayName: string | null,
    bgColorHex: string | null,
    identity: IdentityView,
  ): void {
    name.value = clampName(displayName)
    colorSet.value = bgColorHex !== null
    // The picker needs a colour even when none is chosen: it opens on what is drawn today.
    colorInput.value = bgColorHex ?? identity.avatar.bgColorHex
    preview.value = identity
  }

  // Only the newest answer may win. A slow reply to "Kle" must not overwrite the quick reply to
  // "Klemens" — the same sequence guard the community route data uses for its own loads.
  let seq = 0
  watchDebounced(
    body,
    async () => {
      const mine = ++seq
      try {
        const next = await fetchPreview(body.value)
        if (mine === seq) preview.value = next
      } catch (e) {
        // A preview is not worth an error message; the last good avatar stays on screen.
        console.error('avatar preview failed', e)
      }
    },
    { debounce: PREVIEW_DEBOUNCE_MS },
  )

  return { name, colorInput, colorSet, body, preview, seed }
}
