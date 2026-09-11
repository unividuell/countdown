<script setup lang="ts">
import { onMounted, ref } from 'vue'
import IconX from '~icons/lucide/x'
import {
  deleteImage,
  listImages,
  originalUrl,
  thumbUrl,
  uploadImage,
  UploadError,
  type ImageResponse,
} from '@/api/images'

const props = defineProps<{ base: string }>()

interface QueueRow {
  name: string
  progress: number
  state: 'queued' | 'running' | 'done' | 'failed'
  message?: string
}

const images = ref<ImageResponse[]>([])
const used = ref(0)
const limit = ref(0)

/**
 * Only an admin's listing is the whole pool; a member's holds their own uploads alone. The quota
 * and the uploader's name are both about a pool you can see all of, so they stay hidden otherwise.
 */
const viewerIsAdmin = ref(false)
const queue = ref<QueueRow[]>([])
const error = ref<string | null>(null)

/** Server codes carry no copy; the German sentence is built here. */
const REASONS: Record<string, string> = {
  HEIC_UNSUPPORTED: 'HEIC wird nicht unterstützt — als JPEG exportieren.',
  UNSUPPORTED_FORMAT: 'Nur JPEG, PNG, GIF und WebP.',
  TOO_LARGE: 'Zu groß (höchstens 15 MB).',
  TOO_MANY_PIXELS: 'Zu viele Bildpunkte (höchstens 40 MP).',
  POOL_FULL: 'Der Pool ist voll.',
  DUPLICATE: 'Dieses Bild ist schon im Pool.',
  BROKEN_IMAGE: 'Die Datei ließ sich nicht lesen.',
  NETWORK: 'Verbindung unterbrochen.',
}

async function load(): Promise<void> {
  const response = await listImages(props.base)
  images.value = response.images
  used.value = response.used
  limit.value = response.limit
  viewerIsAdmin.value = response.viewerIsAdmin
}

/**
 * One after another, on purpose: parallel uploads share the same mobile connection, so everything
 * takes just as long and five bars move at once without saying anything.
 */
async function enqueue(files: File[]): Promise<void> {
  // Read the row back from `queue.value` rather than keeping the plain object `.map()` made:
  // only the reactive proxy's own setters notify the template, so a later `row.state = ...`
  // on the un-proxied object would silently never repaint.
  const start = queue.value.length
  queue.value.push(...files.map((f) => ({ name: f.name, progress: 0, state: 'queued' as const })))

  for (const [i, file] of files.entries()) {
    const row = queue.value[start + i]
    if (!row) continue
    row.state = 'running'
    try {
      await uploadImage(props.base, file, (fraction) => (row.progress = fraction))
      row.state = 'done'
    } catch (e) {
      row.state = 'failed'
      row.message =
        e instanceof UploadError
          ? (REASONS[e.code] ?? 'Upload fehlgeschlagen.')
          : 'Upload fehlgeschlagen.'
    }
  }
  await load()
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void enqueue(Array.from(input.files))
  input.value = ''
}

async function remove(id: string): Promise<void> {
  if (!window.confirm('Dieses Bild endgültig löschen?')) return
  error.value = null
  try {
    await deleteImage(props.base, id)
    await load()
  } catch {
    error.value = 'Löschen fehlgeschlagen.'
  }
}

onMounted(() => {
  // An empty grid and "0 von 0" already look like an empty pool, so a failed initial load must
  // say so explicitly rather than pass for one.
  load().catch(() => {
    error.value = 'Bilder konnten nicht geladen werden.'
  })
})
defineExpose({ enqueue })
</script>

<template>
  <section class="mx-auto max-w-2xl px-4 py-6">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold">Bilder</h1>
      <span v-if="viewerIsAdmin" data-test="quota" class="text-sm text-neutral-500"
        >{{ used }} von {{ limit }}</span
      >
    </div>

    <!--
      The system's own picker, like a date picker: on iOS this opens the sheet (library, camera,
      files), on Android the system chooser, and the library allows multi-selection. `accept` is
      more than a filter here -- Safari converts HEIC to JPEG when HEIC is not in the list, which
      is why image/jpeg comes first.
    -->
    <label
      class="mb-4 flex min-h-11 cursor-pointer items-center justify-center rounded border border-dashed px-4 py-6 text-center text-sm"
    >
      <input
        type="file"
        class="sr-only"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        data-test="picker"
        @change="onPick"
      />
      Bilder auswählen
    </label>

    <ul v-if="queue.length" class="mb-4 space-y-1.5 text-sm">
      <li v-for="(row, i) in queue" :key="i" data-test="queue-row">
        <!-- The reason gets its own line, full width: a message like „HEIC wird nicht
             unterstützt“ is far wider than a status word and must not fight the filename for
             room in one row, or squeeze it away and overflow a narrow phone. -->
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate">{{ row.name }}</span>
          <span v-if="row.state === 'running'" class="shrink-0"
            >{{ Math.round(row.progress * 100) }} %</span
          >
          <span v-else-if="row.state === 'done'" class="shrink-0 text-neutral-500">Fertig</span>
          <span v-else-if="row.state === 'failed'" class="shrink-0 text-red-600"
            >Fehlgeschlagen</span
          >
          <span v-else class="shrink-0 text-neutral-400">Wartet</span>
        </div>
        <p v-if="row.state === 'failed'" class="text-xs text-red-600">{{ row.message }}</p>
      </li>
    </ul>

    <p v-if="error" class="mb-3 text-sm text-red-600">{{ error }}</p>

    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <li v-for="image in images" :key="image.id" class="relative space-y-1">
        <!-- A new tab, not an overlay: the browser's own image view brings pinch-zoom and saving. -->
        <a
          :href="originalUrl(props.base, image.id)"
          target="_blank"
          rel="noopener"
          data-test="original-link"
        >
          <img
            :src="thumbUrl(props.base, image.id)"
            loading="lazy"
            :alt="image.uploadedBy"
            class="aspect-[4/3] w-full rounded object-cover"
          />
        </a>
        <!--
          Sits on the tile's top-right corner, overhanging just enough to read as attached to this
          image rather than to the row below it. A quarter of the box, not half: at half the
          28px disc crossed the grid's 12px gap and touched the neighbouring tile, and the 44px
          hit area reached into it. A quarter keeps both inside the gap.
        -->
        <button
          data-test="delete"
          aria-label="Bild löschen"
          class="absolute top-0 right-0 z-10 grid size-11 -translate-y-1/4 translate-x-1/4 cursor-pointer place-items-center"
          @click="remove(image.id)"
        >
          <span
            class="grid size-7 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm"
          >
            <IconX class="size-4" aria-hidden="true" />
          </span>
        </button>

        <p v-if="viewerIsAdmin" class="truncate text-xs text-neutral-500">
          {{ image.uploadedBy }}
        </p>
      </li>
    </ul>
  </section>
</template>
