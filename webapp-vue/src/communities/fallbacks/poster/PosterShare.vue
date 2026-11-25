<script setup lang="ts">
/**
 * The poster's share button. It sits inside the poster it shares — found as the nearest
 * `[data-poster]` — and is left out of the picture.
 *
 * The picture is rendered once the poster has settled and again whenever the poster changes (a
 * late roster), so the tap only hands over a file that is already there. Until then the button
 * holds its place, invisible.
 */
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import IconShare from '~icons/lucide/share'
import { CHROME_ATTR, renderPoster, settled, sharePicture } from './share'

const props = defineProps<{
  /** Without extension: `huettehuette-2027-06-24`. */
  fileName: string
  /** What the share sheet names it. */
  title: string
}>()

/** A burst of changes (a re-render) is one new picture, not one per node. */
const SETTLE_MS = 300

const button = useTemplateRef<HTMLButtonElement>('button')
const file = shallowRef<File | null>(null)

let observer: MutationObserver | null = null
let pending: ReturnType<typeof setTimeout> | undefined
// A picture of an older poster must not land after a newer one.
let generation = 0

async function prepare(poster: HTMLElement): Promise<void> {
  const mine = ++generation
  file.value = null

  try {
    await settled(poster)
    const blob = await renderPoster(poster)
    if (mine === generation) {
      file.value = new File([blob], `${props.fileName}.png`, { type: 'image/png' })
    }
  } catch (error) {
    console.warn('poster picture failed', error)
  }
}

onMounted(() => {
  const poster = button.value?.closest<HTMLElement>('[data-poster]')
  if (!poster) return

  void prepare(poster)

  // Changes inside the button itself (its own visibility) are not the poster changing.
  observer = new MutationObserver((records) => {
    if (records.every((r) => button.value?.contains(r.target))) return
    clearTimeout(pending)
    pending = setTimeout(() => void prepare(poster), SETTLE_MS)
  })
  observer.observe(poster, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(pending)
  generation++
})

function share(): void {
  if (!file.value) return
  sharePicture(file.value, props.title).catch((error) => console.warn('poster share failed', error))
}
</script>

<template>
  <button
    ref="button"
    type="button"
    data-test="poster-share"
    v-bind="{ [CHROME_ATTR]: '' }"
    aria-label="Poster teilen"
    :disabled="file === null"
    class="flex size-11 cursor-pointer items-center justify-center rounded-full transition-opacity hover:bg-current/10"
    :class="file ? 'opacity-100' : 'invisible opacity-0'"
    @click="share"
  >
    <IconShare class="size-5" aria-hidden="true" />
  </button>
</template>
