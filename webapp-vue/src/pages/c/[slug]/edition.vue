<script setup lang="ts">
import { computed, ref } from 'vue'
import { DateTime } from 'luxon'
import { useRouter } from 'vue-router'
import { createEdition, replaceEdition } from '@/api/communities'
import { useCommunityContext } from '@/communities/context'
import { useAdminGuard } from '@/communities/useAdminGuard'
import { communityPath } from '@/communities/routes'
import { saveErrorMessage } from '@/profile/saveError'
import EditionCalendar from '@/communities/edition/EditionCalendar.vue'
import IconX from '~icons/lucide/x'
import {
  MAX_CALENDAR_ROUNDS,
  calendarSpan,
  editionCells,
  frozenSince,
  roundAt,
  roundStart,
} from '@/communities/edition/editionGrid'

useAdminGuard()
const router = useRouter()
const { community, refresh } = useCommunityContext()
const slug = community.value.slug
const existing = community.value.edition
const communityName = community.value.name

const zones = Intl.supportedValuesOf('timeZone')

const zone = ref(existing?.startsAtTimezone ?? 'Europe/Berlin')
const startLocal = existing ? DateTime.fromISO(existing.startsAt, { zone: zone.value }) : null
const label = ref(existing?.label ?? '')
const date = ref(startLocal?.toFormat('yyyy-MM-dd') ?? '')
const time = ref(startLocal?.toFormat('HH:mm') ?? '')
const firstRound = ref(existing ? String(existing.gamesFromRound) : '')
const phaseTwo = ref(
  existing?.phaseTwoStartRound != null ? String(existing.phaseTwoStartRound) : '',
)

const saving = ref(false)
const error = ref<string | null>(null)

/** Date and time are wall-clock values IN the chosen zone, not in the browser's. */
const startsAt = computed(() => {
  if (!date.value || !time.value) return null
  const at = DateTime.fromISO(`${date.value}T${time.value}`, { zone: zone.value })

  return at.isValid ? at.toUTC().toISO() : null
})

const first = computed(() => (firstRound.value === '' ? null : Number(firstRound.value)))
const second = computed(() => (phaseTwo.value === '' ? null : Number(phaseTwo.value)))
const complete = computed(() => startsAt.value !== null && first.value !== null)

/** The header's brand line, as App.vue will render it after saving. */
const preview = computed(() => {
  const year = startsAt.value
    ? ` '${String(DateTime.fromISO(startsAt.value, { zone: zone.value }).year).slice(-2)}`
    : ''

  return `${label.value.trim() || communityName}${year}`
})

const fmt = (d: DateTime) => d.setLocale('de').toFormat('EEE, d. MMM HH:mm')

const firstRoundDate = computed(() =>
  startsAt.value && first.value !== null
    ? fmt(roundStart(startsAt.value, zone.value, first.value))
    : null,
)
const phaseTwoDate = computed(() =>
  startsAt.value && second.value !== null
    ? fmt(roundStart(startsAt.value, zone.value, second.value))
    : null,
)
const zeroPoint = computed(() =>
  startsAt.value ? fmt(roundStart(startsAt.value, zone.value, 1)) : null,
)

/**
 * Only an unfrozen run is checked; a frozen one is not being moved. The first game round may be the
 * running one, e.g. round -45 at noon when -45 runs until 18:00, but not one that is already over.
 */
const firstRoundOver = computed(
  () =>
    !existing?.frozen &&
    startsAt.value !== null &&
    first.value !== null &&
    first.value < roundAt(DateTime.now(), startsAt.value, zone.value),
)

/** A run whose freeze moment has passed starts at once and is fixed from then on: confirm it. */
const startsNow = computed(
  () =>
    !existing?.frozen &&
    !firstRoundOver.value &&
    startsAt.value !== null &&
    first.value !== null &&
    frozenSince(startsAt.value, zone.value, first.value) <= DateTime.now(),
)
const startNowConfirmed = ref(false)
const canSubmit = computed(
  () =>
    complete.value &&
    !saving.value &&
    !firstRoundOver.value &&
    (!startsNow.value || startNowConfirmed.value),
)
/** The server refuses it too; saying so here spares the round trip. */
const phaseTwoTooEarly = computed(
  () => first.value !== null && second.value !== null && second.value < first.value,
)
const freezeAt = computed(() =>
  startsAt.value && first.value !== null
    ? fmt(frozenSince(startsAt.value, zone.value, first.value))
    : '',
)

const shape = computed(() =>
  startsAt.value && first.value !== null
    ? {
        startsAt: startsAt.value,
        zone: zone.value,
        gamesFromRound: first.value,
        // A new edition has no end yet; the server's default is 0.
        gamesUntilRound: existing?.gamesUntilRound ?? 0,
        phaseTwoStartRound: second.value,
      }
    : null,
)
/** Null while incomplete or beyond [MAX_CALENDAR_ROUNDS]: the hint shows instead. */
const cells = computed(() => {
  const s = shape.value
  if (!s || calendarSpan(s, DateTime.now()) > MAX_CALENDAR_ROUNDS) return null

  return editionCells(s, DateTime.now())
})

async function save(): Promise<void> {
  if (!canSubmit.value || !startsAt.value || first.value === null) return
  error.value = null
  saving.value = true

  const body = {
    label: label.value.trim() || null,
    // Frozen: resend the stored values; a rebuild drops seconds and is ambiguous in the DST fold.
    startsAt: existing?.frozen ? existing.startsAt : startsAt.value,
    startsAtTimezone: existing?.frozen ? existing.startsAtTimezone : zone.value,
    phaseTwoStartRound: second.value,
    gamesFromRound: first.value,
  }

  try {
    await (existing ? replaceEdition(slug, body) : createEdition(slug, body))
    await refresh()
    await router.push(communityPath(slug, 'settings'))
  } catch (e) {
    error.value = saveErrorMessage(e)
  } finally {
    saving.value = false
  }
}

const input =
  'mt-1 w-full rounded border px-3 py-1.5 disabled:bg-neutral-100 disabled:text-neutral-500'
</script>

<template>
  <section class="mx-auto max-w-md py-8">
    <h1 class="mb-1 text-xl font-semibold">Edition</h1>
    <p data-test="preview" class="mb-4 text-sm text-neutral-600">{{ preview }}</p>

    <form class="space-y-3" @submit.prevent="save">
      <label class="block text-sm"
        >Bezeichnung (optional)<input
          v-model="label"
          data-test="label"
          :class="input"
          :placeholder="communityName"
          maxlength="50"
      /></label>

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm"
          >Start-Datum<input
            v-model="date"
            data-test="date"
            type="date"
            :class="input"
            :disabled="existing?.frozen"
            required
        /></label>
        <label class="block text-sm"
          >Uhrzeit<input
            v-model="time"
            data-test="time"
            type="time"
            :class="input"
            :disabled="existing?.frozen"
            required
        /></label>
      </div>

      <label class="block text-sm"
        >Zeitzone<select
          v-model="zone"
          data-test="zone"
          :class="input"
          :disabled="existing?.frozen"
        >
          <option v-for="z in zones" :key="z" :value="z">{{ z }}</option>
        </select></label
      >

      <p v-if="existing?.frozen" data-test="frozen-note" class="text-xs text-neutral-500">
        Start und Zeitzone sind seit {{ freezeAt }} fest – die erste Spielrunde kann schon
        angekündigt sein.
      </p>

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm"
          >Erste Spielrunde<input
            v-model="firstRound"
            data-test="first-round"
            type="number"
            min="-36500"
            max="0"
            step="1"
            :class="input"
            required
        /></label>
        <label class="block text-sm"
          >Phase 2 ab (optional)
          <!-- The × clears the field: empty = no phase two. The native spinner stays left of it. -->
          <span class="relative block">
            <input
              v-model="phaseTwo"
              data-test="phase-two"
              type="number"
              min="-36500"
              max="0"
              step="1"
              :class="[input, 'pr-8']"
            />
            <button
              v-if="phaseTwo !== ''"
              type="button"
              data-test="phase-two-clear"
              aria-label="Phase 2 leeren"
              class="absolute top-1 right-0 bottom-0 flex w-8 items-center justify-center text-neutral-500 hover:text-neutral-900"
              @click="phaseTwo = ''"
            >
              <IconX aria-hidden="true" />
            </button> </span
        ></label>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs text-neutral-500">
        <p data-test="first-round-date">{{ firstRoundDate ? `beginnt ${firstRoundDate}` : '' }}</p>
        <p data-test="phase-two-date">{{ phaseTwoDate ? `beginnt ${phaseTwoDate}` : '' }}</p>
      </div>
      <p v-if="zeroPoint" class="text-xs text-neutral-500">
        Runde 1 ist der Start ({{ zeroPoint }}), Runde 0 der letzte Tag davor.
      </p>

      <p v-if="phaseTwoTooEarly" data-test="phase-two-warning" class="text-sm text-red-600">
        Phase 2 kann nicht vor der ersten Spielrunde beginnen.
      </p>

      <p v-if="firstRoundOver" data-test="first-round-over" class="text-sm text-red-600">
        Die erste Spielrunde ist schon vorbei. Frühestens die laufende Runde geht.
      </p>

      <label v-if="startsNow" class="flex items-start gap-2 text-sm">
        <input v-model="startNowConfirmed" data-test="start-now" type="checkbox" class="mt-1" />
        <span>Sofort starten – Start und Zeitzone lassen sich danach nicht mehr ändern.</span>
      </label>

      <template v-if="cells">
        <EditionCalendar :cells="cells" />
        <p
          v-if="!existing?.frozen && !startsNow && !firstRoundOver"
          data-test="frozen-since"
          class="text-xs text-neutral-500"
        >
          Start und Zeitzone sind ab {{ freezeAt }} fest.
        </p>
      </template>
      <p v-else data-test="calendar-hint" class="text-sm text-neutral-500">
        Start und erste Spielrunde angeben, dann erscheint der Kalender.
      </p>

      <button
        data-test="submit"
        class="rounded border px-3 py-1.5 hover:bg-neutral-200 disabled:opacity-50"
        :disabled="!canSubmit"
      >
        Speichern
      </button>
      <button
        type="button"
        data-test="cancel"
        class="ml-2 rounded border px-3 py-1.5 hover:bg-neutral-200"
        @click="router.push(communityPath(slug, 'settings'))"
      >
        Abbrechen
      </button>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
