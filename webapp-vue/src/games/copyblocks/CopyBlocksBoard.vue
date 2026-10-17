<script setup lang="ts">
/**
 * Playing: the build field card-wide on top, the template below at three quarters width — the
 * strips beside it still scroll the page — and under it the hold that submits.
 *
 * The build is saved as a draft after every change; undo, the chosen slot and the cameras are not.
 */
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, ref, shallowReactive, shallowRef, watch } from 'vue'
import IconUndo from '~icons/lucide/undo-2'
import IconVolume from '~icons/lucide/volume-2'
import IconMuted from '~icons/lucide/volume-x'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'
import BlockScene from './BlockScene.vue'
import { BLOCK_TYPES } from './blockTypes'
import CentreButton from './CentreButton.vue'
import type { BlockCode } from './blockTypes'
import CopyBlocksBriefing from './CopyBlocksBriefing.vue'
import { deviceStorage, loadDraft, saveDraft, sweepDrafts } from './draft'
import { fieldOf, templateFieldOf } from './field'
import type { Cell } from './field'
import { playSound, preloadSounds } from './sounds'
import { iconUrl, pickaxeIconUrl } from './textures'
import { TOOL_BUTTON } from './toolButton'
import { MAX_COORDINATE, MAX_GUESS_BLOCKS } from './types'
import type { CopyBlocksGuess, CopyBlocksPayload, GuessBlock } from './types'
import { START_CAMERA } from './view'
import type { Camera, Hit } from './view'

const props = defineProps<{
  /** `null` while sealed: the server withholds the round until the reveal. */
  payload: CopyBlocksPayload | null
  sealed: boolean
  disabled: boolean
  /** Where the draft lives; `null` keeps the build in memory only. */
  draftKey: string | null
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

/** The build field's camera, so the reveal opens at the angle of the submission. */
const camera = defineModel<Camera>('camera', { required: true })

const emit = defineEmits<{ guess: [value: CopyBlocksGuess]; reveal: [] }>()

const PICKAXE = 'PICKAXE'
type Slot = BlockCode | typeof PICKAXE

interface HotbarSlot {
  id: Slot
  label: string
  /** A 16 × 16 pixel picture — the pickaxe's like the blocks'. */
  icon: string
}

/** Painted on the sections too: under the cover they stand empty, in their view's colour. */
const BUILD_GROUND = '#cfe2f4'
const TEMPLATE_GROUND = '#9cc3ea'

/** The round on show; `null` under the cover, where no 3D view is built. */
const round = computed(() => (props.sealed ? null : props.payload))
const playable = computed(() => round.value !== null && !props.disabled)

const build = shallowRef<GuessBlock[]>([])
/** Earlier builds, newest last. Memory only: after a reload, undo starts empty. */
const history = shallowReactive<GuessBlock[][]>([])
const picked = ref<Slot | null>(null)
const slot = computed<Slot>(() => picked.value ?? props.payload?.types[0] ?? PICKAXE)
const sound = useLocalStorage('copy-blocks:sound', true)
const canSubmit = computed(() => playable.value && build.value.length > 0)

const storage = deviceStorage()
const templateCamera = ref<Camera>({ ...START_CAMERA })

const buildField = computed(() => round.value && fieldOf(build.value, round.value.grid))
const templateField = computed(() => round.value && templateFieldOf(round.value.blocks))

const hotbar = computed<HotbarSlot[]>(() => [
  ...(round.value?.types ?? []).map((code) => ({
    id: code,
    label: BLOCK_TYPES[code].name,
    icon: iconUrl(code),
  })),
  { id: PICKAXE, label: 'Spitzhacke', icon: pickaxeIconUrl() },
])

// Opening a round restores its draft and drops the player's stale drafts of other rounds.
watch(
  () => props.draftKey,
  (key) => {
    if (key === null || props.payload === null) return

    sweepDrafts(storage, key)
    build.value = loadDraft(storage, key, props.payload.types) ?? []
    history.length = 0
  },
  { immediate: true },
)

watch(build, (blocks) => {
  if (props.draftKey !== null) saveDraft(storage, props.draftKey, blocks)
})

onMounted(preloadSounds)

const at = (block: GuessBlock, [x, y, z]: Cell): boolean =>
  block.x === x && block.y === y && block.z === z

function commit(next: GuessBlock[]): void {
  history.push(build.value)
  build.value = next
}

/** Refuses what the server would: a block past the limit, or a coordinate out of range. */
function place(cell: Cell | null, type: BlockCode): void {
  if (cell === null || build.value.length >= MAX_GUESS_BLOCKS) return
  if (cell.some((v) => Math.abs(v) > MAX_COORDINATE)) return
  if (build.value.some((b) => at(b, cell))) return

  commit([...build.value, { x: cell[0], y: cell[1], z: cell[2], type }])
  if (sound.value) playSound('place', type)
}

function remove(cell: Cell | null): void {
  const gone = cell && build.value.find((b) => at(b, cell))
  if (!gone) return

  commit(build.value.filter((b) => b !== gone))
  if (sound.value) playSound('break', gone.type)
}

function onTap(hit: Hit): void {
  if (!playable.value) return

  const chosen = slot.value
  if (chosen === PICKAXE) remove(hit.block)
  else place(hit.place, chosen)
}

/** Undo sounds like what it does: a block taken away breaks, a block brought back is placed. */
function undo(): void {
  const previous = history.pop()
  if (!previous) return

  const has = (blocks: GuessBlock[], b: GuessBlock) => blocks.some((o) => at(o, [b.x, b.y, b.z]))
  const gone = build.value.find((b) => !has(previous, b))
  const back = previous.find((b) => !has(build.value, b))
  build.value = previous

  if (!sound.value) return
  if (gone) playSound('break', gone.type)
  else if (back) playSound('place', back.type)
}

function submit(): void {
  if (canSubmit.value) emit('guess', { blocks: [...build.value] })
}
</script>

<template>
  <div data-test="copy-blocks-board" class="flex flex-col gap-6">
    <!-- Card-wide, like Platzierung's: the outer box cancels RoundSurface's padding, so the build
         field and the cover run edge to edge; the bottom padding, cancelled by `-mb-4`, keeps the
         rules' gap. -->
    <div class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div class="flex flex-col gap-3" :inert="!round || undefined">
        <section class="relative h-[46svh] overflow-hidden" :style="{ background: BUILD_GROUND }">
          <template v-if="buildField">
            <BlockScene
              v-model:camera="camera"
              :blocks="build"
              :field="buildField"
              build
              :background="BUILD_GROUND"
              @tap="onTap"
            />
            <div class="absolute top-1 left-1">
              <CentreButton v-model:camera="camera" />
            </div>
            <div class="absolute top-1 right-1 flex gap-1">
              <button
                type="button"
                aria-label="Rückgängig"
                :class="TOOL_BUTTON"
                :disabled="!playable || history.length === 0"
                @click="undo"
              >
                <IconUndo class="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Ton"
                :aria-pressed="sound"
                :class="TOOL_BUTTON"
                @click="sound = !sound"
              >
                <IconVolume v-if="sound" class="size-5" aria-hidden="true" />
                <IconMuted v-else class="size-5" aria-hidden="true" />
              </button>
            </div>

            <!-- Minecraft-style hotbar over the foot of the field. It never scrolls: on a narrow
                 phone the slots shrink below 44 px instead — the one exception to that floor. -->
            <div class="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
              <div
                class="pointer-events-auto flex max-w-full items-start gap-0.5 rounded-md bg-neutral-800/75 p-0.5"
              >
                <button
                  v-for="s in hotbar"
                  :key="s.id"
                  type="button"
                  :data-test="`copy-blocks-slot-${s.id}`"
                  :aria-label="s.label"
                  :aria-pressed="slot === s.id"
                  class="flex aspect-square w-11 min-w-0 shrink cursor-pointer items-center justify-center rounded border-2"
                  :class="slot === s.id ? 'border-white' : 'border-neutral-600'"
                  @click="picked = s.id"
                >
                  <img
                    :src="s.icon"
                    alt=""
                    draggable="false"
                    class="pointer-events-none w-[73%] [image-rendering:pixelated] [-webkit-touch-callout:none]"
                  />
                </button>
              </div>
            </div>
          </template>
        </section>

        <section
          class="relative mx-auto h-[34svh] w-3/4 overflow-hidden rounded-lg"
          :style="{ background: TEMPLATE_GROUND }"
        >
          <template v-if="round && templateField">
            <BlockScene
              v-model:camera="templateCamera"
              :blocks="round.blocks"
              :field="templateField"
              :background="TEMPLATE_GROUND"
            />
            <div class="absolute top-1 left-1">
              <CentreButton v-model:camera="templateCamera" />
            </div>
          </template>
        </section>

        <!-- The slot stands under the cover too, empty, so the reveal does not push the rules
             down. `HoldButton` fills its parent and has no size of its own. -->
        <div class="relative mx-auto size-20" :class="{ 'opacity-40': round && !canSubmit }">
          <template v-if="round">
            <HoldButton
              :ready="true"
              :disabled="!canSubmit"
              label="Nachbau abgeben — gedrückt halten"
              color="#171717"
              @confirm="submit"
            />
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-white"
            >
              Abgeben
            </span>
          </template>
        </div>
      </div>
      <RevealCover v-if="!round" state="ready" :busy="props.disabled" @start="emit('reveal')" />
    </div>

    <CopyBlocksBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
