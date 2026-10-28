<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import IconPlay from '~icons/lucide/play'
import IconSquare from '~icons/lucide/square'
import IconX from '~icons/lucide/x'
import { clipUrl, deleteClip, listClips, type AudioClipResponse } from '@/api/audio'
import { uploadFile } from '@/api/upload'
import { MAX_SECONDS, prepareWav } from '@/audio/intake'
import UploadQueueRows from '@/ui/UploadQueueRows.vue'
import { usePlayback } from '@/ui/usePlayback'
import { useUploadQueue } from '@/ui/useUploadQueue'

const props = defineProps<{ base: string }>()

const clips = ref<AudioClipResponse[]>([])
const used = ref(0)
const limit = ref(0)

/**
 * Only an admin's listing is the whole pool; a member's holds their own uploads alone. The quota
 * and the uploader's name are both about a pool you can see all of, so they stay hidden otherwise.
 */
const viewerIsAdmin = ref(false)

/** The largest WAV the pool takes. Zero until the first listing says so, which keeps the picker off. */
const maxBytes = ref(0)
const limitKnown = computed(() => maxBytes.value > 0)
const error = ref<string | null>(null)

/** Server codes carry no copy; the German sentence is built here. */
const REASONS: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'Dieses Format nimmt der Server nicht an.',
  BROKEN_AUDIO: 'Die Datei ließ sich nicht lesen.',
  TOO_LONG: `Zu lang (höchstens ${MAX_SECONDS} s).`,
  UNDECODABLE: 'Dein Browser kann diese Datei nicht abspielen.',
  POOL_FULL: 'Der Pool ist voll.',
  DUPLICATE: 'Diese Datei ist schon im Pool.',
  NETWORK: 'Verbindung unterbrochen.',
}

/** A second of stereo WAV at 48 kHz, 16 bit: what "etwa 27 s Stereo" is counted in. */
const STEREO_BYTES_PER_SECOND = 48_000 * 2 * 2

/** Server and browser both refuse with this code; the limit it names is the listing's, not ours. */
function tooLarge(): string {
  const megabytes = Math.round(maxBytes.value / (1024 * 1024))
  const seconds = Math.floor(maxBytes.value / STEREO_BYTES_PER_SECOND)
  return `Zu lang (höchstens ${megabytes} MB als WAV, etwa ${seconds} s Stereo).`
}

const reasonFor = (code: string): string | undefined =>
  code === 'TOO_LARGE' ? tooLarge() : REASONS[code]

const seconds = (durationMs: number): string =>
  `${(durationMs / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`

async function load(): Promise<void> {
  const response = await listClips(props.base)
  clips.value = response.clips
  used.value = response.used
  limit.value = response.limit
  viewerIsAdmin.value = response.viewerIsAdmin
  maxBytes.value = response.maxBytes
}

const { queue, enqueue } = useUploadQueue({
  upload: (file, onProgress) =>
    prepareWav(file, maxBytes.value).then((wav) =>
      uploadFile<AudioClipResponse>(props.base, wav, file.name, onProgress),
    ),
  reasonFor,
  afterAll: load,
})

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void enqueue(Array.from(input.files))
  input.value = ''
}

const playback = usePlayback()

/** The row whose play button was tapped last: loading, sounding, or not yet stopped. */
const playingId = ref<string | null>(null)

// Sync, because `setSource` flips `playing` to false itself when it cuts off the previous clip.
// That has to clear the old row *before* `toggle` marks the new one; a later flush would clear the
// new one instead. A clip that ends by itself comes through here too.
watch(
  playback.playing,
  (on) => {
    if (!on) playingId.value = null
  },
  { flush: 'sync' },
)

function stop(): void {
  playback.pause()
  playingId.value = null
}

/** The source is set only now: it starts loading at once, so never for the whole list. */
function toggle(id: string): void {
  if (playingId.value === id) {
    stop()
    return
  }
  playback.setSource(clipUrl(props.base, id))
  playingId.value = id
  playback.restart()
}

async function remove(id: string): Promise<void> {
  if (!window.confirm('Diese Datei endgültig löschen?')) return
  error.value = null
  if (playingId.value === id) stop()
  try {
    await deleteClip(props.base, id)
    await load()
  } catch {
    error.value = 'Löschen fehlgeschlagen.'
  }
}

onMounted(() => {
  // An empty list and "0 von 0" already look like an empty pool, so a failed initial load must
  // say so explicitly rather than pass for one.
  load().catch(() => {
    error.value = 'Audio konnte nicht geladen werden.'
  })
})
defineExpose({ enqueue })
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">Audio</h1>
      <span v-if="viewerIsAdmin" data-test="quota" class="text-sm text-neutral-500"
        >{{ used }} von {{ limit }}</span
      >
    </div>

    <!-- Off until the listing has named the size limit: a file picked before that could not be checked. -->
    <label
      class="mb-4 flex min-h-11 items-center justify-center rounded border border-dashed px-4 py-6 text-center text-sm"
      :class="limitKnown ? 'cursor-pointer' : 'opacity-50'"
    >
      <input
        type="file"
        class="sr-only"
        accept="audio/*"
        multiple
        :disabled="!limitKnown"
        data-test="picker"
        @change="onPick"
      />
      Audiodateien auswählen
    </label>

    <UploadQueueRows :rows="queue" />

    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>

    <ul class="divide-y divide-neutral-200">
      <li v-for="clip in clips" :key="clip.id" data-test="clip-row" class="flex items-center gap-2">
        <button
          data-test="play"
          :aria-label="playingId === clip.id ? 'Anhalten' : 'Abspielen'"
          class="grid size-11 shrink-0 cursor-pointer place-items-center"
          @click="toggle(clip.id)"
        >
          <span
            class="grid size-9 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-700"
          >
            <IconSquare v-if="playingId === clip.id" class="size-4" aria-hidden="true" />
            <IconPlay v-else class="size-4" aria-hidden="true" />
          </span>
        </button>

        <div class="min-w-0 flex-1">
          <p class="truncate">{{ clip.fileName }}</p>
          <p v-if="viewerIsAdmin" class="truncate text-xs text-neutral-500">
            {{ clip.uploadedBy }}
          </p>
        </div>

        <span class="shrink-0 text-neutral-500">{{ seconds(clip.durationMs) }}</span>

        <button
          data-test="delete"
          aria-label="Datei löschen"
          class="grid size-11 shrink-0 cursor-pointer place-items-center text-neutral-500"
          @click="remove(clip.id)"
        >
          <IconX class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>
