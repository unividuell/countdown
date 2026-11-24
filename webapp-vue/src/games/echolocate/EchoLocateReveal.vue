<script setup lang="ts">
/**
 * The card after the round: the field as a map, and the scoreboard under it.
 *
 *   ┌──────────────────────┐
 *   │  clips · noises      │  every pin in its player's colour; a tapped name lights that
 *   │  pins ·  ·  ·        │  player's pings, rings and pins, larger, and draws each
 *   └──────────────────────┘  pin's line to its clip
 *    V Vögel  B Bach  …       the field's legend
 *    Auswertung …
 *
 * A click on a clip's circle plays that clip alone, without noise; on a noise's letter, that
 * noise. Again, it pauses. A clip's bytes are fetched on the first click, not before: most reveals
 * are only looked at.
 *
 * Beats come from `revealChoreography`: my own field stands as I left it, then at
 * the verdict the map fades in under it. The scoreboard carries its own beats.
 *
 *   ┌──────────────────────┐        ┌──────────────────────┐
 *   │  my pings, rings, pin│  ───▶  │  the map             │
 *   │                      │        │   + my pings, pin    │
 *   └──────────────────────┘        └──────────────────────┘
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { loadSealed } from '@/api/assets'
import type { RoundAssets } from '@/api/assets'
import { FADE_MS } from '@/games/revealChoreography'
import { provideRevealTimeline } from '@/games/revealTimeline'
import { unlockSound } from '@/ui/audio'
import { toWav } from '@/audio/toWav'
import { usePlayback } from '@/ui/usePlayback'
import { useSoundStage } from '@/ui/useSoundAwake'
import { isRecorded, RECORDINGS } from './engine'
import EchoLocateScoreboard from './EchoLocateScoreboard.vue'
import type { Wave } from './flow'
import { burstSamples } from './noise'
import type { ScoreRow } from './scoreboard'
import SonarField from './SonarField.vue'
import { clipAsset } from './types'
import type {
  Cell,
  EchoLocatePayload,
  EchoLocateSolution,
  MapSound,
  NoiseKind,
  Point,
} from './types'

const props = defineProps<{
  payload: EchoLocatePayload
  solution: EchoLocateSolution
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished map. */
  animate: boolean
  mineUserId: string | null
  /** Whether my tip earns the success sound (`myWin`); `null` plays nothing. */
  won: boolean | null
  /** The round's clips; without them, or without their key, the map plays nothing. */
  assets?: RoundAssets | undefined
}>()

const timeline = provideRevealTimeline({ animate: props.animate, won: () => props.won })

// The verdict is governed by the header's sound switch, which wakes the graph while it is here.
useSoundStage()

/** What one player's play puts on the field. Pings are centres only: no wave is running. */
function fieldOf(row: ScoreRow | undefined): {
  waves: Wave[]
  rings: number[][]
  pins: Point[]
  pinColorHex: string
} {
  return {
    waves: (row?.pings ?? []).map((at) => ({ at, startMs: null, endMs: null })),
    rings: row?.guess?.rings ?? [],
    pins: row?.guess?.pins ?? [],
    // Without a row there is no pin to colour.
    pinColorHex: row?.colorHex ?? '#525252',
  }
}

/** My play, when there is one to show — a give-up has no pings. */
const own = computed(() =>
  props.rows.find((row) => row.userId === props.mineUserId && row.guess !== null),
)

/** The map opens on my own play, as I left the field; a tap on a name moves it. */
const selected = ref<string | null>(own.value?.userId ?? null)

/** A selected row that is gone is skipped — rows keep arriving while the round is live. */
const chosen = computed(() =>
  props.rows.find((row) => row.userId === selected.value && row.guess !== null),
)

const shown = computed(() => fieldOf(chosen.value))

/** A line from each pin to the clip it was matched with: `pinOf[clip]` is that clip's pin. */
const links = computed(() => {
  const pinOf = chosen.value?.pinOf ?? null
  const pins = chosen.value?.guess?.pins ?? null
  if (pinOf === null || pins === null) return []

  return props.solution.targets.flatMap((target, clip): [Point, Cell][] => {
    const at = pinOf[clip]
    const pin = at === undefined ? undefined : pins[at]

    return pin === undefined ? [] : [[pin, target]]
  })
})

/** Everyone else's pins, each in its player's colour; the chosen player's own are drawn larger. */
const othersReached = timeline.reached('others')

/** Nobody else's pin before the verdict has rung out: they come with their rows. */
const otherPins = computed(() =>
  othersReached.value
    ? props.rows
        .filter((row) => row.userId !== chosen.value?.userId)
        .flatMap((row) => (row.guess?.pins ?? []).map((at) => ({ at, colorHex: row.colorHex })))
    : [],
)

/**
 * Whether my field stands alone until the solution beat. Asked once, on arrival: without a play
 * of mine, or without beats, the reveal shows the finished map at once.
 */
const intro = !timeline.still && own.value !== undefined

const ownField = computed(() => fieldOf(own.value))

const faded = ref(false)

// The map judges: it shows with the verdict.
if (intro) timeline.on('verdict', () => (faded.value = true))

/** Whether a click on a circle can play its clip: the key came with the round. */
const listenable = computed(() => props.assets?.key(clipAsset(0)) != null)

const playback = usePlayback()

/** The sound the player holds. */
const loaded = ref<MapSound | null>(null)

const playing = computed(() => (playback.playing.value ? loaded.value : null))

function same(a: MapSound | null, b: MapSound): boolean {
  return a?.kind === b.kind && a.place === b.place
}

/** Each source opened once, by asset name or noise kind. */
const urls = new Map<string, Promise<string>>()

/** A synthesised burst is rendered at this rate; the recordings bring their own. */
const NOISE_RATE = 44100

/** A noise as `usePlayback` takes it: the recording's own URL, or the burst as a WAV. */
function noiseUrl(kind: NoiseKind): string {
  if (isRecorded(kind)) return RECORDINGS[kind]

  const samples = burstSamples(kind, NOISE_RATE)
  const wav = toWav({
    numberOfChannels: 1,
    sampleRate: NOISE_RATE,
    length: samples.length,
    getChannelData: () => samples,
  })

  return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
}

/** Where a sound comes from, under the name it is opened once by; `null` when it cannot. */
function sourceOf(sound: MapSound): [string, () => Promise<string>] | null {
  const assets = props.assets
  if (sound.kind === 'clip') {
    if (!assets) return null

    const name = clipAsset(sound.place)
    return [name, () => loadSealed(assets, name).then((blob) => URL.createObjectURL(blob))]
  }

  const kind = props.solution.noises[sound.place]?.kind
  return kind === undefined ? null : [kind, () => Promise.resolve(noiseUrl(kind))]
}

/** Only the newest click may start a sound: an older one's fetch may answer later. */
let clicks = 0
let alive = true

/** Plays a sound, or pauses it while it plays. */
async function listen(sound: MapSound): Promise<void> {
  if (same(playing.value, sound)) {
    playback.pause()
    return
  }

  const source = sourceOf(sound)
  if (source === null) return

  // iOS wakes the graph only inside the click; the fetch below ends outside it.
  unlockSound()
  const mine = ++clicks

  const [name, open] = source
  let url = urls.get(name)
  if (url === undefined) {
    url = open()
    urls.set(name, url)
  }

  let src: string
  try {
    src = await url
  } catch (err) {
    urls.delete(name)
    console.warn('[echo-locate] the sound did not load', err)
    return
  }
  if (!alive || mine !== clicks) return

  if (!same(loaded.value, sound)) {
    playback.setSource(src)
    loaded.value = sound
  }
  playback.resume()
}

onBeforeUnmount(() => {
  alive = false
  for (const url of urls.values()) {
    url.then(
      (src) => src.startsWith('blob:') && URL.revokeObjectURL(src),
      () => undefined,
    )
  }
})

/** The same name again takes its play off the map. */
function select(userId: string): void {
  selected.value = selected.value === userId ? null : userId
}
</script>

<template>
  <div data-test="echo-locate-reveal" class="flex flex-col gap-6">
    <div class="relative">
      <SonarField
        :grid="props.payload.grid"
        :speed="props.payload.speed"
        :reach="props.payload.reach"
        :waves="shown.waves"
        :rings="shown.rings"
        :pins="shown.pins"
        :pin-color-hex="shown.pinColorHex"
        :pending="null"
        :solution="props.solution"
        :other-pins="otherPins"
        :links="links"
        :listenable="listenable"
        :playing="playing"
        @listen="listen"
      />
      <!-- My field alone, over the same field on the map: as this one leaves, the map fades in
           under my pings, which do not move. The box takes no touch, so a finger reaches the map.
           A box of its own, because the field is `relative` itself and would outrank `absolute`. -->
      <div
        v-if="intro"
        data-test="echo-locate-own"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 transition-opacity"
        :style="{ opacity: faded ? 0 : 1, transitionDuration: `${FADE_MS}ms` }"
      >
        <SonarField
          :grid="props.payload.grid"
          :speed="props.payload.speed"
          :reach="props.payload.reach"
          :waves="ownField.waves"
          :rings="ownField.rings"
          :pins="ownField.pins"
          :pin-color-hex="ownField.pinColorHex"
          :pending="null"
        />
      </div>
    </div>

    <EchoLocateScoreboard
      :rows="props.rows"
      :live="props.live"
      :selected="selected"
      :tolerance-radius="props.solution.toleranceRadius"
      @select="select"
    />
  </div>
</template>
