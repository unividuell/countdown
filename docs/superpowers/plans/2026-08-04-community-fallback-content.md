# Community Fallback Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Community-Landingpage `/c/<slug>/` füllt den Platz unter der Rangliste mit dem
Fallback-Content: einer Flip-Dot-Countdown-Tafel, wenn ein Starttermin in der Zukunft liegt, und
je einer Meldungs-Card, wenn kein Termin gesetzt ist bzw. das Event schon läuft.

**Architecture:** Reine Funktionen unten, dumme Komponenten darüber, eine einzige Komponente mit
Zustandswahl obendrauf. `ui/flipdot/` ist eine fachfreie Anzeige-Primitive (Glyphen → Bitmap → SVG),
`communities/fallbacks/` sind die drei Cards, `members/winner.ts` die Rang-Auswertung.
`RoundFallback.vue` hält die `useCountdown`-Instanz und entscheidet, welche Card rendert. Keine
Backend-Änderung, kein neuer Endpoint, keine zweite Zeitlogik.

**Tech Stack:** Vite 8 · Vue 3 (`<script setup lang="ts">`) · TypeScript strict · Tailwind v4 ·
Vitest 4 + @vue/test-utils + happy-dom · pnpm.

**Spec:** [2026-08-04-community-fallback-content-design.md](../specs/2026-08-04-community-fallback-content-design.md)

## Global Constraints

- **Alle Kommandos laufen in `webapp-vue/`.** Test: `pnpm test`, einzeln:
  `pnpm vitest run <pfad>`. Typecheck: `pnpm typecheck` (`vue-tsc -b` — `--noEmit` prüft hier
  nichts). Lint: `pnpm lint`.
- **TypeScript ist sehr streng:** `strict`, `noUncheckedIndexedAccess` (jeder Array-/String-Index
  liefert `T | undefined` — immer mit `?? fallback` auffangen, nie blind indizieren),
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
  (Typ-Importe brauchen `import type`).
- **Mobile-first.** Die Zielgeräte sind Telefone im Portrait-Modus. Narrow-first bauen, nach oben mit
  `sm:`/`md:` erweitern — niemals ein Desktop-Layout nachträglich kleinrechnen.
- **Tests nutzen Vitest `vi`**, nicht mockk/kotest (das ist die Kotlin-Konvention im Backend).
- **happy-dom 20 hat kein `Element.prototype.animate`.** Gemessen in diesem Repo:
  `typeof Element.prototype.animate === 'undefined'`, `typeof window.matchMedia === 'function'`,
  `matchMedia('(prefers-reduced-motion: reduce)').matches === false`. Jeder Code, der die Web
  Animations API aufruft, muss die Fähigkeit prüfen, sonst wirft jeder Mount im Test; Tests, die die
  Animation beobachten wollen, installieren `animate` selbst als Spy.
- **Keine erklärenden Kommentare, die den Code nachsprechen.** Begründungen gehören in die
  Commit-Message und in die Guidelines, nicht als Grabstein in den Code. Ein Kommentar ist nur dann
  richtig, wenn er etwas sagt, das der Code nicht sagen kann (eine Messung, ein Browser-Bug, ein
  bewusst gewählter Wert).
- **Copy ist festgelegt und wird wortgleich übernommen** (inklusive Umlaute und Interpunktion):
  - Zustand 1 Titel: `Noch kein Termin`
  - Zustand 1 Text: `Diese Spielgemeinschaft entsteht gerade. Komm später wieder.`
  - Zustand 3 mit Gewinner, Titel: `Herzlichen Glückwunsch, <Namen>!`
  - Zustand 3 mit Gewinner, Text: `Und jetzt viel Spaß zusammen!`
  - Zustand 3 ohne Gewinner, Titel: `Und jetzt viel Spaß zusammen!` (kein zweiter Satz, keine
    Überschrift „Das Event läuft")
- **Git:** wir nutzen git flow. Dieser Branch ist von `develop` abgezweigt, ein PR geht mit
  `--base develop` auf. Commit-Messages im Conventional-Commits-Stil mit Scope (`feat(webapp): …`)
  und abschließend `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `src/ui/flipdot/font.ts` | Glyphen-Daten (0–9, `:`, Leerzeichen) und `bitmap(text)`. Pur, kein DOM, kein Vue. |
| `src/ui/flipdot/board.ts` | Physische Konstanten der Tafel: Rasterweite, Punktradius, Farben, Kipp-Dauer, Spalten-Versatz. |
| `src/ui/flipdot/FlipDotBoard.vue` | Rendert ein Bitmap als SVG und animiert beim Textwechsel nur die geänderten Punkte. Weiß nichts über Countdowns. |
| `src/members/winner.ts` | `rankOf`, `winners`, `formatWinnerNames`. Pur. |
| `src/communities/fallbacks/MessageCard.vue` | Helle quadratische Card mit Titel und optionalem Text. |
| `src/communities/fallbacks/CountdownCard.vue` | Die Tafel: Hero-Tage + Uhrzeit-Leiste + Labels. Bekommt fertige Strings als Props, lädt nichts. |
| `src/communities/fallbacks/RoundFallback.vue` | Hält `useCountdown`, wählt den Zustand, rendert die passende Card. |
| `src/pages/c/[slug]/index.vue` | Mountet `RoundFallback` unter der Rangliste (modifizieren). |
| `src/communities/CountdownDisplay.vue` | Verliert das „Event läuft"-Label und den zugehörigen Tooltip (modifizieren). |

---

### Task 1: Punktschrift (`ui/flipdot/font.ts`)

Die Glyphen sind 5 Spalten × 7 Zeilen, zwischen zwei Zeichen liegt genau 1 leere Spalte. Für `n`
Zeichen ergibt das `n * 6 - 1` Spalten. `bitmap` liefert ein zeilenweise (row-major) gepacktes
`boolean[]`.

**Files:**
- Create: `webapp-vue/src/ui/flipdot/font.ts`
- Test: `webapp-vue/src/ui/flipdot/__tests__/font.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `GLYPH_COLS: 5`, `GLYPH_ROWS: 7` (beide `const`, Typ `number`)
  - `interface Bitmap { cols: number; rows: number; on: boolean[] }`
  - `bitmap(text: string): Bitmap`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/flipdot/__tests__/font.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GLYPH_COLS, GLYPH_ROWS, bitmap } from '@/ui/flipdot/font'

const lit = (on: readonly boolean[]) => on.filter(Boolean).length

describe('flipdot font', () => {
  it('is empty for the empty string', () => {
    const b = bitmap('')
    expect(b.cols).toBe(0)
    expect(b.on).toEqual([])
  })

  it('sizes a single glyph to the 5x7 cell', () => {
    const b = bitmap('1')
    expect(b.cols).toBe(GLYPH_COLS)
    expect(b.rows).toBe(GLYPH_ROWS)
    expect(b.on.length).toBe(GLYPH_COLS * GLYPH_ROWS)
  })

  it('lights the expected dots of the digit 1', () => {
    const b = bitmap('1')
    expect(b.on[0 * b.cols + 2]).toBe(true)
    expect(b.on[1 * b.cols + 1]).toBe(true)
    expect(b.on[1 * b.cols + 2]).toBe(true)
    expect(b.on[0 * b.cols + 0]).toBe(false)
    expect(lit(b.on)).toBe(10)
  })

  it('puts exactly one blank column between two glyphs', () => {
    const b = bitmap('00')
    expect(b.cols).toBe(11)
    for (let r = 0; r < b.rows; r++) {
      expect(b.on[r * b.cols + 5]).toBe(false)
    }
  })

  it('places the second glyph six columns to the right', () => {
    const b = bitmap('01')
    expect(b.on[0 * b.cols + 8]).toBe(true)
  })

  it('renders the colon as two dots', () => {
    expect(lit(bitmap(':').on)).toBe(2)
  })

  it('renders an unknown character as an empty cell rather than throwing', () => {
    const b = bitmap('A')
    expect(b.cols).toBe(GLYPH_COLS)
    expect(lit(b.on)).toBe(0)
  })

  it('grows the column count with the character count', () => {
    expect(bitmap('12:34:56').cols).toBe(8 * 6 - 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/flipdot/font"`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp-vue/src/ui/flipdot/font.ts`:

```ts
export const GLYPH_COLS = 5
export const GLYPH_ROWS = 7

const BLANK = '00000,00000,00000,00000,00000,00000,00000'

const GLYPHS: Record<string, string> = {
  ' ': BLANK,
  ':': '00000,00000,00100,00000,00100,00000,00000',
  '0': '01110,10001,10001,10001,10001,10001,01110',
  '1': '00100,01100,00100,00100,00100,00100,01110',
  '2': '01110,10001,00001,00010,00100,01000,11111',
  '3': '11111,00010,00100,00010,00001,10001,01110',
  '4': '00010,00110,01010,10010,11111,00010,00010',
  '5': '11111,10000,11110,00001,00001,10001,01110',
  '6': '00110,01000,10000,11110,10001,10001,01110',
  '7': '11111,00001,00010,00100,01000,01000,01000',
  '8': '01110,10001,10001,01110,10001,10001,01110',
  '9': '01110,10001,10001,01111,00001,00010,01100',
}

export interface Bitmap {
  cols: number
  rows: number
  on: boolean[]
}

export function bitmap(text: string): Bitmap {
  const cols = text.length === 0 ? 0 : text.length * (GLYPH_COLS + 1) - 1
  const on = new Array<boolean>(cols * GLYPH_ROWS).fill(false)

  for (let i = 0; i < text.length; i++) {
    const rows = (GLYPHS[text[i] ?? ' '] ?? BLANK).split(',')
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const row = rows[r] ?? ''
      for (let c = 0; c < GLYPH_COLS; c++) {
        if (row[c] === '1') on[r * cols + i * (GLYPH_COLS + 1) + c] = true
      }
    }
  }

  return { cols, rows: GLYPH_ROWS, on }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts`
Expected: PASS, 8 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/flipdot/font.ts webapp-vue/src/ui/flipdot/__tests__/font.spec.ts
git commit -m "$(cat <<'EOF'
feat(webapp): add the flip-dot glyph font

An unknown character renders as an empty cell instead of throwing: the
board repaints every second, so a missing glyph must cost one gap in the
display rather than an exception per tick.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Tafel-Konstanten und SVG-Renderer (`ui/flipdot/`)

Die Tafel ist ein SVG mit `viewBox` in Rastereinheiten — damit skaliert sie verlustfrei von 320 px
bis 576 px, ohne JS-Messung. Beim Textwechsel animiert die Komponente **nur die geänderten Punkte**:
die Scheibe kippt auf die Kante (`scaleY` 0.12), wechselt im Moment der geringsten Sichtbarkeit die
Farbe und kippt zurück, mit Spalten-Versatz von links nach rechts.

`fill: 'backwards'` in den Animationsoptionen ist der Kern des Tricks: Vue hat das neue `fill`-Attribut
bereits gesetzt, wenn die Animation startet, und `backwards` lässt während der Verzögerung noch das
erste Keyframe (die alte Farbe) gelten. Ohne das würden alle Punkte sofort umschlagen und der Versatz
wäre unsichtbar.

**Files:**
- Create: `webapp-vue/src/ui/flipdot/board.ts`
- Create: `webapp-vue/src/ui/flipdot/FlipDotBoard.vue`
- Test: `webapp-vue/src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`

**Interfaces:**
- Consumes: `bitmap`, `Bitmap` aus `@/ui/flipdot/font` (Task 1).
- Produces:
  - `board.ts`: `PITCH = 4`, `RADIUS = 1.5`, `DOT_ON = '#fafaf9'`, `DOT_OFF = '#292524'`,
    `FLIP_MS = 170`, `STAGGER_MS = 9` (alle `number` bzw. `string`)
  - `FlipDotBoard.vue`: Props `{ text: string; label: string }`. Root ist ein `<svg>` — Klassen und
    `data-test` von außen fallen darauf durch.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { DOT_OFF, DOT_ON } from '@/ui/flipdot/board'
import { bitmap } from '@/ui/flipdot/font'

// happy-dom 20 ships no Web Animations API (measured: Element.prototype.animate is undefined),
// so a test that wants to observe the flip has to install it.
function stubAnimate(): ReturnType<typeof vi.fn> {
  const animate = vi.fn()
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

function diffCount(a: string, b: string): number {
  const x = bitmap(a).on
  const y = bitmap(b).on
  return x.reduce((n, on, i) => (on === (y[i] ?? false) ? n : n + 1), 0)
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
  vi.restoreAllMocks()
})

describe('FlipDotBoard', () => {
  it('renders one circle per grid cell', () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    expect(w.findAll('circle').length).toBe(5 * 7)
  })

  it('fills the lit dots with the on colour and the rest with the off colour', () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    const fills = w.findAll('circle').map((c) => c.attributes('fill'))
    expect(fills.filter((f) => f === DOT_ON).length).toBe(10)
    expect(fills.filter((f) => f === DOT_OFF).length).toBe(5 * 7 - 10)
  })

  it('exposes the text to assistive tech, which cannot read a dot matrix', () => {
    const w = mount(FlipDotBoard, { props: { text: '58', label: '58 Tage bis zum Start' } })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('58 Tage bis zum Start')
  })

  it('mounts without a Web Animations API', () => {
    expect(() => mount(FlipDotBoard, { props: { text: '00', label: 'x' } })).not.toThrow()
  })

  it('animates exactly the dots that changed', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    expect(animate).not.toHaveBeenCalled()
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(diffCount('00', '01'))
  })

  it('staggers the flip by column so the wave runs left to right', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await w.setProps({ text: '01' })
    await nextTick()
    const delays = animate.mock.calls.map((call) => (call[1] as { delay: number }).delay)
    expect(Math.min(...delays)).toBeLessThan(Math.max(...delays))
    expect(delays.every((d) => d % 9 === 0)).toBe(true)
  })

  it('does not animate when the grid geometry changes', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await w.setProps({ text: '100' })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    expect(w.findAll('circle').length).toBe(17 * 7)
  })

  it('honours prefers-reduced-motion by switching without the flip', async () => {
    const animate = stubAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mount(FlipDotBoard, { props: { text: '00', label: 'x' } })
    await w.setProps({ text: '01' })
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    const fills = w.findAll('circle').map((c) => c.attributes('fill'))
    expect(fills.filter((f) => f === DOT_ON).length).toBe(bitmap('01').on.filter(Boolean).length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/flipdot/FlipDotBoard.vue"`.

- [ ] **Step 3: Write the constants module**

Create `webapp-vue/src/ui/flipdot/board.ts`:

```ts
export const PITCH = 4
export const RADIUS = 1.5
export const DOT_ON = '#fafaf9'
export const DOT_OFF = '#292524'
export const FLIP_MS = 170
export const STAGGER_MS = 9
```

- [ ] **Step 4: Write the renderer**

Create `webapp-vue/src/ui/flipdot/FlipDotBoard.vue`:

```vue
<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { bitmap } from './font'
import { DOT_OFF, DOT_ON, FLIP_MS, PITCH, RADIUS, STAGGER_MS } from './board'

const props = defineProps<{ text: string; label: string }>()

const svg = useTemplateRef<SVGSVGElement>('svg')
const bm = computed(() => bitmap(props.text))
const gap = PITCH - 2 * RADIUS
const viewBox = computed(
  () => `0 0 ${bm.value.cols * PITCH - gap} ${bm.value.rows * PITCH - gap}`,
)
const dots = computed(() =>
  bm.value.on.map((on, i) => ({
    on,
    cx: (i % bm.value.cols) * PITCH + RADIUS,
    cy: Math.floor(i / bm.value.cols) * PITCH + RADIUS,
  })),
)

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

watch(
  bm,
  (next, prev) => {
    if (prev.cols !== next.cols || prefersReducedMotion()) return
    const circles = svg.value?.querySelectorAll('circle')
    if (!circles) return

    for (let i = 0; i < next.on.length; i++) {
      const was = prev.on[i] ?? false
      const is = next.on[i] ?? false
      if (was === is) continue
      const circle = circles[i]
      // happy-dom has no Web Animations API; the resting colour is already correct without it.
      if (!circle || typeof circle.animate !== 'function') return
      const from = was ? DOT_ON : DOT_OFF
      const to = is ? DOT_ON : DOT_OFF
      circle.animate(
        [
          { transform: 'scaleY(1)', fill: from },
          { transform: 'scaleY(0.12)', fill: from, offset: 0.49 },
          { transform: 'scaleY(0.12)', fill: to, offset: 0.5 },
          { transform: 'scaleY(1)', fill: to },
        ],
        {
          duration: FLIP_MS,
          delay: (i % next.cols) * STAGGER_MS,
          easing: 'ease-in-out',
          fill: 'backwards',
        },
      )
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <svg
    ref="svg"
    :viewBox="viewBox"
    class="block w-full"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="label"
  >
    <circle
      v-for="(dot, i) in dots"
      :key="i"
      :cx="dot.cx"
      :cy="dot.cy"
      :r="RADIUS"
      :fill="dot.on ? DOT_ON : DOT_OFF"
      class="origin-center [transform-box:fill-box]"
    />
  </svg>
</template>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`
Expected: PASS, 8 Tests.

(`useTemplateRef` ist ab Vue 3.5 verfügbar; installiert ist 3.5.40 — geprüft.)

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/ui/flipdot/
git commit -m "$(cat <<'EOF'
feat(webapp): render a flip-dot board as scalable SVG

A viewBox in dot-grid units scales the board from a 320px phone to the
576px column with no JS measurement and no container queries, and the
dots stay circles at every size.

Only the dots that actually changed animate — a second of countdown
touches a handful, not the whole board. The keyframes carry the fill
colour themselves and run with fill:'backwards', so the old colour holds
through the per-column delay and the wave reads left to right; without
that every dot would flip its colour at once and the stagger would be
invisible.

happy-dom ships no Web Animations API (measured: Element.prototype
.animate is undefined), so the renderer checks for it. The resting
colour comes from the fill attribute either way, which is why a test
environment without WAAPI still shows the correct board.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Gewinner-Auswertung (`members/winner.ts`)

Der Rang ist genau der, nach dem `RosterService` den Roster schon sortiert (`stable + (live ?: 0)`) —
ein Gewinner, der in der Reihe darüber nicht vorne steht, wäre für den Betrachter unerklärlich. Bei
Maximalrang 0 gibt es keinen Gewinner, bei Gleichstand alle.

**Files:**
- Create: `webapp-vue/src/members/winner.ts`
- Test: `webapp-vue/src/members/__tests__/winner.spec.ts`

**Interfaces:**
- Consumes: `RosterMemberResponse` aus `@/api/types` (existiert: `{ userId, shortName, fullName, bgColorHex, points: { stable: number; live?: number } }`).
- Produces:
  - `rankOf(member: RosterMemberResponse): number`
  - `winners(members: readonly RosterMemberResponse[]): RosterMemberResponse[]`
  - `formatWinnerNames(names: readonly string[]): string`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/members/__tests__/winner.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { RosterMemberResponse } from '@/api/types'
import { formatWinnerNames, rankOf, winners } from '@/members/winner'

function member(fullName: string, stable: number, live?: number): RosterMemberResponse {
  return {
    userId: fullName,
    shortName: fullName.slice(0, 3).toUpperCase(),
    fullName,
    bgColorHex: '#8e44ad',
    ...(live === undefined
      ? { points: { stable } }
      : { points: { stable, live } }),
  }
}

describe('rankOf', () => {
  it('adds live points to the stable ones', () => {
    expect(rankOf(member('fry', 12, 3))).toBe(15)
  })

  it('counts only the stable points when live ones are withheld', () => {
    expect(rankOf(member('fry', 12))).toBe(12)
  })
})

describe('winners', () => {
  it('picks the single member at the top', () => {
    const list = [member('fry', 12), member('leela', 9), member('bender', 1)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['fry'])
  })

  it('ranks by stable plus live, not by stable alone', () => {
    const list = [member('fry', 12), member('leela', 10, 5)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['leela'])
  })

  it('returns nobody when nobody has scored', () => {
    expect(winners([member('fry', 0), member('leela', 0)])).toEqual([])
  })

  it('returns nobody for an empty roster', () => {
    expect(winners([])).toEqual([])
  })

  it('returns every member tied at the top', () => {
    const list = [member('fry', 12), member('leela', 12), member('bender', 4)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['fry', 'leela'])
  })

  it('keeps the roster order among the tied', () => {
    const list = [member('bender', 7), member('fry', 7), member('leela', 7)]
    expect(winners(list).map((m) => m.fullName)).toEqual(['bender', 'fry', 'leela'])
  })
})

describe('formatWinnerNames', () => {
  it('is empty without a winner', () => {
    expect(formatWinnerNames([])).toBe('')
  })

  it('names one', () => {
    expect(formatWinnerNames(['Fry'])).toBe('Fry')
  })

  it('joins two with und', () => {
    expect(formatWinnerNames(['Fry', 'Leela'])).toBe('Fry und Leela')
  })

  it('joins three with commas and a final und', () => {
    expect(formatWinnerNames(['Fry', 'Leela', 'Bender'])).toBe('Fry, Leela und Bender')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/members/__tests__/winner.spec.ts`
Expected: FAIL — `Failed to resolve import "@/members/winner"`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp-vue/src/members/winner.ts`:

```ts
import type { RosterMemberResponse } from '@/api/types'

export function rankOf(member: RosterMemberResponse): number {
  return member.points.stable + (member.points.live ?? 0)
}

export function winners(members: readonly RosterMemberResponse[]): RosterMemberResponse[] {
  const top = members.reduce((max, member) => Math.max(max, rankOf(member)), 0)
  if (top <= 0) return []
  return members.filter((member) => rankOf(member) === top)
}

export function formatWinnerNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const last = names[names.length - 1] ?? ''
  return `${names.slice(0, -1).join(', ')} und ${last}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/members/__tests__/winner.spec.ts`
Expected: PASS, 12 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/members/winner.ts webapp-vue/src/members/__tests__/winner.spec.ts
git commit -m "$(cat <<'EOF'
feat(webapp): derive the community winner from the roster

The rank is the one RosterService already sorts by, stable plus live. A
winner who is not first in the ranking row above the card would be
inexplicable to the reader, so the card must not invent its own order.

A tie names everyone. Picking one of two equals would assert something
the visible ranking does not support, and the backend tiebreak (join
time, then userId) is an implementation detail, not a result.

Nobody has won while the top score is still zero — that is the state of
every community before the first game exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Meldungs-Card (`communities/fallbacks/MessageCard.vue`)

Helle Card im App-Stil, quadratisch wie die Tafel, damit die Seite in jedem Zustand dieselbe
Silhouette hat. Kein `data-test` im Bauteil selbst — die aufrufende Komponente setzt es, weil sie
weiß, welcher Zustand gerade gemeint ist.

**Files:**
- Create: `webapp-vue/src/communities/fallbacks/MessageCard.vue`
- Test: `webapp-vue/src/communities/fallbacks/__tests__/MessageCard.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `MessageCard.vue` mit Props `{ title: string; text?: string }`. Root ist ein `<div>`;
  `class` und `data-test` fallen darauf durch.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/fallbacks/__tests__/MessageCard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageCard from '@/communities/fallbacks/MessageCard.vue'

describe('MessageCard', () => {
  it('shows the title', () => {
    const w = mount(MessageCard, { props: { title: 'Noch kein Termin' } })
    expect(w.text()).toContain('Noch kein Termin')
  })

  it('shows the optional second line when given', () => {
    const w = mount(MessageCard, {
      props: { title: 'Noch kein Termin', text: 'Komm später wieder.' },
    })
    expect(w.text()).toContain('Komm später wieder.')
  })

  it('renders no second line when it is omitted', () => {
    const w = mount(MessageCard, { props: { title: 'Und jetzt viel Spaß zusammen!' } })
    expect(w.findAll('p').length).toBe(1)
  })

  it('stays square, so the page keeps its silhouette across states', () => {
    const w = mount(MessageCard, { props: { title: 'x' } })
    expect(w.classes()).toContain('aspect-square')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/MessageCard.spec.ts`
Expected: FAIL — `Failed to resolve import "@/communities/fallbacks/MessageCard.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp-vue/src/communities/fallbacks/MessageCard.vue`:

```vue
<script setup lang="ts">
defineProps<{ title: string; text?: string }>()
</script>

<template>
  <div
    class="flex aspect-square w-full flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 text-center"
  >
    <p class="text-base font-semibold text-neutral-900">{{ title }}</p>
    <p v-if="text" class="mt-2 text-sm leading-relaxed text-neutral-600">{{ text }}</p>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/MessageCard.spec.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/fallbacks/MessageCard.vue webapp-vue/src/communities/fallbacks/__tests__/MessageCard.spec.ts
git commit -m "$(cat <<'EOF'
feat(webapp): add the fallback message card

Square like the flip-dot board, so the landing page keeps one silhouette
whichever of the three fallback states is in effect.

The second line is optional rather than always present: without a winner
the event-running state is a single sentence, and a card built around a
mandatory subtitle would have forced a filler headline back in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Countdown-Card (`communities/fallbacks/CountdownCard.vue`)

Die Tafel selbst. Bekommt fertige Strings und lädt nichts — die Zeitrechnung bleibt in
`useCountdown`/`computeView` und im Backend.

Zwei Geometrie-Regeln aus dem Spec, beide fest verdrahtet:

- **Hero-Breite je Stellenzahl:** 2 Stellen → 72 %, 3 Stellen → 92 %, ab 4 → 100 %. Die
  Punktgröße fällt daraus automatisch, weil das SVG eine `viewBox` hat. Die Klassen müssen
  **literal** im Quelltext stehen (`'w-[72%]'`), nicht interpoliert — Tailwind v4 scannt den
  Quelltext, ein zusammengesetzter Klassenname wird nie generiert.
- **Leiste:** konstant 94 % Breite. Die Labels stehen unter der Mitte ihres Ziffernpaars. Bei 8
  Zeichen (47 Spalten, `viewBox`-Breite 187) liegen die Paarmitten bei x = 21,5 / 93,5 / 165,5 →
  **11,5 % / 50 % / 88,5 %**. Ein `grid-cols-3` würde 16,7 / 50 / 83,3 ergeben und die äußeren
  Labels sichtbar neben ihre Ziffern setzen.

**Files:**
- Create: `webapp-vue/src/communities/fallbacks/CountdownCard.vue`
- Test: `webapp-vue/src/communities/fallbacks/__tests__/CountdownCard.spec.ts`

**Interfaces:**
- Consumes: `FlipDotBoard.vue` aus `@/ui/flipdot/FlipDotBoard.vue` (Task 2), Props `{ text, label }`.
- Produces: `CountdownCard.vue` mit Props
  `{ days: string; hours: string; minutes: string; seconds: string }`. `days` ist bereits auf
  mindestens zwei Stellen genullt; `hours`/`minutes`/`seconds` sind zweistellig.
  Marker: `data-test="countdown-card"` am Root, `data-test="countdown-hero"` an der Hero-Tafel,
  `data-test="countdown-strip"` an der Leiste.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/fallbacks/__tests__/CountdownCard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CountdownCard from '@/communities/fallbacks/CountdownCard.vue'

function mountCard(days: string) {
  return mount(CountdownCard, {
    props: { days, hours: '13', minutes: '42', seconds: '07' },
  })
}

describe('CountdownCard', () => {
  it('is square', () => {
    expect(mountCard('58').find('[data-test="countdown-card"]').classes()).toContain('aspect-square')
  })

  it('renders the day count as the hero board', () => {
    const hero = mountCard('58').find('[data-test="countdown-hero"]')
    expect(hero.findAll('circle').length).toBe(11 * 7)
  })

  it('composes the strip as one clock reading', () => {
    const strip = mountCard('58').find('[data-test="countdown-strip"]')
    expect(strip.attributes('aria-label')).toContain('13:42:07')
    expect(strip.findAll('circle').length).toBe(47 * 7)
  })

  it('names the day count without its padding for assistive tech', () => {
    expect(mountCard('07').find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '7 Tage bis zum Start',
    )
  })

  it('widens the hero for a three-digit day count instead of overflowing', () => {
    expect(mountCard('58').find('[data-test="countdown-hero"]').classes()).toContain('w-[72%]')
    expect(mountCard('128').find('[data-test="countdown-hero"]').classes()).toContain('w-[92%]')
    expect(mountCard('1000').find('[data-test="countdown-hero"]').classes()).toContain('w-full')
  })

  it('labels the three time groups', () => {
    const text = mountCard('58').text()
    expect(text).toContain('TAGE')
    expect(text).toContain('STD')
    expect(text).toContain('MIN')
    expect(text).toContain('SEK')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/CountdownCard.spec.ts`
Expected: FAIL — `Failed to resolve import "@/communities/fallbacks/CountdownCard.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp-vue/src/communities/fallbacks/CountdownCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'

const props = defineProps<{
  days: string
  hours: string
  minutes: string
  seconds: string
}>()

// Literal class names: Tailwind scans the source, so an interpolated w-[..%] is never generated.
const heroWidth = computed(() => {
  if (props.days.length <= 2) return 'w-[72%]'
  if (props.days.length === 3) return 'w-[92%]'
  return 'w-full'
})
const heroLabel = computed(() => `${Number(props.days)} Tage bis zum Start`)
const time = computed(() => `${props.hours}:${props.minutes}:${props.seconds}`)
</script>

<template>
  <div
    data-test="countdown-card"
    class="flex aspect-square w-full flex-col items-center justify-between rounded-xl bg-stone-900 px-2 py-4"
  >
    <div class="flex flex-1 flex-col items-center justify-center gap-2.5">
      <FlipDotBoard
        data-test="countdown-hero"
        :class="heroWidth"
        :text="days"
        :label="heroLabel"
      />
      <p class="font-mono text-[11px] tracking-[0.14em] text-stone-500">TAGE</p>
    </div>
    <div class="w-[94%]">
      <FlipDotBoard
        data-test="countdown-strip"
        :text="time"
        :label="`Verbleibende Zeit ${time}`"
      />
      <div class="relative mt-2 h-4 font-mono text-[11px] tracking-[0.14em] text-stone-500">
        <span class="absolute left-[11.5%] -translate-x-1/2">STD</span>
        <span class="absolute left-1/2 -translate-x-1/2">MIN</span>
        <span class="absolute left-[88.5%] -translate-x-1/2">SEK</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/CountdownCard.spec.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/fallbacks/CountdownCard.vue webapp-vue/src/communities/fallbacks/__tests__/CountdownCard.spec.ts
git commit -m "$(cat <<'EOF'
feat(webapp): compose the flip-dot countdown card

Days as the hero, hours/minutes/seconds as one continuous strip: the
round number is a day, so the day count carries the card, and a single
strip lets the bottom edge hold its own instead of standing there as
three loose tiles.

The hero's width is a fixed share per digit count and the dot size falls
out of the viewBox. Flush to both edges and a constant digit height
cannot both hold once a third digit appears, and centred beats flush.

The strip's group labels sit at 11.5% / 50% / 88.5%, the actual centres
of their digit pairs in a 47-column board. A three-column grid would put
the outer two visibly beside their digits.

The card takes finished strings and loads nothing: the DST-sensitive
arithmetic stays in the backend and the formatting in computeView.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Zustandswahl (`communities/fallbacks/RoundFallback.vue`)

Die Reihenfolge der Verzweigungen ist das Eigentliche an dieser Komponente — sie verhindert, dass
beim Seitenaufbau die falsche Card aufblitzt:

1. `community.startsAt === null` → Meldung, **synchron**, ohne Request. Der Slug wird für
   `useCountdown` auf `null` maskiert, dadurch feuert die Composable keinen Request.
2. `view.state === 'before'` → Tafel.
3. `view.state === 'after'` → Meldung, mit Gratulation sobald der Roster da ist.
4. sonst (`'idle'`, also Response noch unterwegs) → gleich großer Platzhalter.

`members` ist `null`, solange der Roster lädt. Im `after`-Zustand zeigt die Komponente dann den
Platzhalter statt kurz „Und jetzt viel Spaß zusammen!" und danach die Gratulation.

**Files:**
- Create: `webapp-vue/src/communities/fallbacks/RoundFallback.vue`
- Test: `webapp-vue/src/communities/fallbacks/__tests__/RoundFallback.spec.ts`

**Interfaces:**
- Consumes: `useCountdown` aus `@/communities/useCountdown` (existiert; nimmt
  `Ref<string | null | undefined>`, liefert `{ view, cycleBaseUnit }`; `view.chips` bei
  days-only-`cfg` ist `[Tage, Std, Min, Sek]` mit `value`-Strings), `winners` +
  `formatWinnerNames` aus `@/members/winner` (Task 3), `CountdownCard` (Task 5), `MessageCard`
  (Task 4).
- Produces: `RoundFallback.vue` mit Props
  `{ community: CommunityResponse; members: readonly RosterMemberResponse[] | null }`.
  Marker: `data-test="fallback-no-date"`, `data-test="countdown-card"` (aus der Card),
  `data-test="fallback-winner"`, `data-test="fallback-running"`, `data-test="fallback-placeholder"`.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/communities/fallbacks/__tests__/RoundFallback.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as api from '@/api/countdown'
import type { CommunityResponse, CountdownResponse, RosterMemberResponse } from '@/api/types'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const community = (startsAt: string | null): CommunityResponse => ({
  id: 'c1',
  name: 'Team',
  slug: 'team',
  startsAt,
  startsAtTimezone: 'Europe/Berlin',
  phaseTwoStartRound: null,
  viewerIsAdmin: false,
  pendingCount: 0,
})

const before: CountdownResponse = {
  serverNow: '2026-06-14T21:00:00Z',
  startsAt: '2026-08-11T09:00:00Z',
  startsAtTimezone: 'Europe/Berlin',
  round: { number: 58, label: 'T-58', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
  nextRound: null,
}

const after: CountdownResponse = {
  serverNow: '2026-06-14T21:00:00Z',
  startsAt: '2026-06-14T09:00:00Z',
  startsAtTimezone: 'Europe/Berlin',
  round: { number: -1, label: 'T+1', start: '2026-06-14T09:00:00Z', end: '2026-06-15T09:00:00Z' },
  nextRound: null,
}

function member(fullName: string, stable: number): RosterMemberResponse {
  return {
    userId: fullName,
    shortName: fullName.slice(0, 3).toUpperCase(),
    fullName,
    bgColorHex: '#8e44ad',
    points: { stable },
  }
}

function mountFallback(
  startsAt: string | null,
  members: RosterMemberResponse[] | null = [],
) {
  return mount(RoundFallback, { props: { community: community(startsAt), members } })
}

describe('RoundFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T21:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says the community has no date yet, without asking the server', async () => {
    const spy = vi.spyOn(api, 'getCountdown')
    const w = mountFallback(null)
    await flushPromises()
    expect(w.find('[data-test="fallback-no-date"]').text()).toContain('Noch kein Termin')
    expect(w.text()).toContain('Diese Spielgemeinschaft entsteht gerade.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('reserves the space while the countdown is still in flight', () => {
    vi.spyOn(api, 'getCountdown').mockReturnValue(new Promise(() => {}))
    const w = mountFallback('2026-08-11T09:00:00Z')
    expect(w.find('[data-test="fallback-placeholder"]').exists()).toBe(true)
  })

  it('shows the board while the countdown runs', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(before)
    const w = mountFallback('2026-08-11T09:00:00Z')
    await flushPromises()
    expect(w.find('[data-test="countdown-card"]').exists()).toBe(true)
    expect(w.find('[data-test="countdown-hero"]').attributes('aria-label')).toBe(
      '58 Tage bis zum Start',
    )
  })

  it('congratulates the winner once the event runs', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 12), member('leela', 9)])
    await flushPromises()
    expect(w.find('[data-test="fallback-winner"]').text()).toContain(
      'Herzlichen Glückwunsch, fry!',
    )
    expect(w.text()).toContain('Und jetzt viel Spaß zusammen!')
  })

  it('names everyone tied at the top', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 12), member('leela', 12)])
    await flushPromises()
    expect(w.find('[data-test="fallback-winner"]').text()).toContain(
      'Herzlichen Glückwunsch, fry und leela!',
    )
  })

  it('congratulates nobody when nobody has scored', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 0), member('leela', 0)])
    await flushPromises()
    expect(w.find('[data-test="fallback-running"]').text()).toContain(
      'Und jetzt viel Spaß zusammen!',
    )
    expect(w.text()).not.toContain('Glückwunsch')
  })

  it('waits for the roster instead of flashing a winnerless message', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', null)
    await flushPromises()
    expect(w.find('[data-test="fallback-placeholder"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Spaß')
  })

  it('never announces that the event is running', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue(after)
    const w = mountFallback('2026-06-14T09:00:00Z', [member('fry', 0)])
    await flushPromises()
    expect(w.text()).not.toContain('Event läuft')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/RoundFallback.spec.ts`
Expected: FAIL — `Failed to resolve import "@/communities/fallbacks/RoundFallback.vue"`.

- [ ] **Step 3: Write minimal implementation**

Create `webapp-vue/src/communities/fallbacks/RoundFallback.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { CommunityResponse, RosterMemberResponse } from '@/api/types'
import { useCountdown } from '@/communities/useCountdown'
import { formatWinnerNames, winners } from '@/members/winner'
import CountdownCard from './CountdownCard.vue'
import MessageCard from './MessageCard.vue'

const props = defineProps<{
  community: CommunityResponse
  members: readonly RosterMemberResponse[] | null
}>()

// A null slug keeps useCountdown from firing: without a startsAt there is nothing to count.
const slug = computed(() => (props.community.startsAt ? props.community.slug : null))
const { view } = useCountdown(slug)

const chip = (i: number) => view.value.chips[i]?.value ?? '00'
const days = computed(() => chip(0).padStart(2, '0'))
const hours = computed(() => chip(1))
const minutes = computed(() => chip(2))
const seconds = computed(() => chip(3))

const winnerNames = computed(() =>
  props.members === null ? '' : formatWinnerNames(winners(props.members).map((m) => m.fullName)),
)
</script>

<template>
  <MessageCard
    v-if="community.startsAt === null"
    data-test="fallback-no-date"
    title="Noch kein Termin"
    text="Diese Spielgemeinschaft entsteht gerade. Komm später wieder."
  />
  <CountdownCard
    v-else-if="view.state === 'before'"
    :days="days"
    :hours="hours"
    :minutes="minutes"
    :seconds="seconds"
  />
  <MessageCard
    v-else-if="view.state === 'after' && members !== null && winnerNames !== ''"
    data-test="fallback-winner"
    :title="`Herzlichen Glückwunsch, ${winnerNames}!`"
    text="Und jetzt viel Spaß zusammen!"
  />
  <MessageCard
    v-else-if="view.state === 'after' && members !== null"
    data-test="fallback-running"
    title="Und jetzt viel Spaß zusammen!"
  />
  <div v-else data-test="fallback-placeholder" class="aspect-square w-full" aria-hidden="true" />
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/communities/fallbacks/__tests__/RoundFallback.spec.ts`
Expected: PASS, 8 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/fallbacks/RoundFallback.vue webapp-vue/src/communities/fallbacks/__tests__/RoundFallback.spec.ts
git commit -m "$(cat <<'EOF'
feat(webapp): choose the community fallback state

The branch order is the substance here. A missing startsAt is decided
synchronously from the community the route guard already resolved, so
that state costs no request and cannot flash; only the choice between
counting down and running waits on the countdown response, and until it
lands an equally sized placeholder holds the space.

The countdown instance lives here rather than in the card, because the
state decision needs it. It is deliberately a second instance and not
the header's: that one's base unit is click-cycleable, and switching it
to weeks must not reshape the hero, which always shows days.

The winner needs the roster, so members arrive as null while it loads
and the running state shows the placeholder until then. Otherwise the
card would say the winnerless line first and correct itself a moment
later.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Einbau in die Landingpage

**Files:**
- Modify: `webapp-vue/src/pages/c/[slug]/index.vue`
- Test: `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts` (erweitern)

**Interfaces:**
- Consumes: `RoundFallback.vue` (Task 6), `useRoster` aus `@/members/useRoster` (existiert; liefert
  `{ members, state, reload }`, `state` ist `'loading' | 'ready' | 'failed'`).
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Write the failing test**

Add to `webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts`. Der bestehende Fixture-Wert
`startsAt: null` deckt genau Zustand 1 ab.

Ergänze zuerst den Import am Kopf der Datei (die Komponente wird direkt referenziert, nicht über
einen abgeleiteten Namen gesucht):

```ts
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'
```

Dann am Ende der `describe`-Suite:

```ts
  it('fills the space below the row with the fallback content', async () => {
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const w = mountPage()
    await flushPromises()
    expect(w.find('[data-test="fallback-no-date"]').text()).toContain('Noch kein Termin')
  })

  it('withholds the roster from the fallback until it has loaded', () => {
    vi.spyOn(api, 'getRoster').mockReturnValue(new Promise(() => {}))
    const w = mountPage()
    expect(w.findComponent(RoundFallback).props('members')).toBe(null)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run "src/pages/c/[slug]/__tests__/index.spec.ts"`
Expected: FAIL — `fallback-no-date` nicht gefunden; die zweite Erwartung findet keine
`RoundFallback`-Komponente.

- [ ] **Step 3: Write minimal implementation**

Modify `webapp-vue/src/pages/c/[slug]/index.vue` — Script-Block auf:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useCommunityContext } from '@/communities/context'
import { useRoster } from '@/members/useRoster'
import MemberRow from '@/members/MemberRow.vue'
import RoundFallback from '@/communities/fallbacks/RoundFallback.vue'

const { community } = useCommunityContext()
const { members, state } = useRoster(community.value.slug)

// null, not [], while loading: an empty roster would read as "nobody has scored".
const settledMembers = computed(() => (state.value === 'ready' ? members.value : null))
</script>
```

Im Template direkt hinter dem schließenden `</section>` der Rangliste einfügen:

```vue
  <RoundFallback :community="community" :members="settledMembers" class="mt-6" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/pages/c/[slug]/__tests__/index.spec.ts"`
Expected: PASS, 5 Tests (3 bestehende + 2 neue).

- [ ] **Step 5: Commit**

```bash
git add "webapp-vue/src/pages/c/[slug]/index.vue" "webapp-vue/src/pages/c/[slug]/__tests__/index.spec.ts"
git commit -m "$(cat <<'EOF'
feat(webapp): mount the fallback content on the community page

The page hands the roster over as null until it has actually loaded. An
empty array would be indistinguishable from a community where nobody
has scored, and the card would congratulate nobody a moment before it
congratulates the winner.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: „Event läuft" aus dem Header entfernen

Der Header sagt die Aussage nicht mehr, die jetzt der Card gehört. Der T+-Aufwärtszähler bleibt —
er trägt eine Information, die die Card nicht trägt.

**Files:**
- Modify: `webapp-vue/src/communities/CountdownDisplay.vue:15-20`
- Test: `webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts` (erweitern)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: nichts für spätere Tasks.

- [ ] **Step 1: Write the failing test**

Add to `webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts` am Ende der `describe`-Suite:

```ts
  it('counts up without announcing the event, which the fallback card now says', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-14T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: -1,
        label: 'T+1',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('T+')
    expect(el.text()).not.toContain('Event läuft')
    expect(el.attributes('title')).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/communities/__tests__/CountdownDisplay.spec.ts`
Expected: FAIL — der Text enthält „Event läuft", und `title` ist gesetzt.

- [ ] **Step 3: Write minimal implementation**

Modify `webapp-vue/src/communities/CountdownDisplay.vue` — Template auf:

```vue
<template>
  <div
    v-if="view.state !== 'idle'"
    data-test="countdown"
    role="button"
    class="flex items-center gap-1 font-mono text-sm tabular-nums select-none sm:gap-2"
    :title="view.state === 'after' ? undefined : 'Countdown bis zum Start'"
    @click="cycleBaseUnit"
  >
    <span>{{ view.prefix }}</span>
    <span v-for="(chip, i) in view.chips" :key="i">
      <span>{{ chip.value }}</span
      ><span class="text-xs text-stone-300">{{ chip.unit }}</span>
    </span>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/communities/__tests__/CountdownDisplay.spec.ts`
Expected: PASS, 5 Tests (4 bestehende + 1 neuer).

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/communities/CountdownDisplay.vue webapp-vue/src/communities/__tests__/CountdownDisplay.spec.ts
git commit -m "$(cat <<'EOF'
drop(webapp): stop announcing "Event läuft" in the header

The fallback card owns that statement now. Two places saying the same
thing drift, and the header had it twice over — as visible text and as
its own tooltip.

The T+ counter stays: how long the event has been running is something
the card deliberately does not say.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Gesamtlauf, Sichtprüfung und Wissensrückfluss

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: PASS, alle Dateien. Keine übersprungenen Tests.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: beide exit 0. `pnpm typecheck` muss `vue-tsc -b` sein — `--noEmit` prüft auf der
Solution-`tsconfig.json` null Dateien und wäre grün, ohne etwas zu beweisen.

- [ ] **Step 3: Format**

Run: `pnpm format`
Expected: Prettier schreibt die neuen Dateien um, falls nötig. Danach `pnpm lint` erneut.

- [ ] **Step 4: Look at it in a browser**

Der Countdown braucht das Backend, weil `GET /api/communities/<slug>/countdown` echte Runden liefert.

1. Backend starten: `cd core && ./mvnw spring-boot:run` (startet Postgres 18 per Compose, braucht Docker).
2. Dev-Server über das Preview-Tool starten (nicht über Bash) und `http://localhost:5173` öffnen.
3. Über den Dev-Login-Picker als Futurama-Testuser anmelden, eine Community mit gesetztem
   `startsAt` öffnen.

Prüfen:
- Die Sekunden kippen im Sekundentakt, die Welle läuft von links nach rechts.
- Auf 375 px Breite (`resize_window` mobile) füllt die Tafel die Spalte, die Labels stehen unter
  ihren Ziffernpaaren, nichts läuft über den Rand.
- Mit `startsAt` in den Einstellungen auf leer → Zustand 1; `startsAt` in die Vergangenheit → Zustand 3.
- Konsole und Netzwerk-Log sind frei von Fehlern.
- Ein Screenshot der Tafel gehört in die Abschlussmeldung.

- [ ] **Step 5: Feed the learning back into the guidelines**

Modify `.claude/guidelines/frontend.md` — im Abschnitt **Testing** ergänzen:

```markdown
- **happy-dom has no Web Animations API.** Measured on happy-dom 20.11:
  `typeof Element.prototype.animate === 'undefined'` (while `window.matchMedia` *does* exist and
  reports `matches: false` for every query). So any component that calls `el.animate(...)` must
  check the capability — `typeof el.animate !== 'function'` — or every mount throws in tests, and
  the check has to leave the resting appearance correct on its own (bind the final colour/position
  declaratively; let the animation only cover the transition). A test that wants to *observe* the
  animation installs it itself:
  `Object.defineProperty(Element.prototype, 'animate', { value: vi.fn(), configurable: true, writable: true })`
  and deletes it again in `afterEach`. `src/ui/flipdot/FlipDotBoard.vue` + its spec are the worked
  example.
- **Reduced motion in tests:** `vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)`
  — happy-dom's own `matchMedia` always answers `false`, so the reduced-motion branch is unreachable
  without the stub.
```

Und im Abschnitt **Lint / format** bzw. bei den Tailwind-Notizen ergänzen:

```markdown
- **Tailwind v4 scans source text, so a class name must appear literally.** A computed
  `` `w-[${pct}%]` `` is never generated — no rule ends up in the CSS and the element simply has no
  width. Where a value varies, map it to literal class strings
  (`if (n <= 2) return 'w-[72%]'`), as `communities/fallbacks/CountdownCard.vue` does for the
  hero width.
```

- [ ] **Step 6: Commit the guidelines**

```bash
git add .claude/guidelines/frontend.md
git commit -m "$(cat <<'EOF'
docs(guidelines): record two frontend test traps

happy-dom 20 ships no Web Animations API, measured in this repo, while
matchMedia does exist and answers false to everything. Both cost real
time on the flip-dot board: the first makes every mount throw unless the
component checks, the second makes the reduced-motion branch unreachable
unless the test stubs it.

The Tailwind note is the same kind of trap one layer up — an
interpolated arbitrary value produces no CSS rule at all, so the element
silently has no width rather than a wrong one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin claude/community-fallback-content-7bb3e8
```

Dann PR mit `--base develop` öffnen (`develop` ist der GitHub-Default; `main` ist Produktion). Body:
kurze Beschreibung der drei Zustände, ein Screenshot der Tafel, Link auf den Spec.

---

## Self-Review

**Spec coverage:**

| Spec-Abschnitt | Task |
| --- | --- |
| Zustand 1 (kein Termin) + Copy | 4, 6 |
| Zustand 2 (Countdown) | 2, 5, 6 |
| Zustand 3 (Event läuft) + Gewinner-Copy + Gleichstand | 3, 4, 6 |
| Zustandsermittlung ohne Flackern (synchron / Platzhalter) | 6, 7 |
| Datenquelle: eigene `useCountdown`-Instanz, maskierter Slug, `view.chips` | 6 |
| Material (stone-900, Punktfarben, Mono-Labels) | 2, 5 |
| Geometrie (Pitch 4/Radius 1.5, Hero-Breiten, 94 %-Leiste, Label-Positionen) | 2, 5 |
| Zweistellige Nullung der Tageszahl | 6 (`padStart`), 5 (Breitenregel) |
| Punktschrift + unbekanntes Zeichen | 1 |
| Kipp-Effekt (170 ms, Farbwechsel bei 50 %, Stagger 9 ms, `fill: 'backwards'`) | 2 |
| `prefers-reduced-motion` | 2 |
| Gewinner = `roster[0]`-Rang > 0, alle bei Gleichstand, `fullName` | 3, 6 |
| Header verliert Label + Tooltip, Zähler bleibt | 8 |
| Struktur (`ui/flipdot/`, `communities/fallbacks/`, `members/winner.ts`) | 1–6 |
| Testliste des Specs | 1, 2, 3, 6, 8 |
| Ausdrücklich nicht dabei (kein Backend, keine Punkte, kein Runden-Content) | keine Task — nichts davon wird angefasst |

Keine Lücke. Die Spec-Testliste nennt `MessageCard`/`CountdownCard` nicht explizit; sie bekommen
hier eigene Specs (Task 4, 5), weil beide Geometrie- und Copy-Regeln tragen, die sonst nur indirekt
über `RoundFallback` geprüft würden.

**Placeholder scan:** kein TBD/TODO, kein „ähnlich wie Task N", jeder Code-Schritt enthält
vollständigen Code. Die Copy steht wortgleich im Plan.

**Type consistency:** `bitmap`/`Bitmap`/`GLYPH_COLS`/`GLYPH_ROWS` (Task 1) werden in Task 2 unter
genau diesen Namen importiert. `DOT_ON`/`DOT_OFF`/`PITCH`/`RADIUS`/`FLIP_MS`/`STAGGER_MS` (Task 2,
`board.ts`) sind in Komponente und Spec identisch benannt. `rankOf`/`winners`/`formatWinnerNames`
(Task 3) werden in Task 6 unter denselben Namen verwendet. Die Props-Namen `days`/`hours`/`minutes`/
`seconds` (Task 5) stimmen mit den Bindings in Task 6 überein, `text`/`label` (Task 2) mit den
Aufrufen in Task 5. `members: readonly RosterMemberResponse[] | null` ist in Task 6 und Task 7
gleich typisiert. `data-test`-Marker sind über Tasks 5–8 kollisionsfrei und werden nur dort
abgefragt, wo sie gesetzt werden.
