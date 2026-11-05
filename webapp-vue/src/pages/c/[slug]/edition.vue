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
import { editionCells, frozenSince, roundStart } from '@/communities/edition/editionGrid'

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

/** Only an unfrozen run can be refused for this; a frozen one is not being moved. */
const freezePassed = computed(
  () =>
    !existing?.frozen &&
    startsAt.value !== null &&
    first.value !== null &&
    frozenSince(startsAt.value, zone.value, first.value) <= DateTime.now(),
)
const freezeAt = computed(() =>
  startsAt.value && first.value !== null
    ? fmt(frozenSince(startsAt.value, zone.value, first.value))
    : '',
)

const cells = computed(() =>
  startsAt.value && first.value !== null
    ? editionCells(
        {
          startsAt: startsAt.value,
          zone: zone.value,
          gamesFromRound: first.value,
          // A new edition has no end yet; the server's default is 0.
          gamesUntilRound: existing?.gamesUntilRound ?? 0,
          phaseTwoStartRound: second.value,
        },
        DateTime.now(),
      )
    : [],
)

async function save(): Promise<void> {
  if (!startsAt.value || first.value === null) return
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

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm"
          >Erste Spielrunde<input
            v-model="firstRound"
            data-test="first-round"
            type="number"
            max="0"
            step="1"
            :class="input"
            required
        /></label>
        <label class="block text-sm"
          >Phase 2 ab (optional)<input
            v-model="phaseTwo"
            data-test="phase-two"
            type="number"
            max="-1"
            step="1"
            :class="input"
        /></label>
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs text-neutral-500">
        <p data-test="first-round-date">{{ firstRoundDate ? `beginnt ${firstRoundDate}` : '' }}</p>
        <p data-test="phase-two-date">{{ phaseTwoDate ? `beginnt ${phaseTwoDate}` : '' }}</p>
      </div>
      <p v-if="zeroPoint" class="text-xs text-neutral-500">
        Runde 1 ist der Start ({{ zeroPoint }}), Runde 0 der letzte Tag davor.
      </p>

      <p v-if="freezePassed" data-test="freeze-warning" class="text-sm text-red-600">
        Die Einstellungen wären seit {{ freezeAt }} fix — das ist vorbei.
      </p>

      <EditionCalendar v-if="complete" :cells="cells" />
      <p v-else data-test="calendar-hint" class="text-sm text-neutral-500">
        Start und erste Spielrunde angeben, dann erscheint der Kalender.
      </p>

      <button
        data-test="submit"
        class="rounded border px-3 py-1.5 hover:bg-neutral-200 disabled:opacity-50"
        :disabled="!complete || saving"
      >
        Speichern
      </button>
      <p v-if="error" data-test="error" class="text-sm text-red-600">{{ error }}</p>
    </form>
  </section>
</template>
