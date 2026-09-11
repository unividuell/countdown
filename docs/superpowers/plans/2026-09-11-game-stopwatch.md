# Die Spieluhr im Band — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Flip-Dot-Board im Game-Header zeigt während eines getimten Spiels die eigene Spielzeit — Rundencountdown → `2 · 1 · GO!` → bernsteinfarbene Stoppuhr → nach dem Tipp wieder Countdown — und das Punktfeld reicht endlich bis an die Kanten des Bandes.

**Architecture:** Reines Frontend. `FlipDotBoard` bekommt zwei optionale Props (`tone`, `pad`), die sein heutiges Verhalten als Default behalten. Ein reines Modul `elapsedClock.ts` rechnet die Stoppuhr, ein Composable `useStartCeremony.ts` fährt die drei Beats und feuert den Reveal-Request **auf** dem GO-Beat. `GameHeader` entscheidet aus einer einzigen neuen Prop `play`, welches der drei Gesichter es zeigt; `RoundCard` leitet den Beat durch und leitet den laufenden Fall aus der Runde ab, die es ohnehin schon hält.

**Tech Stack:** Vue 3 (`<script setup>`, TypeScript strict) · Vite 8 · Tailwind v4 · Vitest + @vue/test-utils + happy-dom · pnpm.

**Spec:** [`docs/superpowers/specs/2026-09-11-game-stopwatch-design.md`](../specs/2026-09-11-game-stopwatch-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch** mit `„…“`-Anführungszeichen, nie `"`. Spec/Plan deutsch.
- **Testing:** Vitest `vi` (nie mockk/kotest), `@vue/test-utils`, happy-dom. TDD: erst der fallende Test, dann die minimale Implementierung.
- **`enableAutoUnmount(afterEach)`** in jeder Spec, die eine Komponente mit Uhr mountet — sonst hält ein überlebender Consumer die geteilte Uhr über den Testfall hinaus.
- **Alle Befehle aus `webapp-vue/`.** Nach jeder Task: `pnpm lint && pnpm typecheck && pnpm test`.
- **Keine redundanten Inline-Kommentare.** Kommentare nur für Constraints, die der Code nicht zeigen kann — nie „was hier steht“ nacherzählen.
- **Keine Backend-Änderung, keine Wire-Änderung.** Alles Nötige steht schon auf der Leitung.
- **Feste Werte:** `DOT_ALARM_ON = '#f59e0b'` (amber-500) · `HEADER_PAD = { top: 2, right: 5, bottom: 2, left: 1 }` · `BEAT_MS = 1000` · `GO_HOLD_MS = 500` · Beats `'2' | '1' | 'GO!'` · Stoppuhrformat `MM:SS`.
- **Der Dev-Server bedient den Haupt-Checkout, nicht diesen Worktree.** Eine visuelle Kontrolle im Browser prüft also fremden Code, solange der Branch nicht dort ausgecheckt ist. Die Tasks unten verlassen sich deshalb ausschließlich auf Vitest; wer trotzdem hinsehen will, checkt den Branch vorher im Haupt-Checkout aus.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/ui/flipdot/font.ts` *(ändern)* | `padded()` + `Pad`; die Glyphen `G`, `O`, `!` |
| `src/ui/flipdot/board.ts` *(ändern)* | `Tone`, `TONES`, `DOT_ALARM_ON`, `HEADER_PAD` |
| `src/ui/flipdot/FlipDotBoard.vue` *(ändern)* | Props `tone`/`pad`; alle Farbschreibvorgänge lesen das Tonpaar |
| `src/ui/elapsedClock.ts` *(neu)* | rein: `elapsedClock()`, `elapsedReading()` |
| `src/ui/useStartCeremony.ts` *(neu)* | `StartBeat`, `PlayClock`, `useStartCeremony()` |
| `src/ui/GameHeader.vue` *(ändern)* | Prop `play`; die drei Gesichter; bündiges, gepolstertes Board |
| `src/rounds/RoundCard.vue` *(ändern)* | Prop `beat`; leitet den laufenden Fall aus der Runde ab |
| `src/pages/c/[slug]/index.vue` *(ändern)* | besitzt die Zeremonie, verpackt `reveal`, sperrt den Knopf |
| `src/pages/c/[slug]/lab/[game]/index.vue` *(ändern)* | dasselbe plus Client-Stempel |

Zwei Namen, zwei Formen — bewusst asymmetrisch: `GameHeader` nimmt `play` (es hat keine Runde, aus der es etwas ableiten könnte), `RoundCard` nimmt `beat` und leitet `play` aus seiner Runde ab (es hat sie). Eine Karte, die `play` durchreichte, hätte jeden ihrer Aufrufer — die Rundenhistorie eingeschlossen — die Auslösebedingung selbst formulieren lassen.

---

### Task 1: `padded()` — Leerzellen um eine Bitmap

**Files:**
- Modify: `src/ui/flipdot/font.ts`
- Test: `src/ui/flipdot/__tests__/font.spec.ts` *(vorhanden — `describe('flipdot font', …)` mit 11 Tests; **anhängen**, nicht ersetzen)*

**Interfaces:**
- Consumes: `bitmap()`, `Bitmap`, `GLYPH_COLS`, `GLYPH_ROWS` — alle schon in `font.ts`.
- Produces: `export interface Pad { top: number; right: number; bottom: number; left: number }` und `export function padded(bm: Bitmap, pad: Pad): Bitmap`.

- [ ] **Step 1: Write the failing test**

An das bestehende `src/ui/flipdot/__tests__/font.spec.ts` **anhängen** — die Datei hält bereits
`describe('flipdot font', …)` mit 11 Tests über Ziffern, Doppelpunkt und unbekannte Zeichen. Der
Import am Kopf wird um `padded` und `type Bitmap` erweitert, der bestehende Block bleibt stehen:

```ts
import { describe, expect, it } from 'vitest'
import { bitmap, GLYPH_COLS, GLYPH_ROWS, padded, type Bitmap } from '@/ui/flipdot/font'

const PAD = { top: 2, right: 5, bottom: 2, left: 1 }
const lit = (b: Bitmap, row: number, col: number) => b.on[row * b.cols + col] ?? false

describe('padded', () => {
  it('grows the field by exactly the cells it is given', () => {
    const bm = padded(bitmap('1'), PAD)

    expect(bm.cols).toBe(GLYPH_COLS + PAD.left + PAD.right)
    expect(bm.rows).toBe(GLYPH_ROWS + PAD.top + PAD.bottom)
    expect(bm.on).toHaveLength(bm.cols * bm.rows)
  })

  it('moves the glyph into the field rather than clipping it', () => {
    const bare = bitmap('1')
    const bm = padded(bare, PAD)

    for (let r = 0; r < bare.rows; r++) {
      for (let c = 0; c < bare.cols; c++) {
        expect(lit(bm, r + PAD.top, c + PAD.left)).toBe(lit(bare, r, c))
      }
    }
  })

  // The padding is field, not glyph: a lit dot out there would read as a stray mark on the band.
  it('leaves every added cell dark', () => {
    const bm = padded(bitmap('12:34'), PAD)
    const rowLit = (r: number) => bm.on.slice(r * bm.cols, (r + 1) * bm.cols).some(Boolean)
    const colLit = (c: number) => bm.on.filter((_, i) => i % bm.cols === c).some(Boolean)

    expect(rowLit(0)).toBe(false)
    expect(rowLit(bm.rows - 1)).toBe(false)
    expect(colLit(0)).toBe(false)
    expect(colLit(bm.cols - 1)).toBe(false)
  })

  it('is the identity for no padding at all', () => {
    const bare = bitmap('12:34')

    expect(padded(bare, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual(bare)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts`
Expected: FAIL — `padded` und `Pad` existieren nicht (`does not provide an export named 'padded'`).

- [ ] **Step 3: Write minimal implementation**

An das Ende von `src/ui/flipdot/font.ts`:

```ts
/** Blank cells around a bitmap, in dot cells. */
export interface Pad {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * The same glyphs on a larger field.
 *
 * Added to the bitmap and not as CSS padding, because the viewBox, the dot indices and the flip
 * wave all count in cells — a field that grew only in CSS would leave the board animating the
 * wrong dots.
 */
export function padded(bm: Bitmap, pad: Pad): Bitmap {
  const cols = bm.cols + pad.left + pad.right
  const rows = bm.rows + pad.top + pad.bottom
  const on = new Array<boolean>(cols * rows).fill(false)

  for (let r = 0; r < bm.rows; r++) {
    for (let c = 0; c < bm.cols; c++) {
      on[(r + pad.top) * cols + c + pad.left] = bm.on[r * bm.cols + c] ?? false
    }
  }

  return { cols, rows, on }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (4 Tests), lint und typecheck sauber.

- [ ] **Step 5: Commit**

```bash
git add src/ui/flipdot/font.ts src/ui/flipdot/__tests__/font.spec.ts
git commit -m "Let a flip-dot bitmap carry blank cells around it"
```

---

### Task 2: Die Glyphen `G`, `O` und `!`

**Files:**
- Modify: `src/ui/flipdot/font.ts:12-25` (die `GLYPHS`-Tabelle)
- Test: `src/ui/flipdot/__tests__/font.spec.ts`

**Interfaces:**
- Consumes: `GLYPHS`, `glyphCols()`, `bitmap()` aus `font.ts`.
- Produces: nichts Neues nach außen — `bitmap('GO!')` zeichnet ab jetzt drei Zeichen statt dreimal nichts.

- [ ] **Step 1: Write the failing test**

An `src/ui/flipdot/__tests__/font.spec.ts` anhängen:

```ts
describe('the start signal', () => {
  // The ceremony flips beat to beat instead of relighting between them, and that only holds while
  // every beat is the same width. `:` is deliberately narrowed to 3 columns; `!` must not be.
  it('keeps the full cell for !, so every beat is exactly as wide as GO!', () => {
    expect(glyphCols('!')).toBe(GLYPH_COLS)
    expect(bitmap('GO!').cols).toBe(bitmap('  2').cols)
  })

  it('draws G, O and ! rather than falling back to a blank cell', () => {
    for (const ch of ['G', 'O', '!']) {
      expect(bitmap(ch).on.some(Boolean)).toBe(true)
    }
  })
})
```

Den Import in Zeile 2 derselben Datei auf `glyphCols` erweitern:

```ts
import { bitmap, GLYPH_COLS, GLYPH_ROWS, glyphCols, padded, type Bitmap } from '@/ui/flipdot/font'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts`
Expected: FAIL — „draws G, O and !“ schlägt fehl, weil `GLYPHS` die drei Zeichen nicht kennt und `patternOf` auf `BLANK` zurückfällt (keine leuchtende Zelle).

- [ ] **Step 3: Write minimal implementation**

In `src/ui/flipdot/font.ts`, in der `GLYPHS`-Tabelle unter den Ziffern:

```ts
  // The start signal. `O` is the same pattern as `0` — at 5×7 there is nothing to tell them apart
  // that would not make the letter worse, and „GO!“ leaves no room to read it as a number.
  'G': '01110,10001,10000,10011,10001,10001,01110',
  'O': '01110,10001,10001,10001,10001,10001,01110',
  '!': '00100,00100,00100,00100,00100,00000,00100',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/flipdot/__tests__/font.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/flipdot/font.ts src/ui/flipdot/__tests__/font.spec.ts
git commit -m "Teach the flip-dot font to say GO!"
```

---

### Task 3: Farbton und Polsterung am Board

**Files:**
- Modify: `src/ui/flipdot/board.ts:1-10`
- Modify: `src/ui/flipdot/FlipDotBoard.vue`
- Test: `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`

**Interfaces:**
- Consumes: `Pad`, `padded()` (Task 1).
- Produces:
  - `export type Tone = 'default' | 'alarm'`
  - `export const TONES: Record<Tone, { on: string; off: string }>`
  - `export const DOT_ALARM_ON = '#f59e0b'`
  - `export const HEADER_PAD: Pad`
  - `FlipDotBoard`-Props: `{ text: string; label: string; tone?: Tone; pad?: Pad }`

- [ ] **Step 1: Write the failing test**

An `src/ui/flipdot/__tests__/FlipDotBoard.spec.ts` anhängen (innerhalb des bestehenden `describe('FlipDotBoard', …)`):

```ts
  it('paints the reading in the tone it is given and leaves the field alone', async () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins', tone: 'alarm' } })
    await bootDone()

    expect(fills(w).filter((f) => f === DOT_ALARM_ON).length).toBe(10)
    expect(fills(w).filter((f) => f === DOT_OFF).length).toBe(5 * 7 - 10)
  })

  it('defaults to the plain tone, so every board that asks for none is unchanged', async () => {
    const w = mount(FlipDotBoard, { props: { text: '1', label: 'eins' } })
    await bootDone()

    expect(fills(w).filter((f) => f === DOT_ON).length).toBe(10)
  })

  it('grows the field by the cells it is padded with, so the dots can reach a band edge', async () => {
    const w = mount(FlipDotBoard, {
      props: { text: '12', label: 'zwölf', pad: { top: 2, right: 5, bottom: 2, left: 1 } },
    })
    await bootDone()

    // '12' is 11 columns of glyph; the pad adds 6 columns and 4 rows.
    expect(w.findAll('circle')).toHaveLength(17 * 11)
    expect(w.get('svg').element.getAttribute('viewBox')).toBe(
      `0 0 ${17 * PITCH - (PITCH - 2 * RADIUS)} ${11 * PITCH - (PITCH - 2 * RADIUS)}`,
    )
    expect(fills(w).slice(0, 17).every((f) => f === DOT_OFF)).toBe(true)
  })
```

Den Import am Kopf derselben Datei um `DOT_ALARM_ON` erweitern.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/flipdot/__tests__/FlipDotBoard.spec.ts`
Expected: FAIL — `DOT_ALARM_ON` existiert nicht; die Padding-Assertion zählt 11 × 7 Kreise statt 17 × 11.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/flipdot/board.ts`, unter den bestehenden Konstanten (Import oben um `type Pad` erweitern):

```ts
/**
 * amber-500 — the reading of a play that is being timed. Only the reading changes colour; the
 * field stays as it is, so the board reads as the same instrument in a different mode rather than
 * as a warning lamp in the corner of the band.
 */
export const DOT_ALARM_ON = '#f59e0b'

export type Tone = 'default' | 'alarm'

export const TONES: Record<Tone, { on: string; off: string }> = {
  default: { on: DOT_ON, off: DOT_OFF },
  alarm: { on: DOT_ALARM_ON, off: DOT_OFF },
}

/**
 * The game band's field: two blank rows above and below so the dots meet the header's edges, one
 * column left and five right. The five are the card's own 16px gutter — not the 12px corner radius
 * they also clear — so the digits keep standing where they stand while the field runs into the
 * corner.
 */
export const HEADER_PAD: Pad = { top: 2, right: 5, bottom: 2, left: 1 }
```

In `src/ui/flipdot/FlipDotBoard.vue`:

```ts
// Props: tone and pad both default to what the board did before they existed.
const props = withDefaults(defineProps<{ text: string; label: string; tone?: Tone; pad?: Pad }>(), {
  tone: 'default',
  pad: undefined,
})

const colours = computed(() => TONES[props.tone])
const bm = computed(() => {
  const glyphs = bitmap(props.text)
  return props.pad === undefined ? glyphs : padded(glyphs, props.pad)
})
```

Jede Stelle, die heute `DOT_ON`/`DOT_OFF` direkt schreibt, liest künftig `colours.value`:

- in `releaseWaves()`: `dot.circle.setAttribute('fill', (shown.value.on[index] ?? false) ? colours.value.on : colours.value.off)`
- in `flip()`: `const from = (prev.on[i] ?? false) ? colours.value.on : colours.value.off`
- in `createDueColumns()`: `const to = (shown.value.on[dot.index] ?? false) ? colours.value.on : colours.value.off`
- im Template: `:fill="dot.on ? colours.on : colours.off"`

Und ein Watcher neben den bestehenden:

```ts
// A wave holds its dots at a colour it wrote by hand. A tone change repaints everything else and
// would leave exactly those standing in the old colour.
watch(() => props.tone, releaseWaves)
```

Imports der Komponente entsprechend: `TONES`, `type Tone` aus `./board`, `padded`, `type Pad` aus `./font`. `DOT_ON`/`DOT_OFF` werden dort nicht mehr gebraucht.

Und die offene Kante aus der Spec festnageln — an **beiden** Stellen je ein Satz, sonst findet der
Nächste sie nur mit dem Auge. In `board.ts`, an den bestehenden Doc-Kommentar von `groupCentres`:

```ts
 * Measured over the UNPADDED text, so `groupCentres` and `pad` do not compose: a padded board's
 * labels would sit shifted against its digits. Today nothing brings the two together — the one
 * padded board carries no legend, and the one board with a legend takes no pad. Whoever changes
 * that has to pass the padding in here.
```

Und in `FlipDotLegend.vue`, am Kopf des Script-Blocks:

```ts
// Positioned from `groupCentres`, which measures the unpadded text — so this legend cannot sit
// under a board that was given a `pad` without the padding reaching that function first.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/flipdot && pnpm lint && pnpm typecheck`
Expected: PASS — die drei neuen Fälle **und** jeder bestehende Board-Test (sie mounten ohne `tone`/`pad` und müssen unverändert grün sein).

- [ ] **Step 5: Commit**

```bash
git add src/ui/flipdot
git commit -m "Give the flip-dot board a tone and a padded field"
```

---

### Task 4: `elapsedClock` — die Stoppuhr rechnen

**Files:**
- Create: `src/ui/elapsedClock.ts`
- Test: `src/ui/__tests__/elapsedClock.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `elapsedClock(sinceIso: string | null | undefined, nowMs: number): string | null` und `elapsedReading(sinceIso: string | null | undefined, nowMs: number): string | null`.

- [ ] **Step 1: Write the failing test**

Neue Datei `src/ui/__tests__/elapsedClock.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { elapsedClock, elapsedReading } from '@/ui/elapsedClock'

const at = (iso: string) => Date.parse(iso)
const REVEALED = '2026-06-15T08:00:00Z'

describe('elapsedClock', () => {
  it('reads the time since the reveal as minutes and seconds', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:01:05Z'))).toBe('01:05')
  })

  it('pads both groups, so the width never changes mid-play', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:00:07Z'))).toBe('00:07')
  })

  it('truncates, so the first second reads 00:00 rather than 00:01', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T08:00:00.900Z'))).toBe('00:00')
  })

  // The skew correction can put the local clock a moment behind the server's stamp, and `-00:01`
  // would be the first thing the player ever reads off the new face.
  it('rests at zero for a clock that is behind the stamp', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T07:59:58Z'))).toBe('00:00')
  })

  // No hour group: it would read `00:` for all but a pathological play, and width is the scarce
  // dimension in the band. Past 99 minutes the group simply grows.
  it('lets the minute group grow rather than carrying into hours', () => {
    expect(elapsedClock(REVEALED, at('2026-06-15T09:45:03Z'))).toBe('105:03')
  })

  it('answers null for a stamp it cannot read, so the band shows no board at all', () => {
    expect(elapsedClock('just now', at('2026-06-15T08:00:00Z'))).toBeNull()
    expect(elapsedClock(null, at('2026-06-15T08:00:00Z'))).toBeNull()
  })
})

describe('elapsedReading', () => {
  it('spells the stopwatch out, because the dots themselves say nothing', () => {
    expect(elapsedReading(REVEALED, at('2026-06-15T08:02:05Z'))).toBe(
      'Deine Zeit: 2 Minuten, 5 Sekunden',
    )
  })

  it('uses the singular where the number calls for it', () => {
    expect(elapsedReading(REVEALED, at('2026-06-15T08:01:01Z'))).toBe(
      'Deine Zeit: 1 Minute, 1 Sekunde',
    )
  })

  it('answers null for a stamp it cannot read', () => {
    expect(elapsedReading(null, at('2026-06-15T08:00:00Z'))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/elapsedClock.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/elapsedClock"`.

- [ ] **Step 3: Write minimal implementation**

Neue Datei `src/ui/elapsedClock.ts`:

```ts
/** Minutes and seconds since the play's clock started — the one calculation both readouts share. */
interface Elapsed {
  minutes: number
  seconds: number
}

/**
 * The stopwatch half of the band, beside `remainingClock.ts`'s countdown, and built the same way:
 * a plain millisecond difference, deliberately not a Luxon calendar diff, because this is a
 * *duration*. Truncating rather than rounding is what makes the first second read 00:00.
 *
 * `null` for a stamp that cannot be read at all, which the band renders as no board rather than as
 * `NaN:NaN`.
 */
function elapsed(sinceIso: string | null | undefined, nowMs: number): Elapsed | null {
  if (sinceIso === null || sinceIso === undefined) return null
  const since = Date.parse(sinceIso)
  if (Number.isNaN(since)) return null
  // Clamped at zero: the skew correction can put the local clock a moment behind the server's
  // stamp, and a stopwatch opening on a negative reading is worse than one opening late.
  const total = Math.max(0, Math.trunc((nowMs - since) / 1000))
  return { minutes: Math.trunc(total / 60), seconds: total % 60 }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * What the band's board shows while a timed play is under way: `MM:SS`. No hour group — it would
 * read `00:` for all but a pathological play, and width is the scarce dimension in the band. The
 * minute group is allowed to grow instead.
 */
export function elapsedClock(sinceIso: string | null | undefined, nowMs: number): string | null {
  const run = elapsed(sinceIso, nowMs)
  if (run === null) return null
  return `${pad2(run.minutes)}:${pad2(run.seconds)}`
}

const UNIT_NAMES: [string, string][] = [
  ['Minute', 'Minuten'],
  ['Sekunde', 'Sekunden'],
]

/**
 * The same reading spoken, which is the board's only voice: a dot matrix carries no text, so the
 * `aria-label` on it is where the value is announced at all.
 */
export function elapsedReading(sinceIso: string | null | undefined, nowMs: number): string | null {
  const run = elapsed(sinceIso, nowMs)
  if (run === null) return null
  const parts = [run.minutes, run.seconds].map((value, i) => {
    const names = UNIT_NAMES[i]!
    return `${value} ${value === 1 ? names[0] : names[1]}`
  })
  return `Deine Zeit: ${parts.join(', ')}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/elapsedClock.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/elapsedClock.ts src/ui/__tests__/elapsedClock.spec.ts
git commit -m "Compute the play's elapsed time for the band"
```

---

### Task 5: `useStartCeremony` — 2 · 1 · GO!

**Files:**
- Create: `src/ui/useStartCeremony.ts`
- Test: `src/ui/__tests__/useStartCeremony.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `export type StartBeat = '2' | '1' | 'GO!'`
  - `export type PlayClock = { phase: 'start'; beat: StartBeat } | { phase: 'running'; since: string }`
  - `export const BEAT_MS = 1000`, `export const GO_HOLD_MS = 500`
  - `export function useStartCeremony(): { beat: Readonly<Ref<StartBeat | null>>; run: (go: () => Promise<void>) => Promise<void> }`

- [ ] **Step 1: Write the failing test**

Neue Datei `src/ui/__tests__/useStartCeremony.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { BEAT_MS, GO_HOLD_MS, useStartCeremony } from '@/ui/useStartCeremony'

/** The composable registers `onUnmounted`, so it needs a component to live in. */
function mountCeremony() {
  let api!: ReturnType<typeof useStartCeremony>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useStartCeremony()
        return () => null
      },
    }),
  )
  return { api, wrapper }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useStartCeremony', () => {
  it('counts 2 · 1 · GO! at one beat a second', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.resolve())
    expect(api.beat.value).toBe('2')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('1')

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('GO!')

    await vi.advanceTimersByTimeAsync(GO_HOLD_MS)
    await running
    expect(api.beat.value).toBeNull()
  })

  // The server stamps the play's start when it handles this request, so the beat the player is
  // told to go on has to be the beat the request leaves on — not the one after it.
  it('fires the reveal on the GO beat, not after it', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(go).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(BEAT_MS)
    expect(api.beat.value).toBe('GO!')
    expect(go).toHaveBeenCalledTimes(1)
  })

  it('holds GO! long enough to be read, even when the reveal answers at once', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.resolve())
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS)
    await vi.advanceTimersByTimeAsync(GO_HOLD_MS - 1)
    expect(api.beat.value).toBe('GO!')

    await vi.advanceTimersByTimeAsync(1)
    await running
    expect(api.beat.value).toBeNull()
  })

  it('falls back to the countdown when the reveal throws', async () => {
    const { api } = mountCeremony()

    const running = api.run(() => Promise.reject(new Error('boom'))).catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(await running).toBe('boom')
    expect(api.beat.value).toBeNull()
  })

  it('ignores a second press while the beats are running', async () => {
    const { api } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    await api.run(go)
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(go).toHaveBeenCalledTimes(1)
  })

  // A ceremony whose page is gone must not still spend the player's one attempt.
  it('never reveals after its component has been unmounted', async () => {
    const { api, wrapper } = mountCeremony()
    const go = vi.fn(() => Promise.resolve())

    void api.run(go)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)

    expect(go).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/useStartCeremony.spec.ts`
Expected: FAIL — `Failed to resolve import "@/ui/useStartCeremony"`.

- [ ] **Step 3: Write minimal implementation**

Neue Datei `src/ui/useStartCeremony.ts`:

```ts
import { onUnmounted, readonly, ref, type Ref } from 'vue'

/** One beat of the start signal, as the band's board spells it. */
export type StartBeat = '2' | '1' | 'GO!'

/**
 * What the band's board shows instead of the round countdown. `null` — the countdown itself — is
 * every other caller's case, which is why the prop carrying this defaults to it everywhere.
 */
export type PlayClock =
  | { phase: 'start'; beat: StartBeat }
  /** The instant the play's clock started: `me.revealedAt` in a real round. */
  | { phase: 'running'; since: string }

const BEATS: StartBeat[] = ['2', '1', 'GO!']

export const BEAT_MS = 1000

/**
 * How long `GO!` stays up at the least. Without a floor the one beat that has to be read flashes
 * for the length of a fast round trip and is gone inside the relight behind it.
 */
export const GO_HOLD_MS = 500

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The 2 · 1 · GO! in front of a timed round, and the thing it is a signal for.
 *
 * [go] fires ON the GO beat, never after it: the server stamps the play's start when it handles
 * that request, so this ordering is the whole reason the ceremony sits in front of the request
 * rather than beside it — it is what makes the displayed zero the scored zero.
 */
export function useStartCeremony(): {
  beat: Readonly<Ref<StartBeat | null>>
  run: (go: () => Promise<void>) => Promise<void>
} {
  const beat = ref<StartBeat | null>(null)
  // Final, per the composable rule for anything ticking outside Vue: a timer that has already
  // been handed to the browser still resumes, and what it would start belongs to nobody.
  let disposed = false

  async function run(go: () => Promise<void>): Promise<void> {
    if (disposed || beat.value !== null) return
    try {
      for (const next of BEATS) {
        if (disposed) return
        beat.value = next
        if (next !== 'GO!') {
          await wait(BEAT_MS)
          continue
        }
        // The hold runs beside the request, not after it: the clock starts on the beat, and the
        // beat stays legible while it does.
        await Promise.all([go(), wait(GO_HOLD_MS)])
      }
    } finally {
      beat.value = null
    }
  }

  onUnmounted(() => {
    disposed = true
  })

  return { beat: readonly(beat), run }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/useStartCeremony.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/useStartCeremony.ts src/ui/__tests__/useStartCeremony.spec.ts
git commit -m "Count a timed round in before it starts"
```

---

### Task 6: Das Band — drei Gesichter, bündiges Board

**Files:**
- Modify: `src/ui/GameHeader.vue`
- Test: `src/ui/__tests__/GameHeader.spec.ts`

**Interfaces:**
- Consumes: `PlayClock` (Task 5), `elapsedClock`/`elapsedReading` (Task 4), `HEADER_PAD`/`Tone` (Task 3), `remainingClock`/`remainingReading`/`useSharedNow` (bestehend).
- Produces: `GameHeader`-Props `{ roundNumber, title, endsAt, play?: PlayClock | null }`.

- [ ] **Step 1: Write the failing test**

An `src/ui/__tests__/GameHeader.spec.ts` anhängen (im bestehenden `describe`):

```ts
  // Every beat is padded to the width of `GO!`, so the ceremony flips from beat to beat instead
  // of relighting three times.
  it('shows the start signal on the beat the page is playing', () => {
    const w = mountHeader({ play: { phase: 'start', beat: '2' } })

    expect(clockOf(w).text).toBe('  2')
    expect(clockOf(w).label).toBe('Start in 2 Sekunden')
    expect(clockOf(w).tone).toBe('alarm')
  })

  it('says GO! at the same width as the digits before it', () => {
    const w = mountHeader({ play: { phase: 'start', beat: 'GO!' } })

    expect(clockOf(w).text).toBe('GO!')
    expect(clockOf(w).label).toBe('Los')
  })

  it('shows the play own clock once it is running, in the timed tone', () => {
    const w = mountHeader({ play: { phase: 'running', since: '2026-06-15T06:44:22Z' } })

    expect(clockOf(w).text).toBe('01:05')
    expect(clockOf(w).label).toBe('Deine Zeit: 1 Minute, 5 Sekunden')
    expect(clockOf(w).tone).toBe('alarm')
  })

  it('counts the play up with the shared clock', async () => {
    const w = mountHeader({ play: { phase: 'running', since: '2026-06-15T06:44:22Z' } })

    vi.advanceTimersByTime(2000)
    await nextTick()

    expect(clockOf(w).text).toBe('01:07')
  })

  it('is the round countdown in the plain tone when no play is running', () => {
    expect(clockOf(mountHeader()).text).toBe('02:14:33')
    expect(clockOf(mountHeader()).tone).toBe('default')
  })

  // The dark dots sit close enough to the band's own colour that a field stopping short of the
  // edges reads as a badly cut sticker. It runs into the corner instead, and the blank columns on
  // its right are what keep the last digit clear of the card's radius.
  it('pads the board so it fills the band and runs into its corner', () => {
    const w = mountHeader()

    expect(clockOf(w).pad).toEqual(HEADER_PAD)
    expect(w.getComponent(FlipDotBoard).classes()).toContain('h-full')
    expect(w.get('[data-test="game-header"]').classes()).toContain('pl-4')
    expect(w.get('[data-test="game-header"]').classes()).not.toContain('pr-4')
  })

  it('keeps a gutter on the right where there is no board to fill it', () => {
    const w = mountHeader({ endsAt: null })

    expect(w.get('[data-test="game-header"]').classes()).toContain('pr-4')
  })
```

Die Importzeile der Spec um `HEADER_PAD` erweitern:

```ts
import { HEADER_PAD } from '@/ui/flipdot/board'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/ui/__tests__/GameHeader.spec.ts`
Expected: FAIL — `play` ist keine bekannte Prop, `clockOf(w).tone`/`.pad` sind `undefined`, und der Header trägt noch `px-4`.

- [ ] **Step 3: Write minimal implementation**

`src/ui/GameHeader.vue`, Script:

```ts
import { computed } from 'vue'
import FlipDotBoard from '@/ui/flipdot/FlipDotBoard.vue'
import { HEADER_PAD, type Tone } from '@/ui/flipdot/board'
import { elapsedClock, elapsedReading } from '@/ui/elapsedClock'
import { remainingClock, remainingReading } from '@/ui/remainingClock'
import type { PlayClock } from '@/ui/useStartCeremony'
import { useSharedNow } from '@/ui/sharedClock'

const props = withDefaults(
  defineProps<{
    /** Signed, and shown signed: round 3 and round -3 are different rounds. */
    roundNumber: number | null
    title: string | null
    /** ISO instant the round closes at. `null` where there is no such thing — then no board. */
    endsAt: string | null
    /**
     * The timed play's own face, while there is one. `null` — the round countdown — is what every
     * caller without a play of its own passes, which is all of them but two.
     */
    play?: PlayClock | null
  }>(),
  { play: null },
)

const now = useSharedNow()

/**
 * What the board reads, says and wears — derived in one place, so the three faces cannot disagree
 * about which of them is showing.
 */
const face = computed<{ text: string; label: string; tone: Tone } | null>(() => {
  const play = props.play

  if (play?.phase === 'start') {
    // Padded to the width of `GO!`: same geometry, so the beats flip into one another instead of
    // relighting the board three times in three seconds.
    return play.beat === 'GO!'
      ? { text: 'GO!', label: 'Los', tone: 'alarm' }
      : { text: `  ${play.beat}`, label: `Start in ${play.beat} Sekunden`, tone: 'alarm' }
  }

  const [text, label] =
    play?.phase === 'running'
      ? [elapsedClock(play.since, now.value), elapsedReading(play.since, now.value)]
      : [remainingClock(props.endsAt, now.value), remainingReading(props.endsAt, now.value)]

  if (text === null || label === null) return null
  return { text, label, tone: play?.phase === 'running' ? 'alarm' : 'default' }
})
```

Template:

```html
<template>
  <!-- No gutter on the right while a board is up: the dot field is what meets the card's edge, and
       the blank columns inside it are the gutter. Without a board there is nothing to meet it, so
       the band pays for its own. -->
  <div
    data-test="game-header"
    class="flex h-9 items-center gap-2 bg-stone-700 pl-4 text-stone-50"
    :class="{ 'pr-4': face === null }"
  >
    <span
      v-if="roundNumber !== null"
      data-test="game-header-round"
      class="shrink-0 text-sm tabular-nums text-stone-400"
    >
      <!-- Visible: the bare number. Spoken: what it is a number of — the band is the only place
           the round is named. The colon is decoration and stays out of the reading. -->
      <span class="sr-only">Runde </span>{{ roundNumber }}<span aria-hidden="true">:</span>
    </span>
    <h1 data-test="game-header-title" class="min-w-0 flex-1 truncate text-sm font-semibold">
      {{ title }}
    </h1>
    <!-- `shrink-0`, so a long game name loses characters before the clock loses digits: the name
         is still readable truncated, a truncated readout is a wrong time. Height-driven like the
         app header's board — the viewBox ratio supplies the width. Self-describing here (nothing
         wraps it), so its own aria-label is the announcement. -->
    <FlipDotBoard
      v-if="face !== null"
      data-test="game-header-clock"
      class="h-full w-auto shrink-0"
      :text="face.text"
      :label="face.label"
      :tone="face.tone"
      :pad="HEADER_PAD"
    />
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/ui/__tests__/GameHeader.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS — die sieben neuen Fälle und alle bestehenden (die ohne `play` mounten).

- [ ] **Step 5: Commit**

```bash
git add src/ui/GameHeader.vue src/ui/__tests__/GameHeader.spec.ts
git commit -m "Let the band show the play's own clock"
```

---

### Task 7: Die Karte reicht den Beat durch

**Files:**
- Modify: `src/rounds/RoundCard.vue`
- Test: `src/rounds/__tests__/RoundCard.spec.ts`

**Interfaces:**
- Consumes: `StartBeat`, `PlayClock` (Task 5); `GameHeader`-Prop `play` (Task 6).
- Produces: `RoundCard`-Prop `beat?: StartBeat | null` (Default `null`).

- [ ] **Step 1: Write the failing test**

An `src/rounds/__tests__/RoundCard.spec.ts` anhängen:

```ts
  const playOf = (w: VueWrapper) => w.getComponent(GameHeader).props('play')

  it('runs the band clock up from the reveal while a timed play is open', () => {
    const w = mountCard({ round: aRound({ me: aPlay({ revealedAt: '2026-08-14T11:00:00Z' }) }) })

    expect(playOf(w)).toEqual({ phase: 'running', since: '2026-08-14T11:00:00Z' })
  })

  it('hands the band back to the round countdown once the tip is in', () => {
    const w = mountCard({
      round: aRound({ me: aPlay({ guessedAt: '2026-08-14T11:02:00Z' }) }),
    })

    expect(playOf(w)).toBeNull()
  })

  // Phase one has no clock in the result, so there is none to show.
  it('leaves the band alone for a game that is not played against the clock', () => {
    const w = mountCard({
      round: aRound({
        game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: false },
        me: aPlay(),
      }),
    })

    expect(playOf(w)).toBeNull()
  })

  // The history is full of rows nobody ever guessed on. A clock there would run forever.
  it('never starts a clock on a closed round', () => {
    const w = mountCard({ round: aRound({ me: aPlay() }), closed: true })

    expect(playOf(w)).toBeNull()
  })

  it('shows the start signal the page is playing, ahead of everything else', () => {
    const w = mountCard({ round: aRound({ me: null }), beat: '1' })

    expect(playOf(w)).toEqual({ phase: 'start', beat: '1' })
  })
```

`VueWrapper` und `GameHeader` sind in dieser Spec bereits importiert; `aPlay`/`aRound`/`mountCard`
existieren dort schon. `mountCard` nimmt seine Props über einen expliziten Parametertyp entgegen —
dort eine Zeile ergänzen, sonst tippt der letzte Fall nicht:

```ts
  beat?: StartBeat | null
```

plus `import type { StartBeat } from '@/ui/useStartCeremony'` am Kopf der Spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/rounds/__tests__/RoundCard.spec.ts`
Expected: FAIL — `play` ist auf `GameHeader` noch nicht gesetzt (`undefined` statt des Objekts), `beat` ist keine bekannte Prop.

- [ ] **Step 3: Write minimal implementation**

In `src/rounds/RoundCard.vue` zur Props-Liste (neben `closed`, mit Default `null` im `withDefaults`-Block):

```ts
    /**
     * The start signal, while the page that owns the reveal is playing it. Only the beat comes
     * from outside — the running clock is derived below, because the card already holds the round
     * that answers it and a caller deriving it would be one more place for the rule to live.
     */
    beat?: StartBeat | null
```

Import: `import type { PlayClock, StartBeat } from '@/ui/useStartCeremony'`.

Neben den bestehenden `computed`s:

```ts
/**
 * What the band's board shows. The signal wins while it is playing; after it, a timed play that
 * has not been answered yet. `closed` has to be asked separately from `guessedAt`: the history is
 * full of rows nobody ever guessed on, and without it their clock would run forever.
 */
const play = computed<PlayClock | null>(() => {
  if (props.beat != null) return { phase: 'start', beat: props.beat }

  const me = props.round?.me
  if (props.closed || me == null || me.guessedAt !== null) return null
  return props.round?.game?.requiresReveal === true
    ? { phase: 'running', since: me.revealedAt }
    : null
})
```

Im Template an `GameHeader`: `:play="play"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/rounds && pnpm lint && pnpm typecheck`
Expected: PASS — die fünf neuen Fälle, alle bestehenden `RoundCard`-Fälle und `RoundHistory` (das ohne `beat` mountet und `closed` setzt).

- [ ] **Step 5: Commit**

```bash
git add src/rounds/RoundCard.vue src/rounds/__tests__/RoundCard.spec.ts
git commit -m "Derive the band's play clock from the round"
```

---

### Task 8: Die Community-Seite besitzt die Zeremonie

**Files:**
- Modify: `src/pages/c/[slug]/index.vue`
- Test: `src/pages/c/[slug]/__tests__/index.spec.ts`

**Interfaces:**
- Consumes: `useStartCeremony`, `BEAT_MS`, `GO_HOLD_MS` (Task 5); `RoundCard`-Prop `beat` (Task 7).
- Produces: nichts nach außen.

- [ ] **Step 1: Write the failing test**

An `src/pages/c/[slug]/__tests__/index.spec.ts` anhängen, innerhalb von `describe('community home', …)`.
Die Datei bringt alles Nötige schon mit: `mountPage()`, `mockUseRound()`, `aRoundResponse()`, den
gemockten `useRound`, `RoundCard`, `flushPromises` und ein unbedingtes `afterEach(() =>
vi.useRealTimers())`. Die Importzeile um die zwei Konstanten erweitern:

```ts
import { BEAT_MS, GO_HOLD_MS } from '@/ui/useStartCeremony'
```

```ts
  /** A round waiting behind „Aufdecken“ — the only state on this page that can open a timed round. */
  function sealedPage() {
    vi.spyOn(api, 'getRoster').mockResolvedValue([])
    const hook = mockUseRound({
      stage: 'sealed',
      round: aRoundResponse({
        game: { id: 'guess-hue', displayName: 'Farbausmalung', requiresReveal: true },
      }),
    })
    vi.mocked(useRound).mockReturnValue(hook)
    return hook
  }

  // The server stamps the play's start when it handles the reveal, so the request must not leave
  // before the player has been told to go.
  it('counts the player in before it reveals', async () => {
    const hook = sealedPage()
    const w = mountPage()
    await flushPromises()
    vi.useFakeTimers()

    await w.get('[data-test="round-reveal"]').trigger('click')
    expect(w.getComponent(RoundCard).props('beat')).toBe('2')
    expect(hook.reveal).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2 * BEAT_MS)
    await nextTick()
    expect(w.getComponent(RoundCard).props('beat')).toBe('GO!')
    expect(hook.reveal).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(GO_HOLD_MS)
    await nextTick()
    expect(w.getComponent(RoundCard).props('beat')).toBeNull()
  })

  it('holds the reveal button shut while the signal runs', async () => {
    sealedPage()
    const w = mountPage()
    await flushPromises()
    vi.useFakeTimers()

    await w.get('[data-test="round-reveal"]').trigger('click')
    expect(w.getComponent(RoundCard).props('busy')).toBe(true)

    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)
    await nextTick()
    expect(w.getComponent(RoundCard).props('busy')).toBe(false)
  })
```

`nextTick` aus `vue` importieren, falls die Datei es noch nicht tut.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run "src/pages/c/[slug]/__tests__/index.spec.ts"`
Expected: FAIL — `beat` ist keine gesetzte Prop (`undefined` statt `'2'`), und `reveal` wird sofort beim Klick aufgerufen statt erst zwei Sekunden später.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/c/[slug]/index.vue`, Script:

```ts
import { useStartCeremony } from '@/ui/useStartCeremony'

// Destructured on purpose: only a top-level binding is unwrapped in the template, so
// `ceremony.beat` would reach `RoundCard` as the ref object rather than as the beat.
const { beat: startBeat, run: runCeremony } = useStartCeremony()

/**
 * The reveal the card gets: the 2 · 1 · GO! first, and the request on the GO beat itself. Owned
 * here rather than in the card for the same reason `useRound` is — the card holds no state, and
 * the sealed face is the only thing on this page that can open a timed round.
 */
const revealWithSignal = (): Promise<void> => runCeremony(reveal)
```

Am `<RoundCard>` — `:reveal="reveal"` wird **ersetzt**, nicht ergänzt:

```html
    :busy="busy || startBeat !== null"
    :reveal="revealWithSignal"
    :beat="startBeat"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run "src/pages/c/[slug]" && pnpm lint && pnpm typecheck`
Expected: PASS — die zwei neuen Fälle und alle bestehenden Seitenfälle (keiner von ihnen klickt heute „Aufdecken“, also bricht keiner an der Zeremonie).

- [ ] **Step 5: Commit**

```bash
git add "src/pages/c/[slug]/index.vue" "src/pages/c/[slug]/__tests__/index.spec.ts"
git commit -m "Count the player in before the round opens"
```

---

### Task 9: Das Labor spiegelt die Uhr

**Files:**
- Modify: `src/pages/c/[slug]/lab/[game]/index.vue`
- Test: `src/gamelab/__tests__/lab-page.spec.ts:995-1050` (drei bestehende Klicks) und neue Fälle

**Interfaces:**
- Consumes: `useStartCeremony`, `PlayClock`, `BEAT_MS`, `GO_HOLD_MS` (Task 5); `GameHeader`-Prop `play` (Task 6).
- Produces: nichts nach außen.

- [ ] **Step 1: Repair the three existing reveal clicks**

Die Zeremonie sitzt ab jetzt zwischen Klick und Request, und drei bestehende Fälle klicken auf
`lab-reveal` und erwarten die Antwort nach einem blanken `flushPromises()`. Sie messen etwas
anderes (dass das Spiel nach dem Reveal mountet; dass der Reset nicht in einer Sackgasse endet)
und behalten ihre Aussage — sie müssen nur die Sekunden aussitzen. Einen Helfer neben `tool()`
anlegen:

```ts
/**
 * Click „Aufdecken“ and sit out the 2 · 1 · GO! the page plays in front of the request. Fake
 * timers only for the beats, real ones again before `flushPromises` — that helper waits on a real
 * timer of its own and never resolves on a frozen clock.
 */
async function revealThroughSignal(w: VueWrapper): Promise<void> {
  vi.useFakeTimers()
  await w.get('[data-test="lab-reveal"]').trigger('click')
  await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)
  vi.useRealTimers()
  await flushPromises()
}
```

Dann in beiden Fällen („reveals the round on click…“ und „puts the tester back in front of the
gate after a reset…“) jedes

```ts
    await w.get('[data-test="lab-reveal"]').trigger('click')
    await flushPromises()
```

durch `await revealThroughSignal(w)` ersetzen — dreimal insgesamt, die zweite Aufdeckung im
Reset-Fall eingeschlossen (dort steht der Klick auf der lokalen Konstante `button`; auch dieser
Block wird durch den Helfer ersetzt, die Assertion auf `button.attributes('disabled')` davor
bleibt stehen).

Die Importzeile um die zwei Konstanten erweitern:

```ts
import { BEAT_MS, GO_HOLD_MS } from '@/ui/useStartCeremony'
```

- [ ] **Step 2: Write the failing test**

An `src/gamelab/__tests__/lab-page.spec.ts` anhängen, im bestehenden `describe('lab page', …)`:

```ts
  it('counts the tester in and then runs their own clock', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)

    const w = await mountPage()
    vi.useFakeTimers()

    await w.get('[data-test="lab-reveal"]').trigger('click')
    expect(w.getComponent(GameHeader).props('play')).toEqual({ phase: 'start', beat: '2' })

    await vi.advanceTimersByTimeAsync(2 * BEAT_MS + GO_HOLD_MS)
    await nextTick()
    vi.useRealTimers()

    expect(w.getComponent(GameHeader).props('play')).toMatchObject({ phase: 'running' })
  })

  // Reset, „Meinen Guess löschen“ and a new seed all come back `revealed: false` for a gated game
  // — the server clears its own `openedAt` on every one of them — so one check retires the stamp
  // on all of them.
  it('retires the tester clock when the round is opened again', async () => {
    vi.spyOn(api, 'openLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)
    vi.spyOn(api, 'revealLabRound').mockResolvedValue({ ...round, revealed: true } as never)
    vi.spyOn(api, 'resetLabRound').mockResolvedValue({
      ...round,
      revealed: false,
      payload: null,
    } as never)

    const w = await mountPage()
    await revealThroughSignal(w)
    expect(w.getComponent(GameHeader).props('play')).toMatchObject({ phase: 'running' })

    await tool('lab-reset').trigger('click')
    await flushPromises()

    expect(w.getComponent(GameHeader).props('play')).toBeNull()
  })
```

`nextTick` aus `vue` importieren, falls die Datei es noch nicht tut. `round` ist die Fixture, die
die Datei bereits am Kopf hält; `GameHeader` ist dort schon importiert.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/gamelab/__tests__/lab-page.spec.ts`
Expected: FAIL — `play` ist auf `GameHeader` nicht gesetzt (`undefined`). Die drei reparierten
Fälle aus Step 1 sind bereits jetzt rot, weil `revealWithSignal` noch nicht existiert und der
Klick den Request sofort auslöst — sie werden mit Step 4 grün.

- [ ] **Step 4: Write minimal implementation**

In `src/pages/c/[slug]/lab/[game]/index.vue`, Script:

```ts
import { useStartCeremony, type PlayClock } from '@/ui/useStartCeremony'

/**
 * When this tester's clock started. The lab has no server stamp on the wire and needs none —
 * nothing is scored here, the clock is there to be looked at. It doubles as the flag: the lab's
 * `me` stays null until a guess lands, so „stamped and still no me“ is exactly the play.
 */
const playStartedAt = ref<string | null>(null)

const { beat: startBeat, run: runCeremony } = useStartCeremony()

const labPlay = computed<PlayClock | null>(() => {
  if (startBeat.value !== null) return { phase: 'start', beat: startBeat.value }
  const since = playStartedAt.value
  return since !== null && round.value?.me == null ? { phase: 'running', since } : null
})
```

In `run()`, direkt hinter `round.value = await action(...)`:

```ts
    // Every path that reopens a round — reset, „forget mine“, a new seed — comes back
    // `revealed: false` for a gated game, because the server clears its own `openedAt` on all of
    // them. So this one line retires the stamp on all of them too.
    if (!round.value.revealed) playStartedAt.value = null
```

`reveal()` stempelt, und die Zeremonie verpackt es:

```ts
/** The lab's own „Aufdecken“ — starts the tester's clock, mirroring the real round's reveal. */
async function reveal(): Promise<void> {
  await run(revealLabRound)
  if (round.value?.revealed === true) playStartedAt.value = new Date().toISOString()
}

const revealWithSignal = (): Promise<void> => runCeremony(reveal)
```

Im Template: am `<GameHeader>` `:play="labPlay"` ergänzen; am Aufdecken-Knopf `@click="reveal"`
durch `@click="revealWithSignal"` ersetzen und `:disabled="busy"` durch
`:disabled="busy || startBeat !== null"`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/gamelab && pnpm lint && pnpm typecheck`
Expected: PASS — die zwei neuen Fälle, die drei reparierten und alle übrigen Laborfälle.

- [ ] **Step 6: Commit**

```bash
git add "src/pages/c/[slug]/lab/[game]/index.vue" src/gamelab/__tests__/lab-page.spec.ts
git commit -m "Mirror the play clock in the lab"
```

---

### Task 10: Ganze Suite, und ein Blick auf das Ding

**Files:**
- Modify: keine (nur, falls etwas rot ist)

**Interfaces:**
- Consumes: alles davor. Produces: nichts.

- [ ] **Step 1: Run the whole frontend gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: alles grün. `pnpm typecheck` schließt die Specs mit ein — bricht es dort, hat eine Fixture eine Wire-Form verfehlt, nicht der Produktivcode.

- [ ] **Step 2: Confirm the specs are still in the type program**

Run: `npx vue-tsc -b --listFiles | grep -c __tests__`
Expected: **82** — 79 vor diesem Plan, plus `font.spec.ts`, `elapsedClock.spec.ts` und `useStartCeremony.spec.ts`. **Eine 0 heißt, die Specs sind aus dem Programm gefallen** — dann ist `tsconfig.vitest.json` beschädigt, nicht der Test.

- [ ] **Step 3: Look at it, knowingly**

Der Dev-Server bedient den Haupt-Checkout, nicht diesen Worktree: `pnpm dev` von hier aus zeigt fremden Code. Wer hinsehen will, checkt den Branch im Haupt-Checkout aus und öffnet eine Runde eines getimten Spiels (Musterung oder Weltanschauung in Phase zwei) oder — billiger — das Labor unter `/c/{slug}/lab/{game}` mit `phase=TWO`.

Worauf zu achten ist, und was der Test nicht sehen kann:
1. Das Punktfeld schließt oben, unten und rechts bündig mit dem Band ab; die letzte Ziffer bleibt frei von der Rundung der Karte.
2. Nach dem Tap: ein bernsteinfarbenes Aufblitzen, dann `2`, `1`, `GO!` im Sekundentakt, dann das Brett.
3. Die Uhr zählt in Bernstein hoch und wird nach dem Tipp wieder weiß und zum Rundencountdown.
4. Auf einem 360px-Viewport: der Spielname kürzt sich, die Uhr verliert keine Ziffer.

- [ ] **Step 4: Commit (nur falls Step 1–3 etwas gefunden haben)**

```bash
git add -A
git commit -m "Fix <what the gate found>"
```
