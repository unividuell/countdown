import { computed, onScopeDispose, readonly, ref, shallowRef, watch, type Ref } from 'vue'
import {
  type AssetKey,
  fetchSealed,
  openSealed,
  type RoundAssets,
  warmUpOpening,
} from '@/api/assets'
import type { SceneState } from '@/ui/sceneState'

/**
 * One sealed asset as a value: the ciphertext is fetched as soon as the round has a URL for it, and
 * opened into an object URL as soon as the key is there — which may be much later (a staged asset
 * is keyed on the stage, a solution on the guess). So `ready` means „the bytes are here“, not „`src`
 * is set“; a cover waiting on the scene needs the first, a player on the second.
 *
 * ```
 * url ──fetch──▶ bytes ─┐
 *                       ├──open──▶ src (object URL)
 * key ──────────────────┘
 * ```
 *
 * `retry` is the cover's „Nochmal versuchen“: it starts over from the URL, whatever went wrong.
 */
export function useSealedAsset(
  assets: () => RoundAssets | undefined,
  name: string,
): {
  state: Readonly<Ref<SceneState>>
  src: Readonly<Ref<string | null>>
  retry: () => void
} {
  const state = ref<SceneState>('preparing')
  const src = ref<string | null>(null)
  const bytes = shallowRef<Uint8Array | null>(null)

  const url = computed(() => assets()?.url(name))

  // A fresh response hands over an equal key as a new object; reuse the old one so only a different
  // key re-opens.
  const key = computed<AssetKey | null>((previous) => {
    const next = assets()?.key(name) ?? null
    const same =
      previous && next && previous.key === next.key && previous.mediaType === next.mediaType
    return same ? previous : next
  })

  // An await in flight still resumes after the scope is gone; whatever it would create belongs to nobody.
  let disposed = false
  let fetching = 0
  let opening = 0

  function release(): void {
    if (src.value) URL.revokeObjectURL(src.value)
    src.value = null
  }

  function load(current: string | undefined): void {
    const mine = ++fetching
    release()
    bytes.value = null
    state.value = 'preparing'
    if (!current) return

    fetchSealed(current).then(
      (sealed) => {
        if (disposed || mine !== fetching) return

        // No key yet: the reveal is still to come, so this is free time. With a key the opening
        // follows right away and a warm-up would only delay it.
        if (!key.value) warmUpOpening()

        bytes.value = sealed
        state.value = 'ready'
      },
      () => {
        if (disposed || mine !== fetching) return
        state.value = 'failed'
      },
    )
  }

  watch(url, load, { immediate: true })

  function retry(): void {
    if (!disposed) load(url.value)
  }

  watch([bytes, key], async ([sealed, opener]) => {
    const mine = ++opening
    const current = url.value
    if (!sealed || !opener || !current) return

    let blob: Blob
    try {
      blob = openSealed(sealed, opener)
    } catch {
      // The cached bytes may predate the round's current sealing; the fresh ones get one go.
      try {
        blob = openSealed(await fetchSealed(current, true), opener)
      } catch {
        if (!disposed && mine === opening) state.value = 'failed'
        return
      }
    }
    if (disposed || mine !== opening) return

    release()
    src.value = URL.createObjectURL(blob)
    // An earlier key may have failed to open these bytes; a later one that does ends that.
    state.value = 'ready'
  })

  onScopeDispose(() => {
    disposed = true
    release()
  })

  return { state: readonly(state), src: readonly(src), retry }
}
