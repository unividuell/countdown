<script setup lang="ts">
import { onMounted, ref } from 'vue'
import IconX from '~icons/lucide/x'
import { deleteImage, listImages, originalUrl, thumbUrl, type ImageResponse } from '@/api/images'
import { uploadFile } from '@/api/upload'
import UploadQueueRows from '@/ui/UploadQueueRows.vue'
import { useUploadQueue } from '@/ui/useUploadQueue'

const props = defineProps<{ base: string }>()

const images = ref<ImageResponse[]>([])
const used = ref(0)
const limit = ref(0)

/**
 * Only an admin's listing is the whole pool; a member's holds their own uploads alone. The quota
 * and the uploader's name are both about a pool you can see all of, so they stay hidden otherwise.
 */
const viewerIsAdmin = ref(false)
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

const { queue, enqueue } = useUploadQueue({
  upload: (file, onProgress) => uploadFile<ImageResponse>(props.base, file, file.name, onProgress),
  reasonFor: (code) => REASONS[code],
  afterAll: load,
})

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

    <UploadQueueRows :rows="queue" />

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
