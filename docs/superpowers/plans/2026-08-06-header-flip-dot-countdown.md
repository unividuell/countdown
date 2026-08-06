# Header-Countdown als Flip-Dot-Tafel — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Header zeigt den Countdown als Flip-Dot-Tafel mit Legendenzeile statt als Mono-Textzeile — aus denselben Bausteinen wie die Fallback-Card.

**Architecture:** Der Font wird variabel breit (Trenner 3 statt 5 Spalten), die Label-Positionen kommen aus einer Metrikfunktion in `board.ts`, die Legendenzeile wird eine eigene Komponente, und `FlipDotBoard` schaltet sich bei Geometriewechsel selbst neu ein (weiß → halten → einrollen). Header und Card benutzen danach dieselben vier Teile.

**Tech Stack:** Vue 3 (`<script setup>`, TypeScript strict), Tailwind v4, Vitest + `@vue/test-utils` + happy-dom, pnpm.

**Spec:** [2026-08-06-header-flip-dot-countdown-design.md](../specs/2026-08-06-header-flip-dot-countdown-design.md)

## Global Constraints

- **Arbeitsverzeichnis für alle Kommandos:** `webapp-vue/`. Kein Backend, keine Migration.
- **Kommandos:** `pnpm test` (vitest run), `pnpm test -- <pfad>` für eine Datei, `pnpm typecheck` (`vue-tsc -b`), `pnpm lint`.
- **TypeScript strict inkl. `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`.** Indexzugriffe liefern `T | undefined`; der Code unten vermeidet Indexzugriffe deshalb, wo es geht.
- **Kommentare und Bezeichner auf Englisch, britische Schreibung** (`colour`, `centre`) — so wie der bestehende Code in `ui/flipdot/`. UI-Texte auf Deutsch.
- **Testframework ist Vitest mit `vi`**, nicht mockk. Siehe [frontend.md](../../../.claude/guidelines/frontend.md).
- **Die Suite muss nach jeder Task grün sein.** Wo eine Änderung bestehende Erwartungen bricht, gehört die Korrektur in dieselbe Task.
- **Branch:** die Arbeit läuft auf `claude/flip-dots-header-countdown-8bb3ef`; PRs gehen gegen `develop`.
- **Commit-Stil:** `<type>(webapp): <imperative, kleingeschrieben>`, Begründung in den Body. Jede Commit-Message endet mit der Zeile `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` — die unten vorgegebenen `git commit`-Kommandos zeigen sie nicht mit, sie ist trotzdem anzuhängen.
- **Feste Maße, die im Code auftauchen:** Tafelhöhe 26px (`h-[26px]`), Legendenzeile 16px (`h-4`), Abstand dazwischen 2px, Header-Zeile 1 32px (`h-8`), Header-Zeile 2 44px (`h-11`), Zeilenabstand 8px (`gap-y-2`), Header-Padding `px-4 py-3` → Gesamthöhe 108px.

---

### Task 1: Der Trenner belegt 3 statt 5 Spalten

Der Font wird variabel breit. Das ist die Grundlage für alles Weitere: ohne den schmaleren Trenner passt der Monats-Zustand des Zyklus nicht in einen 360px-Viewport.

**Files:**
- Modify: `src/ui/flipdot/font.ts` (Konstante, `glyphCols`, `patternOf`, `bitmap`)
- Test: `src/ui/flipdot/__tests__/font.spec.ts:53` (Erwartung) + neue Fälle
- Modify: `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts:148` (veralteter Kommentar)
- Modify: `src/communities/fallbacks/__tests__/CountdownCard.spec.ts:53,124` (Spaltenzahl des Strips)

**Interfaces:**
- Consumes: nichts.
- Produces: `SEPARATOR_COLS: 3`, `glyphCols(ch: string): number`, `bitmap(text: string): Bitmap` (Signatur unverändert, Spaltenzahl neu). Task 2 baut auf `glyphCols` und `bitmap` auf.

- [ ] **Step 1: Die neuen Erwartungen als Test schreiben**

In `src/ui/flipdot/__tests__/font.spec.ts` den bestehenden Fall in Zeile 53 ersetzen und die neuen Fälle anhängen. Der Import in Zeile 2 bekommt `SEPARATOR_COLS` und `glyphCols`:

```ts
import { GLYPH_COLS, GLYPH_ROWS, SEPARATOR_COLS, bitmap, glyphCols } from '@/ui/flipdot/font'
```

```ts
  // Replaces the old `8 * 6 - 1`: the separator is no longer as wide as a digit.
  it('grows the column count with the glyph widths, not with the character count', () => {
    // 6 digits at 5 columns + 2 separators at 3 + 7 single-column gaps.
    expect(bitmap('12:34:56').cols).toBe(6 * GLYPH_COLS + 2 * SEPARATOR_COLS + 7)
    expect(bitmap('12:34:56').cols).toBe(43)
  })

  it('gives the separator its own width', () => {
    expect(glyphCols(':')).toBe(SEPARATOR_COLS)
    expect(glyphCols('7')).toBe(GLYPH_COLS)
    expect(bitmap(':').cols).toBe(SEPARATOR_COLS)
  })

  it('keeps the separator lit in its middle column', () => {
    const b = bitmap(':')
    expect(lit(b.on)).toBe(2)
    expect(b.on[2 * b.cols + 1]).toBe(true)
    expect(b.on[4 * b.cols + 1]).toBe(true)
    expect(b.on[2 * b.cols + 0]).toBe(false)
    expect(b.on[2 * b.cols + 2]).toBe(false)
  })

  it('places the glyph after a separator by the separator width, not the digit width', () => {
    // '1' + gap + ':' + gap = 5 + 1 + 3 + 1 = 10, so the second digit starts at column 10.
    const b = bitmap('1:1')
    expect(b.cols).toBe(15)
    expect(b.on[0 * b.cols + 12]).toBe(true) // top dot of the trailing '1'
    for (let r = 0; r < b.rows; r++) {
      expect(b.on[r * b.cols + 9]).toBe(false) // the gap before it stays empty
    }
  })
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/font.spec.ts`
Expected: FAIL — `glyphCols` und `SEPARATOR_COLS` existieren nicht, `bitmap('12:34:56').cols` ist 47.

- [ ] **Step 3: Den Font variabel breit machen**

In `src/ui/flipdot/font.ts` unter `GLYPH_ROWS` ergänzen:

```ts
// The separator carries a single lit column. Four empty ones around it would only cost width —
// and width is the scarce dimension in the header, where the whole readout must fit next to
// nothing at all on a 360px phone.
export const SEPARATOR_COLS = 3
```

Nach der `GLYPHS`-Tabelle einfügen:

```ts
/** Columns a glyph occupies. Digits keep the full cell; the separator is a centred slice of it. */
export function glyphCols(ch: string): number {
  return ch === ':' ? SEPARATOR_COLS : GLYPH_COLS
}

function patternOf(ch: string): string[] {
  const rows = (GLYPHS[ch] ?? BLANK).split(',')
  if (glyphCols(ch) === GLYPH_COLS) return rows
  const offset = Math.floor((GLYPH_COLS - SEPARATOR_COLS) / 2)
  return rows.map((row) => row.slice(offset, offset + SEPARATOR_COLS))
}
```

`bitmap` vollständig ersetzen:

```ts
export function bitmap(text: string): Bitmap {
  const chars = [...text]
  const cols =
    chars.length === 0 ? 0 : chars.reduce((sum, ch) => sum + glyphCols(ch), 0) + chars.length - 1
  const on = new Array<boolean>(cols * GLYPH_ROWS).fill(false)

  let x = 0
  for (const ch of chars) {
    const width = glyphCols(ch)
    const rows = patternOf(ch)
    for (let r = 0; r < GLYPH_ROWS; r++) {
      const row = rows[r] ?? ''
      for (let c = 0; c < width; c++) {
        if (row[c] === '1') on[r * cols + x + c] = true
      }
    }
    x += width + 1
  }

  return { cols, rows: GLYPH_ROWS, on }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/font.spec.ts`
Expected: PASS, alle Fälle.

- [ ] **Step 5: Die mitgezogenen Erwartungen korrigieren**

Der Strip der Card ist jetzt 43 statt 47 Spalten breit. In `src/communities/fallbacks/__tests__/CountdownCard.spec.ts`:

```ts
    // Zeile 53
    expect(strip.findAll('circle').length).toBe(43 * 7)
```

```ts
    // Zeile 124
    expect(lit()).toBe(11 * 7 + 43 * 7)
```

In `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts` den Kommentar in Zeile 148 richtigstellen (die Assertions darunter bleiben gültig):

```ts
    // Only the last digit changed. It sits at columns 38-42 of 43, so an absolute offset would
    // have delayed the first dot by 38 * 9 ms while nothing else on the board moved.
```

- [ ] **Step 6: Volle Suite und Typecheck**

Run: `cd webapp-vue && pnpm test && pnpm typecheck`
Expected: PASS. Schlägt hier etwas anderes fehl, hängt es an einer weiteren fest verdrahteten Spaltenzahl — suchen mit `grep -rn "47 \* 7\|8 \* 6" src`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/flipdot/font.ts src/ui/flipdot/__tests__/font.spec.ts src/ui/flipdot/__tests__/FlipDotBoard.spec.ts src/communities/fallbacks/__tests__/CountdownCard.spec.ts
git commit -m "feat(webapp): the separator gets its own width in the flip-dot font

A colon as wide as a digit costs six columns for one lit dot. Three columns
carry the same two dots, and the width is what the header has none of: with the
old separator the base-unit cycle's months state needs 342px and overflows a
360px viewport.

The card's strip gets it too — it is width-driven, so there the saved columns
become larger dots rather than a narrower board."
```

---

### Task 2: `groupCentres` — Label-Positionen aus den Metriken

**Files:**
- Modify: `src/ui/flipdot/board.ts` (neue Funktion)
- Create: `src/ui/flipdot/__tests__/board.spec.ts`

**Interfaces:**
- Consumes: `bitmap`, `glyphCols` aus Task 1.
- Produces: `groupCentres(text: string): number[]` — je Ziffernfolge in `text` deren Mitte als Prozentwert der Boardbreite, in Reihenfolge von links. Tasks 3, 5 und 6 hängen daran.

- [ ] **Step 1: Den failing test schreiben**

Create `src/ui/flipdot/__tests__/board.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupCentres } from '@/ui/flipdot/board'

describe('groupCentres', () => {
  it('has no centre without digits', () => {
    expect(groupCentres('')).toEqual([])
    expect(groupCentres(':')).toEqual([])
  })

  it('centres a board that is one group', () => {
    expect(groupCentres('58')[0]).toBeCloseTo(50, 10)
    expect(groupCentres('58')).toHaveLength(1)
  })

  it('returns one centre per group, left to right', () => {
    const centres = groupCentres('13:42:07')
    expect(centres).toHaveLength(3)
    expect(centres[0]!).toBeLessThan(centres[1]!)
    expect(centres[1]!).toBeLessThan(centres[2]!)
  })

  // Symmetry pins the arithmetic without reimplementing it: for a text whose groups are all the
  // same width, the middle group must sit dead centre and the outer two must mirror each other.
  it('is symmetric for a symmetric readout', () => {
    const [first, middle, last] = groupCentres('13:42:07')
    expect(middle!).toBeCloseTo(50, 10)
    expect(first!).toBeCloseTo(100 - last!, 10)
  })

  // Derived by hand so a wrong formula cannot hide behind a coincidentally symmetric result:
  // the first group spans columns 0-10, so its centre sits at (0 * 4 + 10 * 4 + 2 * 1.5) / 2 = 21.5
  // of a board that is 43 * 4 - 1 = 171 units wide.
  it('puts the first group of HH:MM:SS at 12.57%', () => {
    expect(groupCentres('13:42:07')[0]!).toBeCloseTo(12.573, 3)
  })

  it('follows a group that grows a digit', () => {
    // A three-digit leading group pushes everything right of it further right.
    const two = groupCentres('99:04:33:12')
    const three = groupCentres('999:04:33:12')
    expect(three[1]!).toBeGreaterThan(two[1]!)
    expect(three).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/board.spec.ts`
Expected: FAIL — `groupCentres` wird nicht exportiert.

- [ ] **Step 3: `groupCentres` implementieren**

An `src/ui/flipdot/board.ts` anhängen (die Datei bekommt damit ihren ersten Import):

```ts
import { bitmap, glyphCols } from './font'

/**
 * Centre of each run of digits, as a percentage of the board's width — where the label for that
 * group belongs. Derived from the metrics rather than written down, so it follows a change to
 * SEPARATOR_COLS and a group that grows a digit.
 *
 * It lives here and not in font.ts because it needs PITCH and RADIUS: where a label sits is a
 * question about the rendered geometry, not about the glyph pattern.
 */
export function groupCentres(text: string): number[] {
  const width = bitmap(text).cols * PITCH - (PITCH - 2 * RADIUS)
  const centres: number[] = []
  let col = 0
  let start: number | null = null

  // The empty sentinel closes a group that runs to the end of the text.
  for (const ch of [...text, '']) {
    const isDigit = ch >= '0' && ch <= '9'
    if (isDigit && start === null) start = col
    if (!isDigit && start !== null) {
      // col has already advanced past the group's trailing gap, so its last column is col - 2.
      const last = col - 2
      centres.push((((start * PITCH + last * PITCH + 2 * RADIUS) / 2) / width) * 100)
      start = null
    }
    if (ch !== '') col += glyphCols(ch) + 1
  }

  return centres
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/board.spec.ts && pnpm typecheck`
Expected: PASS. `pnpm typecheck` belegt zusätzlich, dass `board.ts` → `font.ts` keinen Zyklus baut.

- [ ] **Step 5: Commit**

```bash
git add src/ui/flipdot/board.ts src/ui/flipdot/__tests__/board.spec.ts
git commit -m "feat(webapp): compute where a group's label belongs

The card writes its label positions down (left-[11.5%]). Those values are
correct for a five-column separator and wrong for a three-column one, and they
are wrong again as soon as a group grows a digit. groupCentres derives them from
the same metrics the board renders with, so there is nothing left to maintain."
```

---

### Task 3: `FlipDotLegend` — die Legendenzeile als Komponente

**Files:**
- Create: `src/ui/flipdot/FlipDotLegend.vue`
- Create: `src/ui/flipdot/__tests__/FlipDotLegend.spec.ts`

**Interfaces:**
- Consumes: `groupCentres` aus Task 2.
- Produces: Komponente mit Props `{ text: string; labels: readonly string[]; visible: boolean }`. Root ist ein `<div>`, durchgereichte Attribute (`class`, `data-test`) landen daran. Tasks 5 und 6 benutzen sie.

- [ ] **Step 1: Den failing test schreiben**

Create `src/ui/flipdot/__tests__/FlipDotLegend.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'
import { groupCentres } from '@/ui/flipdot/board'

function mountLegend(text: string, labels: string[], visible = true) {
  return mount(FlipDotLegend, { props: { text, labels, visible } })
}

const lefts = (w: ReturnType<typeof mountLegend>) =>
  w.findAll('span').map((s) => Number.parseFloat((s.element as HTMLElement).style.left))

describe('FlipDotLegend', () => {
  it('places one label per digit group, on its computed centre', () => {
    const w = mountLegend('13:42:07', ['STD', 'MIN', 'SEK'])
    expect(w.findAll('span').map((s) => s.text())).toEqual(['STD', 'MIN', 'SEK'])
    const expected = groupCentres('13:42:07')
    lefts(w).forEach((left, i) => expect(left).toBeCloseTo(expected[i]!, 3))
  })

  // The position is a computed percentage, so it has to be an inline style: Tailwind scans the
  // source and would never generate an interpolated left-[..%].
  it('positions with an inline style, not a utility class', () => {
    const first = mountLegend('13:42:07', ['STD', 'MIN', 'SEK']).findAll('span')[0]!
    expect((first.element as HTMLElement).style.left).not.toBe('')
    expect(first.classes()).toContain('-translate-x-1/2')
  })

  it('is hidden from assistive tech, because the board already reads the value', () => {
    expect(mountLegend('13:42:07', ['STD', 'MIN', 'SEK']).attributes('aria-hidden')).toBe('true')
  })

  it('follows the visible flag with a transition, not by unmounting', () => {
    const hidden = mountLegend('13:42:07', ['STD', 'MIN', 'SEK'], false)
    expect(hidden.classes()).toContain('opacity-0')
    expect(hidden.classes()).toContain('transition-opacity')
    expect(hidden.findAll('span')).toHaveLength(3)
    expect(mountLegend('13:42:07', ['STD', 'MIN', 'SEK'], true).classes()).toContain('opacity-100')
  })

  it('grows and shrinks with the readout', () => {
    expect(mountLegend('1:3:04:33:12', ['WO', 'TAGE', 'STD', 'MIN', 'SEK']).findAll('span')).toHaveLength(5)
    expect(mountLegend('12:04:33:12', ['TAGE', 'STD', 'MIN', 'SEK']).findAll('span')).toHaveLength(4)
  })

  it('renders an empty cell rather than undefined when a label is missing', () => {
    const w = mountLegend('13:42:07', ['STD'])
    expect(w.findAll('span')).toHaveLength(3)
    expect(w.text()).toBe('STD')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/FlipDotLegend.spec.ts`
Expected: FAIL — die Komponente existiert nicht.

- [ ] **Step 3: Die Komponente schreiben**

Create `src/ui/flipdot/FlipDotLegend.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { groupCentres } from './board'

const props = defineProps<{ text: string; labels: readonly string[]; visible: boolean }>()

// The board reads its own value out to assistive tech, so this row is decoration for the eye
// only — a second reading of the same numbers would just be noise.
const cells = computed(() =>
  groupCentres(props.text).map((centre, i) => ({
    left: `${centre}%`,
    label: props.labels[i] ?? '',
  })),
)
</script>

<template>
  <div
    aria-hidden="true"
    class="relative h-4 font-mono text-[11px] tracking-[0.14em] text-stone-500 transition-opacity duration-300"
    :class="visible ? 'opacity-100' : 'opacity-0'"
  >
    <!-- Inline style, not a utility class: the centre is computed, and Tailwind only generates the
         classes it can find in the source. -->
    <span
      v-for="(cell, i) in cells"
      :key="i"
      class="absolute -translate-x-1/2 whitespace-nowrap"
      :style="{ left: cell.left }"
      >{{ cell.label }}</span
    >
  </div>
</template>
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/FlipDotLegend.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/flipdot/FlipDotLegend.vue src/ui/flipdot/__tests__/FlipDotLegend.spec.ts
git commit -m "feat(webapp): one legend row for every flip-dot readout

The card positions three labels under its strip by hand. The header needs the
same thing for four to six groups whose widths change under it, so the row
becomes a component that asks groupCentres where each label goes."
```

---

### Task 4: Das Board schaltet sich bei Geometriewechsel neu ein

Heute bricht `flip()` bei ungleicher Spaltenzahl ab und der Inhalt springt hart um. Das trifft künftig den Zyklus-Wechsel im Header — und heute schon die Card, wenn der Tage-Zähler eine Stelle verliert.

**Files:**
- Modify: `src/ui/flipdot/FlipDotBoard.vue` (Emit-Typ, `goWhite`, `resolveFromWhite`, Watcher, `onMounted`)
- Modify: `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts` (`resolve` → `phase`, Geometrie-Fall ersetzt)
- Modify: `src/communities/fallbacks/CountdownCard.vue:26-28,44` (Consumer des Events)

**Interfaces:**
- Consumes: `BOOT_HOLD_MS` aus `board.ts` (existiert bereits).
- Produces: `FlipDotBoard` emittiert `phase` mit `'white' | 'live'` statt `resolve`. Task 6 hängt daran.

- [ ] **Step 1: Die Tests umschreiben und den neuen Fall hinzufügen**

In `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts` (`BOOT_HOLD_MS` ist dort bereits importiert):

Den Fall `'does not animate when the grid geometry changes'` **ersetzen** durch:

```ts
  it('switches itself on again when the geometry changes, instead of jumping', async () => {
    const animate = stubAnimate()
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await bootDone()
    animate.mockClear()

    await w.setProps({ text: '100' })
    await nextTick()
    // White first, and already at the new size: the width change happens while nothing is legible,
    // which is what keeps it from reading as a jump.
    expect(w.findAll('circle').length).toBe(17 * 7)
    expect(fills(w).every((f) => f === DOT_ON)).toBe(true)
    expect(animate).not.toHaveBeenCalled()
    expect(w.emitted('phase')?.at(-1)).toEqual(['white'])

    await advance(BOOT_HOLD_MS)
    const litAtRest = bitmap('100').on.filter(Boolean).length
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(litAtRest)
    expect(animate).toHaveBeenCalledTimes(17 * 7 - litAtRest)
    expect(w.emitted('phase')?.at(-1)).toEqual(['live'])
  })

  it('swaps a changed geometry instantly under prefers-reduced-motion', async () => {
    const animate = stubAnimate()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const w = mount(FlipDotBoard, { props: { text: '99', label: 'x' } })
    await w.setProps({ text: '100' })
    await nextTick()
    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(
      bitmap('100').on.filter(Boolean).length,
    )
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
```

Den Fall `'announces the resolve, so followers need no clock of their own'` **ersetzen** durch:

```ts
    it('announces every phase, so followers need no clock of their own', async () => {
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      // The dark phase is the starting state; nobody has to be told about it.
      expect(w.emitted('phase')).toBeUndefined()
      await advance(BOOT_DARK_MS)
      expect(w.emitted('phase')).toEqual([['white']])
      await advance(BOOT_RESOLVE_AT_MS - BOOT_DARK_MS)
      expect(w.emitted('phase')).toEqual([['white'], ['live']])
    })
```

In `'is skipped entirely under prefers-reduced-motion — no phases, no timer'` die Zeile
`expect(w.emitted('resolve')).toHaveLength(1)` ersetzen durch:

```ts
      expect(w.emitted('phase')).toEqual([['live']])
```

Die beiden Unmount-Fälle brauchen mehr als eine Umbenennung. `wrapper.unmount()` ruft in
`@vue/test-utils` 2.4.11 `removeEventHistory(this.vm)` und löscht damit die gesamte Emit-Historie der
Instanz — `emitted()` liefert danach `undefined`, ganz unabhängig davon, was vorher gefeuert hat. Die
heutige Zeile `expect(w.emitted('resolve')).toBeUndefined()` **am Ende** dieser Tests konnte deshalb
nie fehlschlagen. Die Assertion wandert vor das `unmount()`, wo die Information noch existiert, und
die wirkungslose Zeile am Ende entfällt:

```ts
    it('fires no timer after being unmounted inside the dark phase', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      expect(vi.getTimerCount()).toBe(2)
      // Asserted before the unmount: @vue/test-utils drops an instance's whole emit history inside
      // unmount(), so emitted() afterwards is undefined whatever happened — which is why the
      // assertion that used to stand at the end of this test could never have failed.
      expect(w.emitted('phase')).toBeUndefined()
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
    })

    it('fires no timer after being unmounted inside the hold', async () => {
      const animate = stubAnimate()
      const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
      await advance(BOOT_DARK_MS)
      animate.mockClear()
      expect(vi.getTimerCount()).toBe(1)
      expect(w.emitted('phase')).toEqual([['white']]) // see the note above about unmount()
      w.unmount()
      expect(vi.getTimerCount()).toBe(0)
      await bootDone()
      expect(animate).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`
Expected: FAIL — kein `phase`-Event; der Geometriewechsel bleibt beim harten Umschalten.

- [ ] **Step 3: Das Board umbauen**

In `src/ui/flipdot/FlipDotBoard.vue`:

Den Import aus `./board` um `BOOT_HOLD_MS` ergänzen und den Emit-Typ ersetzen:

```ts
const emit = defineEmits<{ phase: ['white' | 'live'] }>()
```

`const bootTimers: ReturnType<typeof setTimeout>[] = []` **vor** den `watch`-Aufruf verschieben (der Watcher plant jetzt selbst einen Timer, und eine `const` unterhalb wäre in der temporalen Todeszone).

Die beiden Phasenwechsel als Funktionen herausziehen, oberhalb des Watchers:

```ts
function goWhite(): void {
  phase.value = 'white'
  emit('phase', 'white')
}

function resolveFromWhite(): void {
  const prev = shown.value
  phase.value = 'live'
  emit('phase', 'live')
  void nextTick(() => flip(prev, shown.value))
}
```

Den Watcher ersetzen:

```ts
watch(
  bm,
  (next, prev) => {
    if (phase.value !== 'live') return
    if (prev.cols === next.cols) {
      flip(prev, next)
      return
    }
    // A different geometry cannot be flipped dot by dot: dot i no longer means what it meant. So
    // the board switches itself on again — white, hold, roll in — and the size change happens
    // while nothing is legible. Reduced motion gets the bare swap, as at mount.
    if (prefersReducedMotion()) return
    goWhite()
    bootTimers.push(setTimeout(resolveFromWhite, BOOT_HOLD_MS))
  },
  { flush: 'post' },
)
```

`onMounted` ersetzen:

```ts
onMounted(() => {
  if (phase.value === 'live') {
    emit('phase', 'live')
    return
  }
  bootTimers.push(
    // The white-up is a phase change, deliberately with no flip: every dot changes at once, so a
    // simultaneous kick is not readable as movement, while the animation would cost one concurrent
    // fill animation per dot — 553 on the header's months readout — in a single main-thread frame,
    // on an audience of phones. The colour change alone is the whole effect.
    setTimeout(goWhite, BOOT_DARK_MS),
    setTimeout(resolveFromWhite, BOOT_RESOLVE_AT_MS),
  )
})
```

- [ ] **Step 4: Den Consumer in der Card mitziehen**

In `src/communities/fallbacks/CountdownCard.vue` den Kommentar und das Ref anpassen:

```ts
// The boards own the switch-on timeline; the labels only follow it, so they wait for the hero's
// event instead of running a second clock that would have to repeat the reduced-motion decision.
// The board relights whenever its geometry changes, so this follows in both directions.
const resolved = ref(false)
```

und im Template am Hero-Board:

```html
        @phase="resolved = $event === 'live'"
```

- [ ] **Step 5: Tests laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test && pnpm typecheck`
Expected: PASS — insbesondere die Card-Tests zur Label-Blende, die weiterhin über `resolved` laufen.

- [ ] **Step 6: Commit**

```bash
git add src/ui/flipdot/FlipDotBoard.vue src/ui/flipdot/__tests__/FlipDotBoard.spec.ts src/communities/fallbacks/CountdownCard.vue
git commit -m "feat(webapp): the board relights when its geometry changes

flip() bailed out when the column count changed and the content swapped hard.
The header will hit that on every base-unit cycle, and the card hits it today
when the day count drops from 100 to 99. Both now get the tail of the boot
sequence — white, hold, roll in — which also hides the width change, because
nothing is legible while it happens.

resolve becomes phase, because a latch that can only switch on cannot describe a
board that goes through white more than once."
```

---

### Task 5: Der Card-Strip benutzt die Legende

Dazu kommt eine Folge aus dem Review von Task 4: seit das Board mehrfach durch Weiß geht, ist ein
einziges `resolved` für beide Labelgruppen falsch. Beim Übergang von dreistelligen auf zweistellige
Tage schaltet sich nur das Hero-Board neu ein — die Strip-Labels würden 300ms wegblenden, während
ihre Tafel durchgehend lesbar bleibt. Jede Labelgruppe folgt deshalb künftig der Phase *ihres*
Boards.

**Files:**
- Modify: `src/communities/fallbacks/CountdownCard.vue:26-28,44,55-66` (zwei Phasenquellen, Legendenzeile des Strips)
- Modify: `src/communities/fallbacks/__tests__/CountdownCard.spec.ts` (zwei neue Fälle)

**Interfaces:**
- Consumes: `FlipDotLegend` aus Task 3, `groupCentres` aus Task 2, `@phase` aus Task 4.
- Produces: nichts Neues.

- [ ] **Step 1: Den failing test schreiben**

In `src/communities/fallbacks/__tests__/CountdownCard.spec.ts` die Importe ergänzen — `groupCentres`
ist neu, `BOOT_HOLD_MS` kommt zu den bereits importierten Timing-Konstanten:

```ts
import { BOOT_DARK_MS, BOOT_HOLD_MS, BOOT_RESOLVE_AT_MS, DOT_ON } from '@/ui/flipdot/board'
import { groupCentres } from '@/ui/flipdot/board'
```

(zusammengefasst zu einem Import, wenn Prettier das so will)

und den Fall anhängen:

```ts
  it('positions the strip labels on the computed group centres', () => {
    const spans = mountCard('58').get('[data-test="countdown-label-time"]').findAll('span')
    const expected = groupCentres('13:42:07')
    expect(spans).toHaveLength(3)
    spans.forEach((span, i) => {
      expect(Number.parseFloat((span.element as HTMLElement).style.left)).toBeCloseTo(
        expected[i]!,
        3,
      )
    })
  })

  // The hero relights when the day count loses a digit, and only the hero. Driving both label
  // groups from one flag would blink STD/MIN/SEK out for 300ms while their strip stayed perfectly
  // legible.
  it('fades only the labels of the board that is relighting', async () => {
    const w = mountCard('100')
    await advance(BOOT_RESOLVE_AT_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)

    await w.setProps({ days: '99' })
    await nextTick()
    expect(w.get('[data-test="countdown-label-days"]').classes()).toContain('opacity-0')
    expect(w.get('[data-test="countdown-label-time"]').classes()).toContain('opacity-100')

    await advance(BOOT_HOLD_MS)
    expect(labelClasses(w).every((c) => c.includes('opacity-100'))).toBe(true)
  })
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/communities/fallbacks/__tests__/CountdownCard.spec.ts`
Expected: FAIL — die Labels stehen auf Tailwind-Klassen (`left-[11.5%]`), nicht auf einem Inline-Style; `style.left` ist leer.

- [ ] **Step 3: Die Legende einsetzen**

In `src/communities/fallbacks/CountdownCard.vue` den Import ergänzen:

```ts
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'
```

`resolved` und `labelOpacity` werden durch zwei Phasenquellen ersetzt — eine je Board:

```ts
// Each board owns its own switch-on timeline, and since a board relights whenever its geometry
// changes, the two are no longer in step: the hero relights when the day count loses a digit while
// the strip stays legible throughout. So each label group follows the phase of its own board rather
// than a single flag for the card.
const heroLive = ref(false)
const stripLive = ref(false)
```

Im Template bekommt das Hero-Board `@phase="heroLive = $event === 'live'"`, seine Bildunterschrift
`:class="heroLive ? 'opacity-100' : 'opacity-0'"`, und der Block `<div class="w-[94%]">` wird
ersetzt:

```html
    <div class="w-[94%]">
      <FlipDotBoard
        data-test="countdown-strip"
        :text="time"
        :label="`Verbleibende Zeit ${time}`"
        @phase="stripLive = $event === 'live'"
      />
      <FlipDotLegend
        data-test="countdown-label-time"
        class="mt-2"
        :text="time"
        :labels="['STD', 'MIN', 'SEK']"
        :visible="stripLive"
      />
    </div>
```

Das Tage-Label bleibt ein `<p>` — es ist eine mittige Bildunterschrift, keine Gruppenlegende. Nur der
Zeit-Label-`<div>` mit seinen drei absolut positionierten `<span>`s verschwindet; `FlipDotLegend`
bringt Opazität, Typografie und Höhe selbst mit.

Der Kommentar über `resolved`, der die Labels „auf das Ereignis des Hero" warten lässt, beschreibt
damit nicht mehr die Wahrheit und wird durch den oben stehenden ersetzt.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test -- src/communities/fallbacks && pnpm typecheck`
Expected: PASS — auch die bestehenden Fälle `'labels the three time groups'` und `'holds the labels back until the boards start resolving'`: `FlipDotLegend` trägt `opacity-0` / `opacity-100` / `transition-opacity` an ihrer Wurzel, und `data-test` sowie `class` reichen dorthin durch.

- [ ] **Step 5: Commit**

```bash
git add src/communities/fallbacks/CountdownCard.vue src/communities/fallbacks/__tests__/CountdownCard.spec.ts
git commit -m "refactor(webapp): the card's strip labels stop being hand-placed

11.5% / 50% / 88.5% were the right numbers for a five-column separator. Asking
groupCentres means they are the right numbers for whatever the font does next."
```

---

### Task 6: Der Header-Countdown wird eine Tafel

**Files:**
- Modify: `src/communities/CountdownDisplay.vue` (vollständig ersetzt)
- Modify: `src/communities/__tests__/CountdownDisplay.spec.ts` (Darstellungs-Assertions)

**Interfaces:**
- Consumes: `FlipDotBoard` (mit `@phase` aus Task 4), `FlipDotLegend` aus Task 3, `useCountdown`/`view.chips` unverändert.
- Produces: `CountdownDisplay` rendert `[data-test="countdown"]` (Wrapper, klickbar) mit `[data-test="countdown-board"]` und der Legende darin.

- [ ] **Step 1: Die Tests umschreiben**

In `src/communities/__tests__/CountdownDisplay.spec.ts` oben ergänzen:

```ts
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'
```

Im Fall `'renders the ticking countdown for the active community'` die drei Text-Assertions am Ende ersetzen:

```ts
    // 10 days to the start, 12 hours to the round boundary. The leading group is padded so the
    // board keeps its width across a day boundary.
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('10:12:00:00')
    expect(w.getComponent(FlipDotLegend).props('labels')).toEqual(['TAGE', 'STD', 'MIN', 'SEK'])
    expect(w.getComponent(FlipDotBoard).props('label')).toContain('10 Tage')
```

Im Fall `'cycles the base unit on click'` die letzte Assertion ersetzen:

```ts
    // months + weeks + days now, so six groups and six labels — the widest state the board has.
    expect(w.getComponent(FlipDotLegend).props('labels')).toEqual([
      'MON',
      'WO',
      'TAGE',
      'STD',
      'MIN',
      'SEK',
    ])
    expect(w.getComponent(FlipDotBoard).props('text').split(':')).toHaveLength(6)
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('00:1:3:12:00:00')
```

Im Fall `'retries a first load that failed, instead of staying idle forever'` die letzte Zeile ersetzen:

```ts
    expect(w.find('[data-test="countdown"]').exists()).toBe(true)
```

Im Fall `'counts up without announcing the event, which the fallback card now says'` die drei
Assertions am Ende ersetzen:

```ts
    expect(w.getComponent(FlipDotBoard).props('label')).toContain('Laufzeit')
    expect(el.text()).not.toContain('Event läuft')
    expect(el.attributes('title')).toBeUndefined()
```

und den Fall anhängen:

```ts
  it('pads only the leading group, so the widest state still fits the header', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 5,
        label: 'T-5',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    expect(w.getComponent(FlipDotBoard).props('text')).toBe('05:12:00:00')
  })

  it('cycles from the keyboard too, because the board is a control and not a caption', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    const el = w.find('[data-test="countdown"]')
    expect(el.attributes('tabindex')).toBe('0')

    await el.trigger('keydown.enter')
    expect(w.getComponent(FlipDotLegend).props('labels')).toHaveLength(6) // months + weeks + days

    await el.trigger('keydown.space')
    expect(w.getComponent(FlipDotLegend).props('labels')).toHaveLength(5) // weeks + days
  })

  it('caps the board width instead of letting it push the header apart', async () => {
    vi.spyOn(api, 'getCountdown').mockResolvedValue({
      serverNow: '2026-06-14T21:00:00Z',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      round: {
        number: 10,
        label: 'T-10',
        start: '2026-06-14T09:00:00Z',
        end: '2026-06-15T09:00:00Z',
      },
      nextRound: null,
    })
    const Cmp = (await import('@/communities/CountdownDisplay.vue')).default
    const w = mount(Cmp, { props: { slug: 'team' } })
    await flushPromises()
    // happy-dom computes no CSS, so the classes are the observable proxy: a fixed height with an
    // automatic width is what keeps the dot size constant, and max-w-full is the net below 360px.
    const board = w.find('[data-test="countdown-board"]')
    expect(board.classes()).toContain('h-[26px]')
    expect(board.classes()).toContain('w-auto')
    expect(board.classes()).toContain('max-w-full')
    // The board's percentage cap needs a definite width to resolve against, and the legend takes
    // its own width from the same box — so the wrapper states fit-content instead of relying on
    // shrink-to-fit.
    const wrapper = w.find('[data-test="countdown"]')
    expect(wrapper.classes()).toContain('w-fit')
    expect(wrapper.classes()).toContain('max-w-full')
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/communities/__tests__/CountdownDisplay.spec.ts`
Expected: FAIL — `getComponent(FlipDotBoard)` findet nichts, die Komponente rendert noch Text-Chips.

- [ ] **Step 3: Die Komponente ersetzen**

`src/communities/CountdownDisplay.vue` vollständig ersetzen:

```vue
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useCountdown } from '@/communities/useCountdown'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import FlipDotLegend from '@/ui/flipdot/FlipDotLegend.vue'

const props = defineProps<{ slug: string | null | undefined }>()
const { view, cycleBaseUnit } = useCountdown(toRef(props, 'slug'))

const UNIT_LABELS: Record<string, string> = {
  M: 'MON',
  w: 'WO',
  d: 'TAGE',
  h: 'STD',
  m: 'MIN',
  s: 'SEK',
}

const UNIT_NAMES: Record<string, [string, string]> = {
  M: ['Monat', 'Monate'],
  w: ['Woche', 'Wochen'],
  d: ['Tag', 'Tage'],
  h: ['Stunde', 'Stunden'],
  m: ['Minute', 'Minuten'],
  s: ['Sekunde', 'Sekunden'],
}

// Only the leading group is padded. Two digits keep the board's width stable across a day
// boundary, which is worth having because a width change costs a full relight. Padding the inner
// groups of the months state as well would push the board past the width the header has.
const text = computed(() =>
  view.value.chips.map((chip, i) => (i === 0 ? chip.value.padStart(2, '0') : chip.value)).join(':'),
)

const labels = computed(() => view.value.chips.map((chip) => UNIT_LABELS[chip.unit] ?? ''))

// A dot matrix reads as nothing to a screen reader, and the legend is aria-hidden — so this is the
// only place the value is spoken. It carries what the dropped T-/T+ prefix used to say.
const reading = computed(() => {
  const parts = view.value.chips.map((chip) => {
    const value = Number(chip.value)
    const names = UNIT_NAMES[chip.unit]
    return names === undefined ? chip.value : `${value} ${value === 1 ? names[0] : names[1]}`
  })
  return view.value.state === 'after'
    ? `Laufzeit ${parts.join(', ')}`
    : `Noch ${parts.join(', ')} bis zum Start`
})

const legendVisible = ref(false)
</script>

<template>
  <div
    v-if="view.state !== 'idle'"
    data-test="countdown"
    role="button"
    tabindex="0"
    class="w-fit max-w-full select-none"
    :title="view.state === 'after' ? undefined : 'Countdown bis zum Start'"
    @click="cycleBaseUnit"
    @keydown.enter="cycleBaseUnit"
    @keydown.space.prevent="cycleBaseUnit"
  >
    <!-- Height-driven, so the dot size is the same in every state and at every viewport width; the
         viewBox ratio supplies the width. max-w-full is the net for anything below 360px, where
         preserveAspectRatio then scales the dots down inside the reserved height instead of
         letting the board push the header apart — it resolves against the wrapper's w-fit width,
         which is why the wrapper states fit-content rather than leaving it to shrink-to-fit.
         The legend inherits that same width, so it needs no width of its own. -->
    <FlipDotBoard
      data-test="countdown-board"
      class="h-[26px] w-auto max-w-full"
      :text="text"
      :label="reading"
      @phase="legendVisible = $event === 'live'"
    />
    <FlipDotLegend class="mt-0.5" :text="text" :labels="labels" :visible="legendVisible" />
  </div>
</template>
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test -- src/communities/__tests__/CountdownDisplay.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/communities/CountdownDisplay.vue src/communities/__tests__/CountdownDisplay.spec.ts
git commit -m "feat(webapp): the header countdown becomes a flip-dot board

The fallback card is rarely on screen, so this text line was in practice the
only countdown anyone saw. It is now the same board, from the same parts, with
the units in the legend row below it.

T-/T+ is gone. The aria-label carries what it said, and says it in words rather
than in a prefix nobody outside aerospace reads."
```

---

### Task 7: Der Header hat überall dieselbe Höhe

**Files:**
- Modify: `src/App.vue:36-49` (Header-Grid)
- Modify: `src/__tests__/app-header.spec.ts` (neue Fälle)

**Interfaces:**
- Consumes: `CountdownDisplay` aus Task 6.
- Produces: nichts Neues. `[data-test="countdown-row"]` als Prüfpunkt für die reservierte Zeile.

- [ ] **Step 1: Die failing tests schreiben**

In `src/__tests__/app-header.spec.ts` anhängen:

```ts
  // The header must be the same height on every page: a countdown that appears when you enter a
  // community would otherwise shove the content below it down by 52px.
  it('reserves the countdown row even where no community is active', () => {
    const w = mount(App, { global: { stubs } })
    const row = w.get('[data-test="countdown-row"]')
    expect(row.classes()).toContain('h-11')
    expect(w.find('[data-test="countdown-widget"]').exists()).toBe(false)
  })

  it('sits the countdown below the community title, at every width', () => {
    activeCommunity.value = {
      slug: 'huette',
      name: 'Hütte Hütte',
      startsAt: '2026-06-25T09:00:00Z',
      startsAtTimezone: 'Europe/Berlin',
      viewerIsAdmin: false,
      pendingCount: 0,
    }
    const row = mount(App, { global: { stubs } }).get('[data-test="countdown-row"]')
    expect(row.get('[data-test="countdown-widget"]').exists()).toBe(true)
    expect(row.classes()).toContain('row-start-2')
    // No breakpoint variant anywhere on the row: one layout, one instance, at every width.
    expect(row.classes().filter((c) => c.includes(':'))).toEqual([])
  })

  // The row's height must not depend on whether a viewer is signed in — without the avatar, an
  // implicit row height would make the header 100px on the login page and 108px everywhere else.
  it('holds the title row open without the member menu', () => {
    const anonymous = mount(App, { global: { stubs } }).get('[data-test="title-row"]')
    expect(anonymous.classes()).toContain('h-8')
    mockStatus('authenticated')
    expect(mount(App, { global: { stubs } }).get('[data-test="title-row"]').classes()).toContain(
      'h-8',
    )
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd webapp-vue && pnpm test -- src/__tests__/app-header.spec.ts`
Expected: FAIL — `[data-test="countdown-row"]` und `[data-test="title-row"]` existieren nicht.

- [ ] **Step 3: Den Header umbauen**

In `src/App.vue` das `<header>`-Element ersetzen (die `navigationPending`-Leiste und alles darunter bleibt unverändert):

```html
      <!-- Two rows with fixed heights, at every width: 24px padding + 32px + 8px + 44px = 108px.
           The height must not depend on the page, so row 2 stays reserved where no countdown
           lives, and row 1 gets its 32px from h-8 rather than from the avatar — on the login page
           there is no MemberMenu to supply it. -->
      <header
        class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 bg-stone-900 px-4 py-3 text-stone-50"
      >
        <div
          data-test="title-row"
          class="col-start-1 row-start-1 flex h-8 min-w-0 items-center gap-2"
        >
          <CommunityMenu v-if="activeCommunity" :community="activeCommunity" />
          <RouterLink to="/" class="font-semibold hover:underline"
            >{{ brand }}<span class="text-stone-400">{{ yearSuffix }}</span></RouterLink
          >
        </div>
        <div class="col-start-2 row-start-1 flex items-center">
          <MemberMenu v-if="user" :user="user" />
        </div>
        <div data-test="countdown-row" class="col-span-2 col-start-1 row-start-2 h-11">
          <CountdownDisplay v-if="activeCommunity?.startsAt" :slug="activeCommunity.slug" />
        </div>
      </header>
```

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, volle Suite.

- [ ] **Step 5: Im Browser nachsehen**

Run: `cd webapp-vue && pnpm dev` (bzw. den Preview-Server des Harness) und eine Community-Seite öffnen.

Zu prüfen — und ohne diese Prüfung gilt die Task nicht als fertig, weil happy-dom kein CSS rechnet und keine der Assertions oben eine Pixelhöhe belegt:

1. Der Header ist 108px hoch, auf einer Community-Seite und auf `/` gleich (DevTools: `document.querySelector('header').getBoundingClientRect().height`).
2. Die Tafel steht unter dem Titel, linksbündig mit dem Community-Menü.
3. Der Sekundentakt läuft mit der Welle von rechts.
4. Ein Klick auf die Tafel schaltet die Basiseinheit um: alles weiß, kurz halten, dann rollen die neuen Einheiten ein — die Breitenänderung ist nicht als Sprung zu sehen.
5. Bei 360px Viewportbreite läuft der Monats-Zustand nicht über — und bei 320px greift das Netz: die Tafel wird kleiner, der Header behält seine 108px und bekommt keinen horizontalen Scrollbalken.
6. Die Legende steht unter den Gruppenmitten, in jedem der drei Zustände.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/__tests__/app-header.spec.ts
git commit -m "feat(webapp): the header keeps one height and wears the board below the title

The countdown belongs to the community's name, so it sits under it — at every
width, with no breakpoint switch and one instance. Both rows have fixed heights,
including where no countdown lives, so the header is 108px on every page and
entering a community shifts nothing below it.

Row 1 gets its 32px from h-8 and not from the avatar: on the login page there is
no MemberMenu, and a height that depends on being signed in is not a fixed
height."
```

---

## Was danach offen ist

- Die Card ist von diesem Plan nur mittelbar betroffen (engerer Trenner, Legende als Komponente). Ihr Hero-Board, ihre Aufteilung und ihre Prozentbreiten bleiben, wie sie sind.
- Die Tastaturbedienung des Zyklus ist in Task 6 enthalten (`tabindex="0"`, Enter und Leertaste). Sie stand ursprünglich nicht im Plan: `role="button"` ohne Tastatur-Handler ist der Stand vor dieser Arbeit, wäre im Diff aber eine neu hinzugefügte Zeile — und ein Bedienelement, das nur die Maus erreicht, will man nicht neu einchecken.
- Ob ein 108px hoher Header `sticky` sein soll, ist bewusst nicht Teil dieser Arbeit.
