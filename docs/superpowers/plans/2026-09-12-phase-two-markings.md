# Phase-zwei-Markierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Runde in Phase zwei ist als solche zu erkennen — an der Rundennummer im Band — und jedes Spiel erklärt in einer zweiten Box, was in dieser Runde zu holen ist und wer es bekommt.

**Architecture:** Ein Farbtoken in `main.css` gibt dem Bernstein einen Namen. `InfoBox` behält seine Mechanik und lernt einen zweiten Ton und ein eigenes Icon; `AwardBox` setzt darauf auf und besitzt den Regeltext, den es aus `awardRule` und `awardPoints` rechnet. Den einen Satz, den nur das Spiel sagen kann, liefert jedes Spiel über zwei Slots — einen für jede Phase.

**Tech Stack:** Vue 3 (`<script setup>`, TypeScript strict) · Vite 8 · Tailwind v4 (`@theme` in CSS) · `unplugin-icons` mit lucide · Vitest + @vue/test-utils + happy-dom · pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-12-phase-two-markings-design.md`](../specs/2026-09-12-phase-two-markings-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch** mit `„…“` (U+201E … U+201C), nie ein gerades `"`. Bytes prüfen, wenn deutscher Text getippt wird. Spec/Plan deutsch.
- **TDD**: erst der fallende Test, laufen lassen, aus dem genannten Grund fallen sehen, dann die minimale Implementierung, dann grün sehen.
- **Keine redundanten Inline-Kommentare.** Ein Kommentar nennt einen Constraint, den der Code nicht zeigen kann — nie eine Nacherzählung der Zeile.
- **Keinen bestehenden Test löschen oder abschwächen.** Auf diesem Branch hat eine frühere Task elf bestehende Tests überschrieben, weil sie eine Datei für neu hielt. Vor dem Anlegen jeder Datei `ls` auf ihr Verzeichnis.
- **Feste Werte:** `--color-phase-two: var(--color-amber-500)` · Icon `~icons/lucide/chart-pie` · Storage-Key `award:{gameId}:{p1|p2}` · P2 ⟺ `awardRule === 'CLOSEST_ONLY'`.
- **Kein Backend-Change, keine Wire-Änderung.** `awardRule` und `awardPoints` stehen auf jeder Rundenantwort.
- Alle Befehle aus `webapp-vue/`. Nach jeder Task: `pnpm lint && pnpm typecheck` plus die Tests der berührten Dateien; die volle Suite in der Schluss-Task.
- **Der Dev-Server läuft aus diesem Worktree** (`preview_list` prüfen, `frontend` :5173) — anders als früher notiert ist eine visuelle Kontrolle hier also möglich und für die Tailwind-Klassen auch nötig.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/assets/main.css` *(ändern)* | `--color-phase-two` neben `--color-live` |
| `src/ui/InfoBox.vue` *(ändern)* | Ton, Icon-Slot, gerade sitzendes Chevron |
| `src/ui/AwardBox.vue` *(neu)* | Regel + Punkte aus `awardRule`/`awardPoints`, zwei Phasen-Slots |
| `src/ui/GameHeader.vue` *(ändern)* | Rundennummer in P2 bernstein |
| `src/rounds/RoundCard.vue` *(ändern)* | `phaseTwo` ans Band, `awardPoints` an das Spiel |
| `src/pages/c/[slug]/lab/[game]/index.vue` *(ändern)* | dasselbe für das Labor |
| `src/games/guesshue/HueRules.vue` *(neu)* | Anleitungstext, aus `hue-hint` herausgelöst |
| `src/games/guesshue/GuessHueBoard.vue` *(ändern)* | beide Boxen, `hue-hint` aufgelöst |
| `src/games/songsnippet/SongSnippetRules.vue` *(neu)* | Anleitungstext |
| `src/games/songsnippet/SongSnippetBoard.vue` *(ändern)* | beide Boxen |
| `src/games/findpattern/FindPatternBoard.vue` *(ändern)* | `AwardBox` neben die bestehende `InfoBox` |
| `src/games/spotobject/SpotObjectGame.vue` *(ändern)* | dasselbe |
| die vier `*Game.vue` *(ändern)* | `awardPoints` durchreichen, wo die Box im Board sitzt auch `awardRule` |

---

### Task 1: Das Chevron gerade rücken

**Files:**
- Modify: `src/ui/InfoBox.vue` (der Klappknopf)
- Test: `src/ui/__tests__/InfoBox.spec.ts` *(vorhanden, 3 Tests — anhängen)*

**Interfaces:**
- Consumes: nichts. Produces: nichts.

- [ ] **Step 1: Write the failing test**

An `src/ui/__tests__/InfoBox.spec.ts` anhängen, im bestehenden `describe`:

```ts
  // happy-dom rechnet kein Layout, also lässt sich der Versatz nicht messen. Der Fall pinnt
  // stattdessen die Entscheidung, die ihn erzeugt hat: der Knopf ist 44px hoch mit zentriertem
  // Inhalt in einer `items-start`-Zeile, also muss er 12px hochgezogen werden, damit sein
  // 20px-Chevron auf der Mitte von Icon und Überschrift landet — nicht 8px, wie `-m-2` es tat.
  it('lifts the toggle so its chevron sits on the heading line', () => {
    const classes = mountBox().get('[data-test="info-box-toggle"]').classes()

    expect(classes).toEqual(expect.arrayContaining(['-mt-3', '-mb-3', '-mx-2', 'size-11']))
    expect(classes).not.toContain('-m-2')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/InfoBox.spec.ts`
Expected: FAIL — der Knopf trägt `-m-2`, die drei gerichteten Klassen fehlen.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/InfoBox.vue`, am Klappknopf `-m-2` ersetzen und den Kommentar darüber setzen:

```html
      <!-- Der Knopf ist 44px hoch und zentriert seinen Inhalt, die Zeile ist `items-start`: ohne
           Korrektur säße das Chevron bei −8 + 22 = 14px, vier unter der Mitte von Icon und
           Überschrift. −12px oben setzt es auf 10px. Oben und unten gleich viel, damit die
           Trefferfläche die Zeilenhöhe weiterhin nicht treibt (44 − 12 − 12 = 20px). -->
      <button
        type="button"
        data-test="info-box-toggle"
        class="-mx-2 -mt-3 -mb-3 flex size-11 shrink-0 cursor-pointer items-center justify-center text-neutral-500"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/InfoBox.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (4 Tests) — die drei bestehenden Fälle bleiben grün.

- [ ] **Step 5: Commit**

```bash
git add src/ui/InfoBox.vue src/ui/__tests__/InfoBox.spec.ts
git commit -F - <<'MSG'
Sit the info box's chevron on its heading line

The toggle centres a 20px chevron in a 44px hit area inside a row that
aligns at the top, so `-m-2` left it four pixels below the icon and the
heading it belongs beside.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: Das Token und der zweite Ton

**Files:**
- Modify: `src/assets/main.css` (im `@theme`-Block, neben `--color-live`)
- Modify: `src/ui/flipdot/board.ts` (nur der Kommentar an `DOT_ALARM_ON`)
- Modify: `src/ui/InfoBox.vue`
- Test: `src/ui/__tests__/InfoBox.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: das CSS-Token `--color-phase-two` (und damit die Tailwind-Klassen `text-phase-two`, `bg-phase-two/10`, `border-phase-two/30`); `InfoBox`-Props `tone?: 'info' | 'phase-two'` (Default `'info'`) und der Slot `#icon` mit `IconInfo` als Fallback.

- [ ] **Step 1: Write the failing test**

An `src/ui/__tests__/InfoBox.spec.ts` anhängen. Den Helfer oben in der Datei um Ton und Icon-Slot erweitern:

```ts
function mountBox(storageKey = 'find-pattern', props: { tone?: 'info' | 'phase-two' } = {}) {
  return mount(InfoBox, {
    props: { storageKey, ...props },
    slots: { abstract: '<span>Kurzfassung</span>', default: '<p>Die ganze Erklärung</p>' },
  })
}
```

und die Fälle:

```ts
  it('wears the calm tone unless it is told otherwise', () => {
    const classes = mountBox().get('[data-test="info-box"]').classes()

    expect(classes).toEqual(expect.arrayContaining(['border-sky-200', 'bg-sky-50/60']))
  })

  // Bernstein heißt „Phase zwei“ — dieselbe Farbe, die das Band für die laufende Spieluhr trägt.
  it('wears the phase-two tone when it is asked for', () => {
    const classes = mountBox('find-pattern', { tone: 'phase-two' }).get('[data-test="info-box"]')
      .classes()

    expect(classes).toEqual(expect.arrayContaining(['border-phase-two/30', 'bg-phase-two/10']))
    expect(classes).not.toContain('bg-sky-50/60')
  })

  it('shows the info icon by default and the caller own icon instead', () => {
    expect(mountBox().find('[data-test="info-box-icon"] svg').exists()).toBe(true)

    const own = mount(InfoBox, {
      props: { storageKey: 'x' },
      slots: {
        abstract: '<span>K</span>',
        icon: '<span data-test="own-icon">★</span>',
        default: '<p>E</p>',
      },
    })

    expect(own.find('[data-test="own-icon"]').exists()).toBe(true)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/InfoBox.spec.ts`
Expected: FAIL — `tone` ist keine bekannte Prop, die Box trägt die sky-Klassen fest verdrahtet, und es gibt keinen `#icon`-Slot und kein `data-test="info-box-icon"`.

- [ ] **Step 3: Write minimal implementation**

In `src/assets/main.css`, im `@theme`-Block direkt unter `--color-live`:

```css
  /* „Phase zwei“: die Runden, in denen der Einsatz wächst und nur der beste Tipp ihn bekommt.
     Die Spieluhr im Band trägt dieses Bernstein schon, seit es sie gibt — getimte Spiele gibt es
     nur in Phase zwei, die Farbe hatte die Bedeutung also bereits, nur keinen Namen. Eine
     Bedeutung, eine Farbe, wie bei --color-live darüber. Zwilling in der Dot-Matrix:
     `DOT_ALARM_ON` in `src/ui/flipdot/board.ts` — wer hier ändert, ändert dort mit. */
  --color-phase-two: var(--color-amber-500);
```

In `src/ui/flipdot/board.ts` den bestehenden Kommentar an `DOT_ALARM_ON` um den Zwillingshinweis ergänzen (der Text davor bleibt):

```ts
 * Zwilling in CSS: `--color-phase-two` in `src/assets/main.css`. Hier steht ein Hex und dort ein
 * Token, weil die Dots ihre Farbe per `setAttribute` und in WAAPI-Keyframes bekommen — dort hilft
 * keine Klasse. Wer die Farbe ändert, ändert sie an beiden Stellen.
```

In `src/ui/InfoBox.vue`:

```ts
const props = withDefaults(defineProps<{ storageKey: string; tone?: BoxTone }>(), {
  tone: 'info',
})

/** Rahmen und Grund je Ton. Das Icon erbt seine Farbe über `currentColor` vom Halter. */
const TONES: Record<BoxTone, string> = {
  info: 'border-sky-200 bg-sky-50/60 text-sky-600',
  'phase-two': 'border-phase-two/30 bg-phase-two/10 text-phase-two',
}
```

mit `type BoxTone = 'info' | 'phase-two'` **lokal** in derselben Datei über den Props. Nicht
exportieren: `AwardBox` übergibt ein Literal, niemand importiert den Typ, und ein Export, den
keiner braucht, ist ein zweiter `<script>`-Block für nichts.

Template: die Tonklassen an die `<section>`, das Icon in einen Halter mit Slot und Fallback:

```html
  <section
    data-test="info-box"
    class="rounded-lg border px-4 py-3 text-sm text-neutral-700"
    :class="TONES[tone]"
  >
    <div class="flex items-start gap-3">
      <!-- No nudge: the icon's box and the heading's first line box are both 20px, so aligning
           them at the top is what puts them on one line. A margin here only lifts the heading.
           Die Farbe kommt vom Ton der Section über `currentColor`. -->
      <span data-test="info-box-icon" class="shrink-0">
        <slot name="icon"><IconInfo class="size-5" aria-hidden="true" /></slot>
      </span>
```

Der bisherige `text-neutral-700` bleibt an der Section; die Tonklasse setzt zusätzlich `text-…` für das Icon, und weil `text-neutral-700` in derselben Klassenliste steht, gewinnt dort die spätere Regel — deshalb trägt der Fließtext seine Farbe weiterhin über die Section und das Icon holt sie sich nicht von ihr, sondern aus dem Tonwert. Falls das Icon im Browser grau statt farbig erscheint, die Tonfarbe stattdessen an den `<span>` hängen (`:class="tone === 'phase-two' ? 'text-phase-two' : 'text-sky-600'"`) und aus `TONES` entfernen — und das im Report vermerken.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/InfoBox.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (7 Tests).

- [ ] **Step 5: Verify the classes actually paint**

Tailwind v4 erzeugt Utilities aus `@theme`; ob `bg-phase-two/10` und `border-phase-two/30` als `color-mix()` wirklich entstehen, sagt kein Unit-Test. Der Dev-Server läuft aus diesem Worktree:

```bash
curl -s http://localhost:5173/@id/__x00__/src/assets/main.css 2>/dev/null | grep -c phase-two || curl -s 'http://localhost:5173/src/assets/main.css' | grep -c phase-two
```

Expected: eine Zahl > 0. Ist sie 0 oder schlägt der Abruf fehl, im Report vermerken und stattdessen im Browser prüfen, ob die Box eine bernsteinfarbene Fläche hat — eine Klasse ohne Regel fällt visuell sofort auf, im Test nie.

- [ ] **Step 6: Commit**

```bash
git add src/assets/main.css src/ui/flipdot/board.ts src/ui/InfoBox.vue src/ui/__tests__/InfoBox.spec.ts
git commit -F - <<'MSG'
Name the amber that already meant phase two

The band's stopwatch has been amber since it was built, and timed games
exist only in phase two — the colour carried the meaning without having
a name. Naming it lets the round number and the winner box say the same
thing, and the info box grows the second tone that needs it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: `AwardBox` — die Regel und der Einsatz

**Files:**
- Create: `src/ui/AwardBox.vue`
- Test: `src/ui/__tests__/AwardBox.spec.ts` *(neu — vorher `ls src/ui/__tests__` und bestätigen, dass es sie nicht gibt)*

**Interfaces:**
- Consumes: `InfoBox` mit `tone` und `#icon` (Task 2); `AwardRule` aus `@/api/types`.
- Produces: `AwardBox` mit den Props `{ awardRule: AwardRule; awardPoints: number; gameId: string }` und den Slots `#qualifies` (P1) und `#closest` (P2).

- [ ] **Step 1: Write the failing test**

Neue Datei `src/ui/__tests__/AwardBox.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'

function mountBox(awardRule: 'ALL_QUALIFYING' | 'CLOSEST_ONLY', awardPoints: number) {
  return mount(AwardBox, {
    props: { awardRule, awardPoints, gameId: 'guess-hue' },
    slots: {
      qualifies: '<span>Nah genug am Farbton</span>',
      closest: '<span>Am nächsten am Farbton</span>',
    },
  })
}

describe('AwardBox', () => {
  beforeEach(() => localStorage.clear())

  // Zugeklappt ist der Zustand, in dem die Box die meiste Zeit steht, und die Punktzahl ist das
  // einzige, was sich von Runde zu Runde ändert — sie gehört deshalb in die Kurzfassung.
  it('puts the stake in the abstract, where a collapsed box still shows it', async () => {
    const w = mountBox('CLOSEST_ONLY', 7)
    await w.get('[data-test="info-box-toggle"]').trigger('click')

    expect(w.text()).toContain('7 Punkte')
  })

  it('names the phase one rule and its single point', () => {
    expect(mountBox('ALL_QUALIFYING', 1).text()).toContain('Jeder richtige Tipp: 1 Punkt')
  })

  it('names the phase two rule and the round own stake', () => {
    expect(mountBox('CLOSEST_ONLY', 7).text()).toContain('Winner takes it all: 7 Punkte')
  })

  // Was „am nächsten dran“ heißt, kann nur das Spiel sagen — und in Phase eins lautet die Frage
  // gar nicht so, sondern „was zählt überhaupt als richtig“.
  it('shows the phase own sentence and only that one', () => {
    expect(mountBox('ALL_QUALIFYING', 1).text()).toContain('Nah genug am Farbton')
    expect(mountBox('ALL_QUALIFYING', 1).text()).not.toContain('Am nächsten am Farbton')

    expect(mountBox('CLOSEST_ONLY', 7).text()).toContain('Am nächsten am Farbton')
    expect(mountBox('CLOSEST_ONLY', 7).text()).not.toContain('Nah genug am Farbton')
  })

  it('wears the phase two tone only in phase two', () => {
    expect(mountBox('CLOSEST_ONLY', 7).getComponent(InfoBox).props('tone')).toBe('phase-two')
    expect(mountBox('ALL_QUALIFYING', 1).getComponent(InfoBox).props('tone')).toBe('info')
  })

  // Der Fold wird nach Spiel UND Phase gemerkt: wer die Box in Phase eins weggeklappt hat, bekommt
  // sie in der ersten Runde der Phase zwei wieder — dort ändert sich die Regel vollständig.
  it('remembers the collapse per game and per phase', () => {
    expect(mountBox('ALL_QUALIFYING', 1).getComponent(InfoBox).props('storageKey')).toBe(
      'award:guess-hue:p1',
    )
    expect(mountBox('CLOSEST_ONLY', 7).getComponent(InfoBox).props('storageKey')).toBe(
      'award:guess-hue:p2',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/AwardBox.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/AwardBox.vue"`.

- [ ] **Step 3: Write minimal implementation**

Neue Datei `src/ui/AwardBox.vue`:

```vue
<script setup lang="ts">
/**
 * Was in dieser Runde zu holen ist, und wer es bekommt.
 *
 * Der Rahmen gehört dem Framework und folgt `Scoring.kt`: in Phase eins bekommt jeder
 * qualifizierte Tipp den Punkt, in Phase zwei nur der beste. Den einen Satz darunter kann nur das
 * Spiel sagen — und er ist pro Phase ein anderer, weil in Phase eins „was zählt als richtig“ die
 * Frage ist und in Phase zwei „wer gewinnt unter den richtigen“. Deshalb zwei Slots und nicht
 * einer: eine gemeinsame Formulierung wäre für die Hälfte der Spiele falsch — Farbausmalung und
 * Weltanschauung kennen in Phase zwei gar keine Hürde, Musterung und Song-Snippet schon.
 */
import { computed } from 'vue'
import InfoBox from '@/ui/InfoBox.vue'
import IconChartPie from '~icons/lucide/chart-pie'
import type { AwardRule } from '@/api/types'

const props = defineProps<{
  awardRule: AwardRule
  /** Was diese Runde wert ist. In Phase eins 1, in Phase zwei ab der Schwelle wachsend. */
  awardPoints: number
  gameId: string
}>()

const phaseTwo = computed(() => props.awardRule === 'CLOSEST_ONLY')

const points = computed(() => `${props.awardPoints} ${props.awardPoints === 1 ? 'Punkt' : 'Punkte'}`)

/**
 * In die Kurzfassung, nicht in den Körper: zugeklappt ist der Zustand, in dem die Box die meiste
 * Zeit steht, und die Punktzahl ist das einzige daran, was sich von Runde zu Runde ändert.
 */
const headline = computed(() =>
  phaseTwo.value ? `Winner takes it all: ${points.value}` : `Jeder richtige Tipp: ${points.value}`,
)

/** Nach Spiel und Phase: die erste Runde der Phase zwei soll die Box wieder aufklappen. */
const storageKey = computed(() => `award:${props.gameId}:${phaseTwo.value ? 'p2' : 'p1'}`)
</script>

<template>
  <InfoBox :storage-key="storageKey" :tone="phaseTwo ? 'phase-two' : 'info'">
    <template #icon><IconChartPie class="size-5" aria-hidden="true" /></template>
    <template #abstract>{{ headline }}</template>

    <template v-if="phaseTwo">
      <p>Nur der beste Tipp bekommt die Punkte. Alle anderen gehen leer aus.</p>
      <p><slot name="closest" /></p>
      <p>Solange die Runde läuft, kann dich noch jemand überholen.</p>
    </template>
    <template v-else>
      <p>Wer richtig liegt, bekommt den Punkt — egal, wie viele richtig liegen.</p>
      <p><slot name="qualifies" /></p>
    </template>
  </InfoBox>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/AwardBox.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/AwardBox.vue src/ui/__tests__/AwardBox.spec.ts
git commit -F - <<'MSG'
Say what a round is worth and who collects it

The stake grows by a point per round from the phase-two threshold on and
only the best tip takes it, and the app said neither. The number goes in
the abstract, because collapsed is the state the box spends its life in
and the number is the part that changes.

One sentence per phase stays with the game: qualification gates phase
two as well, but only two of the four games have a gate there, so a
shared wording would be wrong for the other half.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: `awardPoints` bis zu den Spielen durchreichen

**Files:**
- Modify: `src/rounds/RoundCard.vue` (der `<component :is>`-Block)
- Modify: `src/pages/c/[slug]/lab/[game]/index.vue` (die Spielkomponente, ~Zeile 350)
- Modify: `src/games/guesshue/GuessHueGame.vue`, `src/games/findpattern/FindPatternGame.vue`, `src/games/songsnippet/SongSnippetGame.vue`, `src/games/spotobject/SpotObjectGame.vue`
- Test: `src/rounds/__tests__/RoundCard.spec.ts`, `src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:**
- Consumes: `RoundResponse.awardPoints` / `LabRoundResponse.awardPoints` (beide vorhanden).
- Produces: jede Spielkomponente hat `awardPoints: number | null` neben dem vorhandenen `awardRule: AwardRule | null`.

- [ ] **Step 1: Write the failing test**

An `src/rounds/__tests__/RoundCard.spec.ts` anhängen (der `StubGame` der Datei bekommt die Prop dazu — in seinem `props`-Block `awardPoints: { type: Number, default: null }` ergänzen):

```ts
  // Die Gewinner-Box lebt im Spiel und braucht beides: die Regel sagt, wer gewinnt, die Punktzahl
  // sagt, worum es geht. Ohne sie könnte die Box nur die halbe Regel nennen.
  it('hands the game what the round is worth, not only how it is scored', () => {
    const w = mountCard({ round: aRound({ awardRule: 'CLOSEST_ONLY', awardPoints: 7 }), stage: 'playing' })

    expect(w.getComponent(StubGame).props('awardPoints')).toBe(7)
    expect(w.getComponent(StubGame).props('awardRule')).toBe('CLOSEST_ONLY')
  })
```

An `src/gamelab/__tests__/lab-page.spec.ts` anhängen, mit den Helfern der Datei:

```ts
  it('hands the lab game what the round is worth', async () => {
    const w = await mountPage()

    expect(w.getComponent(StubGame).props('awardPoints')).toBe(round.awardPoints)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/rounds/__tests__/RoundCard.spec.ts src/gamelab/__tests__/lab-page.spec.ts`
Expected: FAIL — `awardPoints` ist auf dem Stub `null`, weil niemand es bindet.

- [ ] **Step 3: Write minimal implementation**

In `src/rounds/RoundCard.vue`, neben `:award-rule`:

```html
        :award-points="round?.awardPoints ?? null"
```

In `src/pages/c/[slug]/lab/[game]/index.vue` an der Spielkomponente (dort, wo schon `:award-rule="round.awardRule"` steht):

```html
        :award-points="round.awardPoints"
```

In allen vier `*Game.vue` die Props-Deklaration erweitern, direkt unter `awardRule`:

```ts
  /** Was diese Runde wert ist — die Gewinner-Box nennt es. `null` nur ohne Spiel. */
  awardPoints: number | null
```

`FindPatternGame.vue` und `GuessHueGame.vue` reichen beides an ihr Board weiter, weil dort die Boxen sitzen (Tasks 5 und 6 bauen sie ein — hier nur die Durchreiche):

```html
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
```

und die beiden Boards deklarieren sie:

```ts
  awardRule: AwardRule | null
  awardPoints: number | null
```

`SongSnippetGame.vue` reicht `:award-points="awardPoints"` an `SongSnippetBoard` weiter (`:award-rule` steht dort schon); `SongSnippetBoard.vue` deklariert `awardPoints: number | null`. `SpotObjectGame.vue` hält die Box selbst und braucht nichts weiterzureichen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/rounds src/gamelab src/games && pnpm lint && pnpm typecheck`
Expected: PASS — die zwei neuen Fälle und alle bestehenden.

- [ ] **Step 5: Commit**

```bash
git add src/rounds src/games "src/pages/c/[slug]/lab/[game]/index.vue" src/gamelab
git commit -F - <<'MSG'
Tell each game what its round is worth

Games already knew how a round is scored. The stake itself — one point
in phase one, growing per round in phase two — stopped at the card, and
the winner box needs both halves to state the rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: Farbausmalung — beide Boxen, `hue-hint` aufgelöst

**Files:**
- Create: `src/games/guesshue/HueRules.vue` *(vorher `ls src/games/guesshue` und bestätigen, dass es sie nicht gibt)*
- Modify: `src/games/guesshue/GuessHueBoard.vue`
- Test: `src/games/guesshue/__tests__/GuessHueBoard.spec.ts` *(vorhanden — anhängen; der `hue-hint`-Fall wird ersetzt, siehe Step 1)*

**Interfaces:**
- Consumes: `AwardBox` (Task 3), `InfoBox` mit Ton (Task 2), die Board-Props `awardRule`/`awardPoints` (Task 4).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Write the failing test**

`src/games/guesshue/__tests__/GuessHueBoard.spec.ts` hält **drei** Fälle über `hue-hint`, nicht
einen: „carries the rule where it does not compete with the wheel" (die zurückgenommene Typografie),
„phase one: names the tolerance" und „phase two: says only the closest guess scores" — die beiden
letzten pinnen den ganzen Satz wörtlich. Alle drei verlieren ihr Ziel, weil `hue-hint` verschwindet.
Sie werden **ersetzt**, nicht gelöscht: ihre Aussagen wandern auf die zwei Boxen, und der
Typografie-Fall entfällt ersatzlos, weil die Box ihre eigene Gestaltung mitbringt. Das im Report
festhalten — ein Fall weniger in der Datei ist eine Änderung, die ein Reviewer sehen muss.

`mountBoard` nimmt dort bereits ein Props-Objekt (`Partial<InstanceType<typeof GuessHueBoard>['$props']>`),
`awardRule` und `awardPoints` kommen also ohne Umbau durch.

Die drei ersetzen durch:

```ts
  // Der alte `hue-hint` mischte zwei Dinge: wie man spielt (Anleitung) und wonach gewertet wird
  // (Gewinner-Box). Beide Hälften leben weiter, jede an ihrem Ort.
  it('explains the input in the rules box and the scoring in the award box', () => {
    const w = mountBoard({ toleranceDeg: 10, awardRule: 'ALL_QUALIFYING', awardPoints: 1 })

    expect(w.text()).toContain('Du stellst nur den Farbton ein')
    expect(w.text()).toContain('Jeder richtige Tipp: 1 Punkt')
    expect(w.find('[data-test="hue-hint"]').exists()).toBe(false)
  })

  it('drops the tolerance from the award box in phase two, where there is none', () => {
    const w = mountBoard({ toleranceDeg: null, awardRule: 'CLOSEST_ONLY', awardPoints: 7 })

    expect(w.text()).toContain('Winner takes it all: 7 Punkte')
    expect(w.text()).toContain('Am nächsten am gesuchten Farbton')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/games/guesshue/__tests__/GuessHueBoard.spec.ts`
Expected: FAIL — `hue-hint` existiert noch, die Boxen nicht.

- [ ] **Step 3: Write minimal implementation**

Neue Datei `src/games/guesshue/HueRules.vue`:

```vue
<script setup lang="ts">
/**
 * Wie gespielt wird, und nichts weiter — die erste Hälfte des früheren `hue-hint`. Die zweite
 * Hälfte war Wertung und steht jetzt in der Gewinner-Box. Text only; das Falten lebt in
 * `ui/InfoBox`.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Du stellst nur den Farbton ein — Sättigung und Helligkeit sind vorgegeben.</li>
    <li>Dreh den Ring, bis die Farbe zur Beschreibung passt.</li>
    <li>Den Knopf in der Mitte gedrückt halten gibt den Tipp ab.</li>
  </ul>
</template>
```

In `src/games/guesshue/GuessHueBoard.vue`: `hint` und der `<p data-test="hue-hint">` entfallen, die beiden Boxen kommen an dieselbe Stelle. `AwardBox`, `InfoBox` und `HueRules` importieren; die Props `awardRule`/`awardPoints` sind mit Task 4 schon deklariert.

```html
    <div class="mt-8 flex flex-col gap-3">
      <InfoBox storage-key="guess-hue">
        <template #abstract>Triff den beschriebenen Farbton.</template>
        <HueRules />
      </InfoBox>
      <AwardBox
        v-if="props.awardRule !== null && props.awardPoints !== null"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        game-id="guess-hue"
      >
        <template #qualifies>Dein Farbton muss nah genug am gesuchten liegen.</template>
        <template #closest>
          Am nächsten am gesuchten Farbton — eine Grenze gibt es hier nicht mehr, jeder ist
          Kandidat.
        </template>
      </AwardBox>
    </div>
```

Der `toleranceDeg`-Prop bleibt: er gehört zum Spiel, nicht zur Box. Sein KDoc-Absatz über den Hinweissatz wird auf den neuen Ort gezogen.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/games/guesshue && pnpm lint && pnpm typecheck`
Expected: PASS — die zwei neuen Fälle und alle bestehenden des Verzeichnisses.

- [ ] **Step 5: Commit**

```bash
git add src/games/guesshue
git commit -F - <<'MSG'
Split Guess Hue's hint into rules and scoring

One grey paragraph carried two different things: how the wheel works,
and what a round pays. The first is instructions, the second is the
rule — and the rule stopped needing a hand-written phase branch the
moment the award box took it over.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Song-Snippet — beide Boxen

**Files:**
- Create: `src/games/songsnippet/SongSnippetRules.vue` *(vorher `ls src/games/songsnippet` prüfen)*
- Modify: `src/games/songsnippet/SongSnippetBoard.vue` (am Ende des Templates, über dem „Aufgeben“-Block)
- Test: `src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts` *(vorhanden — anhängen)*

**Interfaces:**
- Consumes: `AwardBox` (Task 3), `InfoBox` (Task 2), Board-Prop `awardPoints` (Task 4).
- Produces: nichts.

- [ ] **Step 1: Write the failing test**

```ts
  it('carries both boxes, with the stage rule in phase two', () => {
    const w = mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 5 })

    expect(w.text()).toContain('Winner takes it all: 5 Punkte')
    expect(w.text()).toContain('kürzesten Schnipsel')
    expect(w.text()).toContain('Erkenne den Song')
  })

  // Song-Snippet ist gestuft, nicht zeitgewertet: `stages > 1` schlägt im PlayService die Zeit,
  // und das Scoreboard sortiert nach der Stufe. Die Box darf hier nicht von Zeit reden.
  it('never promises a time rule, because this game is scored by stage', () => {
    expect(mountBoard({ awardRule: 'CLOSEST_ONLY', awardPoints: 5 }).text()).not.toContain('Zeit')
  })
```

Den `mountBoard`-Helfer um `awardPoints` erweitern.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/games/songsnippet/__tests__/SongSnippetBoard.spec.ts`
Expected: FAIL — keine Box im Board.

- [ ] **Step 3: Write minimal implementation**

Neue Datei `src/games/songsnippet/SongSnippetRules.vue`:

```vue
<script setup lang="ts">
/**
 * Wie gespielt wird. Text only — das Falten lebt in `ui/InfoBox`, und was eine Stufe kostet, sagt
 * der Knopf selbst über seinen Titel.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Du hörst zuerst den kürzesten Schnipsel des gesuchten Songs.</li>
    <li>Wer ihn nicht erkennt, schaltet die nächste, längere Stufe frei.</li>
    <li>Such den Song über das Suchfeld und gib ihn als Tipp ab.</li>
  </ul>
</template>
```

In `src/games/songsnippet/SongSnippetBoard.vue`, direkt über dem „Aufgeben“-Block:

```html
    <div class="flex flex-col gap-3">
      <InfoBox storage-key="song-snippet">
        <template #abstract>Erkenne den Song am kürzesten Schnipsel.</template>
        <SongSnippetRules />
      </InfoBox>
      <AwardBox
        v-if="props.awardRule !== null && props.awardPoints !== null"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        game-id="song-snippet"
      >
        <template #qualifies>Du musst den richtigen Song erkennen.</template>
        <template #closest>
          Der richtige Song — und von allen, die ihn haben, der mit dem kürzesten Schnipsel.
        </template>
      </AwardBox>
    </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/games/songsnippet && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/songsnippet
git commit -F - <<'MSG'
Give Song Snippet its rules and its stake

The game explained itself nowhere, and its phase-two rule is the one
that surprises: it is not the clock but the stage — the shortest snippet
you still recognised it from.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: Musterung und Weltanschauung — die Gewinner-Box dazu

**Files:**
- Modify: `src/games/findpattern/FindPatternBoard.vue` (unter die bestehende `InfoBox`)
- Modify: `src/games/spotobject/SpotObjectGame.vue` (unter die bestehende `InfoBox`, im `p-4`-Block)
- Test: `src/games/findpattern/__tests__/FindPatternBoard.spec.ts` und `src/games/spotobject/__tests__/SpotObjectGame.spec.ts` *(beide vorhanden — anhängen)*

**Interfaces:**
- Consumes: `AwardBox` (Task 3), die Props aus Task 4.
- Produces: nichts.

Beide Einbauten haben dieselbe Form; ein Dispatch, zwei Dateien.

- [ ] **Step 1: Write the failing tests**

In `FindPatternBoard.spec.ts`:

```ts
  // In Phase zwei ist Qualifikation Vorbedingung (`Scoring.kt`: `qualifies && deviation == best`),
  // und Musterung hat eine: das falsche Muster gewinnt auch schnell nicht.
  it('names both halves of the phase two rule', () => {
    const w = mountBoard(false, undefined, { awardRule: 'CLOSEST_ONLY', awardPoints: 9 })

    expect(w.text()).toContain('Winner takes it all: 9 Punkte')
    expect(w.text()).toContain('richtige Muster')
    expect(w.text()).toContain('kürzeste Zeit')
  })
```

In `SpotObjectGame.spec.ts`:

```ts
  // `judge()` gibt hier jedem `qualifies = true` — die Hürde ist keine Richtigkeit, sondern das
  // nachträgliche Streichen durch die Mitspieler. Die Box muss das so sagen.
  it('names the strike, not a correctness gate', () => {
    const w = mountGame({ awardRule: 'CLOSEST_ONLY', awardPoints: 4 })

    expect(w.text()).toContain('Winner takes it all: 4 Punkte')
    expect(w.text()).toContain('kürzeste Zeit')
    expect(w.text()).toContain('stehen lassen')
  })
```

**Die beiden Helfer sind verschieden gebaut, und einer davon braucht einen Umbau.**
`SpotObjectGame.spec.ts` hat `mountGame(over: Record<string, unknown>)` — dort reichen die zwei
Schlüssel. `FindPatternBoard.spec.ts` dagegen hat **positionale** Parameter:

```ts
function mountBoard(disabled = false, submittedStartIndex?: number | null) {
```

Ein dritter positionaler Parameter wäre die dritte anonyme Stelle am Aufruf. Stattdessen einen
letzten Props-Parameter anhängen, der die bestehenden Aufrufe unberührt lässt:

```ts
function mountBoard(
  disabled = false,
  submittedStartIndex?: number | null,
  award: { awardRule?: AwardRule | null; awardPoints?: number | null } = {},
) {
  return mount(FindPatternBoard, {
    props: {
      payload: PAYLOAD,
      myColorHex: '#7c3aed',
      disabled,
      awardRule: null,
      awardPoints: null,
      ...(submittedStartIndex !== undefined ? { submittedStartIndex } : {}),
      ...award,
    },
  })
}
```

Der neue Fall ruft dann `mountBoard(false, undefined, { awardRule: 'CLOSEST_ONLY', awardPoints: 9 })`.
Jeder bestehende Aufruf bleibt, wie er ist.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/games/findpattern src/games/spotobject`
Expected: FAIL — keine Gewinner-Box in beiden.

- [ ] **Step 3: Write minimal implementation**

In `src/games/findpattern/FindPatternBoard.vue`, die bestehende `InfoBox` in einen Spaltenhalter setzen und die zweite Box darunter:

```html
    <div class="flex flex-col gap-3">
      <InfoBox storage-key="find-pattern">
        <template #abstract> Entdecke im Spielfeld das gesuchte Muster. </template>
        <PatternRules />
      </InfoBox>
      <AwardBox
        v-if="props.awardRule !== null && props.awardPoints !== null"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        game-id="find-pattern"
      >
        <template #qualifies>Du musst das gesuchte Muster finden.</template>
        <template #closest>
          Das richtige Muster — und von allen, die es haben, die kürzeste Zeit.
        </template>
      </AwardBox>
    </div>
```

In `src/games/spotobject/SpotObjectGame.vue`, im bestehenden `<div class="p-4">`:

```html
      <div class="flex flex-col gap-3 p-4">
        <InfoBox storage-key="spot-object">
          <template #abstract>Finde den gesuchten Gegenstand.</template>
          <SpotObjectRules />
        </InfoBox>
        <AwardBox
          v-if="props.awardRule !== null && props.awardPoints !== null"
          :award-rule="props.awardRule"
          :award-points="props.awardPoints"
          game-id="spot-object"
        >
          <template #qualifies>
            Gib einen Tipp ab — die Mitspieler können ihn dir wieder streichen.
          </template>
          <template #closest>
            Die kürzeste Zeit — solange die Mitspieler deinen Tipp stehen lassen.
          </template>
        </AwardBox>
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/games && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/findpattern src/games/spotobject
git commit -F - <<'MSG'
Give the two timed games their stake as well

Both are scored by the clock in phase two, and neither said so. They
differ in what stands in front of the clock: Musterung wants the right
pattern first, Weltanschauung wants a tip the others leave standing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 8: Die Rundennummer im Band

**Files:**
- Modify: `src/ui/GameHeader.vue`
- Modify: `src/rounds/RoundCard.vue`
- Modify: `src/pages/c/[slug]/lab/[game]/index.vue` (am `<GameHeader>`)
- Test: `src/ui/__tests__/GameHeader.spec.ts`, `src/rounds/__tests__/RoundCard.spec.ts`

**Interfaces:**
- Consumes: das Token aus Task 2.
- Produces: `GameHeader`-Prop `phaseTwo?: boolean` (Default `false`).

- [ ] **Step 1: Write the failing test**

In `src/ui/__tests__/GameHeader.spec.ts`:

```ts
  // Die Phasenmarkierung sitzt links an der Ziffer, die Uhrmarkierung rechts im Feld. Die Dots
  // bleiben absichtlich unberührt: die laufende Stoppuhr ist bernstein, und getimte Spiele gibt es
  // nur in Phase zwei — beides bernstein hieße, die Farbe unterscheidet die beiden nicht mehr.
  it('marks a phase two round on its number and nowhere else', () => {
    const w = mountHeader({ phaseTwo: true })

    expect(w.get('[data-test="game-header-round"]').classes()).toContain('text-phase-two')
    expect(w.get('[data-test="game-header-round"]').classes()).not.toContain('text-stone-400')
    expect(clockOf(w).tone).toBe('default')
  })

  it('leaves the number alone in phase one', () => {
    expect(mountHeader().get('[data-test="game-header-round"]').classes()).toContain(
      'text-stone-400',
    )
  })
```

In `src/rounds/__tests__/RoundCard.spec.ts`:

```ts
  it('tells the band which phase the round is in', () => {
    const two = mountCard({ round: aRound({ awardRule: 'CLOSEST_ONLY' }) })
    const one = mountCard({ round: aRound({ awardRule: 'ALL_QUALIFYING' }) })

    expect(two.getComponent(GameHeader).props('phaseTwo')).toBe(true)
    expect(one.getComponent(GameHeader).props('phaseTwo')).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/GameHeader.spec.ts src/rounds/__tests__/RoundCard.spec.ts`
Expected: FAIL — `phaseTwo` ist keine bekannte Prop, die Ziffer trägt immer `text-stone-400`.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/GameHeader.vue` zur Props-Liste (im `withDefaults`-Block mit `phaseTwo: false`):

```ts
    /**
     * Ob die Runde nach „Winner takes it all“ gewertet wird. Färbt genau eine Sache — die Ziffer.
     * Die Dots bleiben weiß: die laufende Stoppuhr ist bernstein, und getimte Spiele gibt es nur
     * hier, also unterschiede die Farbe die beiden Anzeigen sonst nicht mehr.
     */
    phaseTwo?: boolean
```

und an der Ziffer:

```html
      class="shrink-0 text-sm tabular-nums"
      :class="phaseTwo ? 'text-phase-two' : 'text-stone-400'"
```

In `src/rounds/RoundCard.vue` am `<GameHeader>`:

```html
          :phase-two="round?.awardRule === 'CLOSEST_ONLY'"
```

In der Laborseite am `<GameHeader>`:

```html
          :phase-two="round.awardRule === 'CLOSEST_ONLY'"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui src/rounds src/gamelab && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/GameHeader.vue src/rounds/RoundCard.vue "src/pages/c/[slug]/lab/[game]/index.vue" src/ui/__tests__ src/rounds/__tests__
git commit -F - <<'MSG'
Mark a phase-two round on its number

A round where the stake grows and only the best tip collects it looked
like every other round. The number carries the mark; the dots stay
white, because the stopwatch beside them is already amber and only ever
runs in this phase.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
MSG
```

---

### Task 9: Ganze Suite, und ein Blick auf das Ding

**Files:** keine (nur, falls etwas rot ist)

- [ ] **Step 1: Run the whole frontend gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: alles grün.

- [ ] **Step 2: Look at it — the dev server runs from this worktree**

`preview_list` bestätigt `frontend` :5173 mit dem `cwd` dieses Worktrees. Eine Runde eines beliebigen Spiels öffnen, im Labor beide Phasen:

```
/c/{slug}/lab/find-pattern?seed=2074278679&phase=ONE
/c/{slug}/lab/find-pattern?seed=2074278679&phase=TWO
```

Worauf zu achten ist — und was kein Test sehen kann:
1. **Die bernsteinfarbene Box hat wirklich eine Fläche.** `bg-phase-two/10` und `border-phase-two/30` sind `color-mix()`-Utilities über einem `@theme`-Token; erzeugt Tailwind sie nicht, steht die Klasse im DOM und malt nichts. Der Unit-Test würde das nie merken.
2. Das Chevron sitzt auf einer Linie mit Icon und Überschrift, in beiden Boxen.
3. Die Rundennummer ist in `phase=TWO` bernstein, in `phase=ONE` grau — und die Flip-Dots sind in beiden Fällen weiß.
4. Zugeklappt ist die Punktzahl noch zu lesen.
5. Auf einem 360px-Viewport: beide Boxen brechen sauber um, das Icon rutscht nicht.

- [ ] **Step 3: Commit (nur falls Step 1–2 etwas gefunden haben)**

```bash
git add -A
git commit -m "Fix <what the gate found>"
```
