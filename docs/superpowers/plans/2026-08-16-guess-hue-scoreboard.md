# Guess Hue — das Scoreboard: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unter dem Lese-Rad steht die Detailtabelle aller abgegebenen Tipps — Zeile in der Spielerfarbe, Tipp-Zelle in der Tippfarbe, nach Abstand zur Lösung sortiert —, die sich zeilen- und spaltenweise einschreibt und dabei die Marker auf dem Rad mitzieht.

**Architecture:** Reine Arithmetik neben den Komponenten, weil happy-dom kein Layout rechnet: `scoreboard.ts` baut und sortiert die Zeilen, `reveal.ts` hält die Takte und rechnet jede Verzögerung aus. `GuessHueGame` ist weiterhin die einzige Stelle, die `unknown` in Zahlen verwandelt — sie baut Zeilen *und* Marker und verteilt einen Fahrplan, den beide nur noch ablesen. Es gibt damit genau eine Zeitrechnung. Das Backend wird nicht angefasst.

**Tech Stack:** Vue 3 / TypeScript strict / Tailwind v4 / Vitest + @vue/test-utils + happy-dom

**Spec:** [`docs/superpowers/specs/2026-08-16-guess-hue-scoreboard-design.md`](../specs/2026-08-16-guess-hue-scoreboard-design.md)

## Global Constraints

- **Quellcode ist Englisch** — Kommentare, TSDoc, Bezeichner, Testnamen. Nutzertexte in der UI sind **Deutsch** und verwenden `„…“`, nie `"`. Commit-Messages sind Englisch. Siehe `.claude/guidelines/README.md#language`.
- **Commit-Messages enden mit** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Niemals `git commit --amend`** — immer ein neuer Commit.
- **Kein Backend-Code.** `OtherPlayDto`/`MyPlayDto` tragen `username`, `outcome` und `points` bereits, `RoundResponse` trägt `awardRule`. Nichts in `core/` wird geändert.
- **Die Abweichung wird im Client nie nachgerechnet.** Sie kommt als `outcome.deviationDeg` vom Server; `circularDistance` bleibt dem Rad vorbehalten.
- **Keine neue npm-Dependency.** `Intl.NumberFormat` ist eingebaut.
- **Der Klartext des Guess-Hue-Datensets erscheint nirgends im Repository.** Testdaten sind frei erfunden (`hue = 210`, `„Testbeschreibung einer Farbe."`). Siehe `.claude/guidelines/game-content.md`.
- **TypeScript läuft mit `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`.** Indexzugriffe liefern `| undefined`; nullbare Props sind durchgängig `T | null`, nie `T?`.
- **Tailwind v4, mobile-first.** Keine `dark:`-Klassen — die App hat keine einzige. Kein `<style>`-Block.
- **Animationen:** Das einmal gefragte `still` prüft **vier** Dinge — `animate`, `prefersReducedMotion()`, `inBackground()`, `typeof requestAnimationFrame !== 'function'`. CSS-Übergänge tragen zusätzlich `motion-reduce:animate-none`, wo sie pulsieren.
- **Es bewegt sich nach der Karten-Überblendung nichts mehr im Layout.** Die Tabelle nimmt ihren Platz sofort vollständig ein; sichtbar wird nur Tinte (`opacity`). Kein `grid-rows-[0fr]`-Wachsen, kein `height`-Übergang.
- **happy-dom rechnet kein Layout und kein CSS.** Ein Spec prüft nur den strukturellen Stellvertreter — Klassennamen, `style`-Attribute, DOM-Struktur. Lesbarkeit, Ellipsis und Flüssigkeit sind Browsermessungen (Task 8).

### Befehle

```bash
# eine Spec-Datei
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/scoreboard.spec.ts

# alles
cd webapp-vue && pnpm test

# Typen und Lint (vor jedem Commit, der mehr als einen Test anfasst)
cd webapp-vue && pnpm typecheck && pnpm lint
```

## File Structure

| Datei | Verantwortung | Status |
| --- | --- | --- |
| `webapp-vue/src/assets/main.css` | `--color-live` im `@theme`-Block | Änderung |
| `webapp-vue/src/members/MemberRow.vue` | nutzt `bg-live` statt `bg-rose-600` | Änderung |
| `webapp-vue/src/games/guesshue/color.ts` | `hslToHex` — von Rad **und** Tabelle gebraucht | neu (Umzug) |
| `webapp-vue/src/games/guesshue/types.ts` | zusätzlich `hueOf` — die eine Stelle, die einen Guess-Hue-Tipp verengt | Änderung |
| `webapp-vue/src/games/GameEntry.ts` | drei Felder mehr, plus die Grenze im TSDoc | Änderung |
| `webapp-vue/src/games/guesshue/scoreboard.ts` | rein: Zeilen bauen, sortieren, „vorläufig" entscheiden | neu |
| `webapp-vue/src/games/guesshue/reveal.ts` | die Takte und alle Verzögerungen; Umbenennungen | Änderung |
| `webapp-vue/src/games/guesshue/GuessHueScoreboard.vue` | die Tabelle, sonst nichts | neu |
| `webapp-vue/src/games/guesshue/HueWheelReveal.vue` | liest `revealDelayMs` vom Marker ab | Änderung |
| `webapp-vue/src/games/guesshue/GuessHueReveal.vue` | die Tabelle unter dem Rad | Änderung |
| `webapp-vue/src/games/guesshue/GuessHueGame.vue` | baut Zeilen und Marker, verteilt den Fahrplan | Änderung |
| `webapp-vue/src/rounds/RoundCard.vue`, `webapp-vue/src/pages/c/[slug]/lab/[game].vue` | reichen `award-rule` durch | Änderung |

**Es gibt keine `GuessHueReveal.spec.ts`** — die Auswertungskarte ist heute über `GuessHueGame.spec.ts` abgedeckt, und das bleibt so. Der Spec nennt sie in seiner Testliste; das ist dort ein Fehler, den Task 8 korrigiert.

---

### Task 1: „Vorläufig" bekommt eine Farbe

**Files:**
- Modify: `webapp-vue/src/assets/main.css`
- Modify: `webapp-vue/src/members/MemberRow.vue:95`
- Test: `webapp-vue/src/members/__tests__/MemberRow.spec.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: die Tailwind-Utilities `bg-live` / `text-live` / `ring-live`, gespeist aus `--color-live`. Task 6 nutzt `bg-live` für das `live`-Chip.

- [ ] **Step 1: Write the failing test**

In `webapp-vue/src/members/__tests__/MemberRow.spec.ts`, direkt hinter dem bestehenden Test, der `animate-pulse` prüft:

```ts
  it('paints a provisional chip in the shared live colour, not a local one', () => {
    // One meaning, one colour: the scoreboard's live chip uses the same token. A raw `bg-rose-600`
    // here is how the two would drift the first time either is touched.
    const provisional = mountRow([
      aMember({ points: { stable: 3, live: { points: 2, provisional: true } } }),
    ])

    expect(provisional.get('[data-test="live-points"]').classes()).toContain('bg-live')
  })
```

Die Helfer `mountRow` und `aMember` stehen bereits in der Datei; falls sie dort anders heißen, die
Namen aus dem bestehenden `animate-pulse`-Test übernehmen.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/members/__tests__/MemberRow.spec.ts
```

Erwartet: FAIL — die Klassenliste enthält `bg-rose-600`, nicht `bg-live`.

- [ ] **Step 3: Add the token**

In `webapp-vue/src/assets/main.css`, **innerhalb** des bestehenden `@theme`-Blocks, oberhalb von `--animate-nav-shuttle`:

```css
  /* „Vorläufig": a score that can still be overtaken. Rose plus a pulse says that in the member
     row and in the scoreboard, and one meaning must not have two colours. Aliased onto rose-600;
     if Tailwind ever tree-shakes the referenced variable away, inline the literal
     `oklch(58.6% 0.253 17.585)` here and keep the name in this comment. */
  --color-live: var(--color-rose-600);
```

- [ ] **Step 4: Use it in the member row**

In `webapp-vue/src/members/MemberRow.vue`, in `liveChipClass`:

```ts
  return live.provisional
    ? 'animate-pulse bg-live text-white ring-yellow-400 motion-reduce:animate-none'
    : 'bg-neutral-900 text-white ring-white'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd webapp-vue && pnpm exec vitest run src/members/__tests__/MemberRow.spec.ts
```

Erwartet: PASS, alle Tests der Datei.

- [ ] **Step 6: Verify the token survives the build**

```bash
cd webapp-vue && pnpm build && grep -o "color-live:[^;]*" dist/assets/*.css
```

Erwartet: eine Ausgabe wie `color-live:var(--color-rose-600)` **und** ein `--color-rose-600:` irgendwo in derselben Datei (`grep -c "color-rose-600" dist/assets/*.css` ≥ 2). Findet sich `--color-rose-600` **nicht** in der gebauten CSS, hat Tailwind die referenzierte Variable wegoptimiert: dann in `main.css` `var(--color-rose-600)` durch `oklch(58.6% 0.253 17.585)` ersetzen, den Kommentar entsprechend kürzen und diesen Schritt wiederholen.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/assets/main.css webapp-vue/src/members/MemberRow.vue webapp-vue/src/members/__tests__/MemberRow.spec.ts
git commit -m "$(cat <<'EOF'
feat(ui): give "provisional" one colour under one name

The member row's provisional chip hard-coded `bg-rose-600`. The scoreboard's live
chip needs the same rose for the same meaning, and two literals are how one meaning
ends up with two colours. `--color-live` in the theme block gives it a name -- the
name the origin app used, too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `hslToHex` zieht neben das Rad

**Files:**
- Create: `webapp-vue/src/games/guesshue/color.ts`
- Modify: `webapp-vue/src/games/guesshue/reveal.ts` (die private Funktion entfernen, importieren)
- Test: `webapp-vue/src/games/guesshue/__tests__/color.spec.ts`

**Interfaces:**
- Consumes: `wrap360` aus `./geometry`.
- Produces: `hslToHex(hue: number, saturation: number, lightness: number): string` — ein `#rrggbb`. Task 4 nutzt sie für jede Tippfarbe.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/color.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hslToHex } from '@/games/guesshue/color'

describe('hslToHex', () => {
  it('maps the primaries at full saturation and half lightness', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00')
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff')
  })

  it('folds an angle outside [0, 360) onto the circle', () => {
    // The scoreboard is handed hues straight off the wire; a wheel does not stop at 360.
    expect(hslToHex(360, 1, 0.5)).toBe(hslToHex(0, 1, 0.5))
    expect(hslToHex(-120, 1, 0.5)).toBe(hslToHex(240, 1, 0.5))
  })

  it('is grey at zero saturation, whatever the angle', () => {
    expect(hslToHex(200, 0, 0.5)).toBe('#808080')
    expect(hslToHex(20, 0, 0.5)).toBe('#808080')
  })

  it('pads every channel to two digits', () => {
    // `toString(16)` on a small channel yields one digit; an unpadded "#f0000" is not a colour.
    expect(hslToHex(0, 1, 0.02)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/color.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/color"`.

- [ ] **Step 3: Create the module**

Create `webapp-vue/src/games/guesshue/color.ts` und den Rumpf **wortgleich** aus der heutigen privaten `hslToHex` in `reveal.ts` übernehmen:

```ts
/**
 * Guess Hue's colour arithmetic. Its own module rather than a private helper in `reveal.ts`,
 * because the wheel and the scoreboard both need it: the sector inks itself against the solution
 * colour, and every row of the table inks itself against a different guess colour.
 */
import { wrap360 } from './geometry'

/**
 * The bridge to `readableTextColor`, which parses hex and nothing else. Needed because yellow and
 * blue at the same HSL lightness are nowhere near equally bright, so the decision cannot be made
 * from `lightness` alone.
 */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = wrap360(hue) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const rgb: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  const [r, g, b] = rgb
  const base = lightness - chroma / 2
  const channel = (value: number): string =>
    Math.round((value + base) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}
```

- [ ] **Step 4: Point `reveal.ts` at it**

In `webapp-vue/src/games/guesshue/reveal.ts`: die private Funktion `hslToHex` samt ihres Kommentars **löschen** und oben importieren.

```ts
import { hslToHex } from './color'
```

`sectorInk` bleibt unverändert in `reveal.ts` — sie ist die Tinte *des Rads*.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/color.spec.ts src/games/guesshue/__tests__/reveal.spec.ts
```

Erwartet: PASS. `reveal.spec.ts` prüft `sectorInk` und muss dabei unverändert grün bleiben — das ist der Beweis, dass der Umzug nichts verändert hat.

- [ ] **Step 6: Commit**

```bash
cd webapp-vue && pnpm typecheck && pnpm lint
git add webapp-vue/src/games/guesshue/color.ts webapp-vue/src/games/guesshue/reveal.ts webapp-vue/src/games/guesshue/__tests__/color.spec.ts
git commit -m "$(cat <<'EOF'
refactor(guesshue): lift hslToHex out of the wheel's arithmetic

It was private to `reveal.ts` because the sector was its only caller. The scoreboard
inks a different guess colour per row and needs the same bridge, so it gets a module
of its own -- and, for the first time, tests: primaries, the fold past 360, grey at
zero saturation, and the two-digit padding that an unpadded channel would break.

`sectorInk` stays in `reveal.ts`: that one is the wheel's ink, not colour arithmetic.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Der Vertrag — `GameEntry` und `awardRule`

**Files:**
- Modify: `webapp-vue/src/games/GameEntry.ts`
- Modify: `webapp-vue/src/games/guesshue/types.ts` (`hueOf`)
- Modify: `webapp-vue/src/games/guesshue/GuessHueGame.vue` (Prop `awardRule`, `hueOf` importieren)
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`, `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`

**Interfaces:**
- Consumes: `AwardRule` aus `@/api/types`.
- Produces:
  - `GameEntry` mit `username: string`, `outcome: unknown`, `points: number | null`.
  - `hueOf(guess: unknown): number | null` aus `@/games/guesshue/types`.
  - Prop `awardRule: AwardRule | null` an jeder Spiel-Komponente.

- [ ] **Step 1: Write the failing tests**

In `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`: dem `StubGame` eine Prop geben (im `vi.hoisted`-Block, hinter `disabled`):

```ts
        awardRule: { type: String, default: null },
```

und einen Test hinter „shows the result once the viewer has guessed" einfügen:

```ts
  it("hands the round's award rule to the game", () => {
    // The game needs it to say whether a score can still be overtaken. The rule travels, not a
    // pre-chewed boolean: `RoundResponse` publishes it so the UI has exactly one reading of it.
    const me = aPlay({ guessedAt: '2026-08-14T12:00:00Z', points: 1 })
    const round = aRound({ me, awardRule: 'CLOSEST_ONLY', awardPoints: 2 })

    const stub = mountCard({ round, stage: 'done' }).findComponent(StubGame)

    expect(stub.props('awardRule')).toBe('CLOSEST_ONLY')
  })
```

In `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`: dem dortigen Stub dieselbe Prop geben und den passenden Test ergänzen — Namen der Helfer aus der bestehenden Datei übernehmen:

```ts
  it("hands the lab round's award rule to the game", async () => {
    const w = await mountLab({ awardRule: 'CLOSEST_ONLY' })

    expect(w.findComponent(StubGame).props('awardRule')).toBe('CLOSEST_ONLY')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/rounds/__tests__/RoundCard.spec.ts src/gamelab/__tests__/lab-page.spec.ts
```

Erwartet: FAIL — `expected undefined to be 'CLOSEST_ONLY'` in beiden Dateien.

- [ ] **Step 3: Widen `GameEntry`**

`webapp-vue/src/games/GameEntry.ts` vollständig ersetzen:

```ts
/**
 * What a game component needs to know about one player's entry — and nothing more.
 *
 * Deliberately narrower than any wire type: the lab's `LabEntryDto` and the round's `MyPlayDto` and
 * `OtherPlayDto` all satisfy this structurally, so no world has to map, and the component stays
 * ignorant of which one it renders for.
 *
 * A field may be added here only when *every* world already carries it. That is the line: a field
 * only one of them has is how a game would start depending on the lab.
 */
export type GameEntry = {
  userId: string
  /** The display name, as the server resolved it. */
  username: string
  guess: unknown
  /** What the game said about this guess. `null` for a game that judges without saying anything. */
  outcome: unknown
  /** `null` until the round is scored; `0` means „played and came away empty“. */
  points: number | null
  avatar: { bgColorHex: string }
}
```

- [ ] **Step 4: Move `hueOf` into the game's wire shapes**

In `webapp-vue/src/games/guesshue/types.ts` unten anfügen:

```ts
/**
 * The one place a Guess Hue guess is narrowed. Narrowed rather than cast: the shape is `unknown` by
 * contract, and a stale round from another game may be junk. `typeof` alone would let `NaN` through.
 */
export function hueOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const hue = (guess as { hue?: unknown }).hue
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : null
}
```

In `webapp-vue/src/games/guesshue/GuessHueGame.vue` die dortige lokale `hueOf` samt Kommentar **löschen** und stattdessen importieren:

```ts
import { hueOf } from './types'
```

(Die bestehende Zeile `import type { GuessHuePayload, GuessHueSolution } from './types'` bleibt daneben stehen.)

- [ ] **Step 5: Add the prop and pass it from both callers**

In `webapp-vue/src/games/guesshue/GuessHueGame.vue`, im `defineProps`-Block hinter `mineUserId`:

```ts
  /**
   * The rule this round was frozen with. Guess Hue reads exactly one thing off it — whether a
   * score can still be overtaken — and the scoreboard says so. `null` where there is no round.
   */
  awardRule: AwardRule | null
```

und oben:

```ts
import type { AwardRule } from '@/api/types'
```

In `webapp-vue/src/rounds/RoundCard.vue`, am `<component :is>`, hinter `:mine-user-id`:

```html
      :award-rule="round?.awardRule ?? null"
```

In `webapp-vue/src/pages/c/[slug]/lab/[game].vue`, ebenso hinter `:mine-user-id`:

```html
      :award-rule="round.awardRule"
```

- [ ] **Step 6: Run the whole suite**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: PASS. Erwartete Kollateralschäden, die hier mitzureparieren sind: der Helfer `entry()` in `src/games/guesshue/__tests__/GuessHueGame.spec.ts` braucht ein `points: 0`, und `mountAdapter` dort ein `awardRule: null` in seinen Vorgabe-Props.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/games webapp-vue/src/rounds webapp-vue/src/pages webapp-vue/src/gamelab
git commit -m "$(cat <<'EOF'
feat(games): widen the entry contract by the three fields every world has

A scoreboard needs a name, a verdict and a score, and `GameEntry` carried none of
them. `LabEntryDto`, `MyPlayDto` and `OtherPlayDto` all already do, so no caller has
to map -- and the TSDoc now states the line the type has to hold: a field is allowed
here only when every world carries it.

`awardRule` rides beside it as its own prop rather than a derived boolean. The
response publishes the rule precisely so the UI has one reading of "provisional";
two callers computing that themselves would be two readings.

`hueOf` moves from `GuessHueGame` into `types.ts`, which owns the wire shapes it
narrows -- the scoreboard is about to need the same narrowing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `scoreboard.ts` — die Zeilen

**Files:**
- Create: `webapp-vue/src/games/guesshue/scoreboard.ts`
- Test: `webapp-vue/src/games/guesshue/__tests__/scoreboard.spec.ts`

**Interfaces:**
- Consumes: `GameEntry`, `AwardRule`, `hueOf`, `hslToHex`, `readableTextColor`, und `tickOfRow` aus `./reveal` — **die kommt erst in Task 5.** Deshalb baut dieser Task `tickOfRow` noch nicht ein: `ScoreboardRow.tick` wird hier auf den Rang gesetzt, und Task 5 hängt die Regel dazwischen. Das ist genau ein Ausdruck Unterschied und hält beide Tasks für sich testbar.
- Produces:
  - `interface ScoreboardRow { userId, name, colorHex, ink, hue, guessHex, guessInk, deviationDeg, points, provisional, tick }`
  - `interface ScoreboardSolution { hue, hex, ink }`
  - `scoreboardRows(input): ScoreboardRow[]`
  - `solutionCell(targetHue, saturation, lightness): ScoreboardSolution`
  - `isProvisional(points, awardRule): boolean`

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/scoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hslToHex } from '@/games/guesshue/color'
import { isProvisional, scoreboardRows, solutionCell } from '@/games/guesshue/scoreboard'

const SATURATION = 0.6
const LIGHTNESS = 0.45

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    guess: { hue: 210 },
    outcome: { deviationDeg: 0, withinTolerance: true },
    points: 1,
    avatar: { bgColorHex: '#3366cc' },
    ...over,
  }
}

function rowsOf(entries: GameEntry[], over: { awardRule?: 'ALL_QUALIFYING' | 'CLOSEST_ONLY' | null; mineUserId?: string | null } = {}) {
  return scoreboardRows({
    entries,
    saturation: SATURATION,
    lightness: LIGHTNESS,
    awardRule: over.awardRule ?? 'ALL_QUALIFYING',
    mineUserId: over.mineUserId ?? null,
  })
}

describe('scoreboardRows', () => {
  it('ranks by how close the guess came, not by when it arrived', () => {
    const rows = rowsOf([
      entry({ userId: 'far', outcome: { deviationDeg: 90.7 } }),
      entry({ userId: 'near', outcome: { deviationDeg: 5 } }),
      entry({ userId: 'mid', outcome: { deviationDeg: 8.7 } }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['near', 'mid', 'far'])
  })

  it('breaks a tie by user id, so a reload shows the same picture', () => {
    const rows = rowsOf([
      entry({ userId: 'b', outcome: { deviationDeg: 5 } }),
      entry({ userId: 'a', outcome: { deviationDeg: 5 } }),
    ])

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b'])
  })

  it('paints the row in the player colour and the guess in the guess colour', () => {
    const [row] = rowsOf([entry({ userId: 'me', guess: { hue: 128.4 }, avatar: { bgColorHex: '#7d2ae8' } })])

    expect(row!.colorHex).toBe('#7d2ae8')
    // The round's saturation and lightness, never the guess's: a guess is only an angle.
    expect(row!.guessHex).toBe(hslToHex(128.4, SATURATION, LIGHTNESS))
  })

  it('picks ink that reads against each of the two backgrounds separately', () => {
    const [row] = rowsOf([entry({ userId: 'me', guess: { hue: 60 }, avatar: { bgColorHex: '#111111' } })])

    expect(row!.ink).toBe('#ffffff')
    expect(row!.guessInk).toBe('#111111')
  })

  it('takes the deviation from the server and never recomputes it', () => {
    // Deliberately inconsistent with the hue: what the round was judged on is what the table shows.
    const [row] = rowsOf([entry({ userId: 'me', guess: { hue: 0 }, outcome: { deviationDeg: 42.5 } })])

    expect(row!.deviationDeg).toBe(42.5)
  })

  it.each([
    ['a missing outcome', null],
    ['a non-object outcome', 7],
    ['a missing deviation', { withinTolerance: true }],
    ['a non-numeric deviation', { deviationDeg: 'weit' }],
    ['a non-finite deviation', { deviationDeg: NaN }],
  ])('drops a row it cannot rank: %s', (_label, outcome) => {
    const rows = rowsOf([entry({ userId: 'broken', outcome }), entry({ userId: 'fine' })])

    expect(rows.map((row) => row.userId)).toEqual(['fine'])
  })

  it('drops a row whose guess carries no usable angle', () => {
    const rows = rowsOf([entry({ userId: 'broken', guess: { hue: 'blau' } }), entry({ userId: 'fine' })])

    expect(rows.map((row) => row.userId)).toEqual(['fine'])
  })

  it('numbers the rows by rank', () => {
    const rows = rowsOf([
      entry({ userId: 'far', outcome: { deviationDeg: 90 } }),
      entry({ userId: 'near', outcome: { deviationDeg: 1 } }),
    ])

    expect(rows.map((row) => row.tick)).toEqual([0, 1])
  })
})

describe('isProvisional', () => {
  it.each([
    [2, 'CLOSEST_ONLY' as const, true],
    // A zero cannot get better under closest-only: deviations freeze on guessing.
    [0, 'CLOSEST_ONLY' as const, false],
    [2, 'ALL_QUALIFYING' as const, false],
    [0, 'ALL_QUALIFYING' as const, false],
    [null, 'CLOSEST_ONLY' as const, false],
    [2, null, false],
  ])('is %s points under %s → %s', (points, awardRule, expected) => {
    expect(isProvisional(points, awardRule)).toBe(expected)
  })
})

describe('solutionCell', () => {
  it("is the target at the round's own saturation and lightness, with readable ink", () => {
    const cell = solutionCell(123.4, SATURATION, LIGHTNESS)

    expect(cell.hue).toBe(123.4)
    expect(cell.hex).toBe(hslToHex(123.4, SATURATION, LIGHTNESS))
    expect(cell.ink).toMatch(/^#(111111|ffffff)$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/scoreboard.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/scoreboard"`.

- [ ] **Step 3: Write the module**

Create `webapp-vue/src/games/guesshue/scoreboard.ts`:

```ts
/**
 * The scoreboard's arithmetic: which rows exist, in which order, and whether a score can still
 * move. Pure, and kept out of the component for the same reason `reveal.ts` is — happy-dom
 * computes no layout, so this is the half a test can actually assert on.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { readableTextColor } from '@/ui/readableTextColor'
import { hslToHex } from './color'
import { hueOf } from './types'

export interface ScoreboardRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground. */
  colorHex: string
  /** Ink that reads against [colorHex]. */
  ink: string
  hue: number
  /** The guess as a colour, at the round's saturation and lightness. */
  guessHex: string
  /** Ink that reads against [guessHex] — a different decision from [ink]. */
  guessInk: string
  /** How far off, as the server judged it. Never recomputed here. */
  deviationDeg: number
  points: number | null
  /** Whether [points] can still be overtaken — see [isProvisional]. */
  provisional: boolean
  /**
   * Which tick of the reveal cascade this row's timing comes from. Its rank, except for the
   * viewer's own row — see `tickOfRow` in `reveal.ts`.
   */
  tick: number
}

/** The solution as the head block shows it: a number over a colour. */
export interface ScoreboardSolution {
  hue: number
  hex: string
  ink: string
}

/**
 * Whether a score can still be overtaken. Word for word the server's own rule in
 * `RoundPlayPoints.kt` (`provisional = awardRule == CLOSEST_ONLY && points > 0`), mirrored here
 * because a round's response carries the rule but not the verdict. A zero is final even under
 * „closest only": deviations freeze on guessing, so a later guess can only take points away.
 */
export function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}

export function solutionCell(
  targetHue: number,
  saturation: number,
  lightness: number,
): ScoreboardSolution {
  const hex = hslToHex(targetHue, saturation, lightness)
  return { hue: targetHue, hex, ink: readableTextColor(hex) }
}

/**
 * Every guess the table can rank, best first. Ties go by user id so a reload shows the same
 * picture — the same rule `layoutGuesses` uses for the wheel.
 *
 * An entry whose guess carries no usable angle, or whose outcome carries no usable deviation,
 * **drops out** rather than printing `NaN`. Its marker stays on the wheel; see `GuessHueGame`.
 */
export function scoreboardRows(input: {
  entries: readonly GameEntry[]
  saturation: number
  lightness: number
  awardRule: AwardRule | null
  /** Read in Task 5, when `tickOfRow` decides when my own row may land. */
  mineUserId: string | null
}): ScoreboardRow[] {
  const ranked = input.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    const deviationDeg = deviationOf(entry.outcome)
    if (hue === null || deviationDeg === null) return []
    const guessHex = hslToHex(hue, input.saturation, input.lightness)
    return [
      {
        userId: entry.userId,
        name: entry.username,
        colorHex: entry.avatar.bgColorHex,
        ink: readableTextColor(entry.avatar.bgColorHex),
        hue,
        guessHex,
        guessInk: readableTextColor(guessHex),
        deviationDeg,
        points: entry.points,
        provisional: isProvisional(entry.points, input.awardRule),
        tick: 0,
      },
    ]
  })

  ranked.sort((a, b) => a.deviationDeg - b.deviationDeg || a.userId.localeCompare(b.userId))
  return ranked.map((row, rank) => ({ ...row, tick: rank }))
}

/** Narrowed, not cast: `outcome` is `unknown` by contract, and a stale round may be junk. */
function deviationOf(outcome: unknown): number | null {
  if (typeof outcome !== 'object' || outcome === null) return null
  const value = (outcome as { deviationDeg?: unknown }).deviationDeg
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/scoreboard.spec.ts
```

Erwartet: PASS, alle Tests.

- [ ] **Step 5: Commit**

```bash
cd webapp-vue && pnpm typecheck && pnpm lint
git add webapp-vue/src/games/guesshue/scoreboard.ts webapp-vue/src/games/guesshue/__tests__/scoreboard.spec.ts
git commit -m "$(cat <<'EOF'
feat(guesshue): rank the round's guesses, best first

The table is a ranking, not the order guesses arrived in, so the sort is the module's
main job -- by the server's `deviationDeg`, never a client recomputation, with the
user id as the tie-break so a reload shows the same picture.

Two colours per row, two ink decisions: the player's own colour behind the name and
the numbers, the guess as a colour beside them, each getting the ink that reads
against it. A row whose guess or outcome is junk drops out rather than printing NaN.

`isProvisional` mirrors `RoundPlayPoints.kt` word for word, including the part that
looks like an oversight: a zero is final even under closest-only, because deviations
freeze on guessing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `reveal.ts` — die Takte und der Fahrplan

**Files:**
- Modify: `webapp-vue/src/games/guesshue/reveal.ts`
- Modify: `webapp-vue/src/games/guesshue/HueWheelReveal.vue:18-19,71,185` (die neuen Namen)
- Modify: `webapp-vue/src/games/guesshue/scoreboard.ts` (`tickOfRow` einhängen)
- Test: `webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts`, `webapp-vue/src/games/guesshue/__tests__/scoreboard.spec.ts`

**Interfaces:**
- Consumes: `SECTOR_DELAY_MS`, `FADE_MS` (bestehen bereits in `reveal.ts`).
- Produces:
  - `RESULTS_DELAY_MS = 1900`, `HEAD_DELAY_MS`, `CELL_STAGGER_MS = 45`, `ROW_STAGGER_MS = 120`, `TYPE_BUDGET_MS = 1200`, `TIP_COLUMN = 1`
  - `rowStagger(rowCount: number): number`
  - `headCellDelayMs(row: number, column: number): number`
  - `cellDelayMs(tick: number, column: number, rowCount: number): number`
  - `tickOfRow(rank: number, myRank: number | null, rowCount: number): number`
  - **Entfernt:** `MARKERS_DELAY_MS`, `MARKER_STAGGER_MS`.

- [ ] **Step 1: Write the failing test**

In `webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts` unten anfügen (und die neuen Namen dem `import`-Block oben hinzufügen):

```ts
describe('the reveal schedule', () => {
  it('walks a row left to right and the rows top to bottom', () => {
    expect(cellDelayMs(0, 0, 3)).toBe(RESULTS_DELAY_MS)
    expect(cellDelayMs(0, 3, 3)).toBe(RESULTS_DELAY_MS + 3 * CELL_STAGGER_MS)
    expect(cellDelayMs(2, 0, 3)).toBe(RESULTS_DELAY_MS + 2 * ROW_STAGGER_MS)
  })

  it('overlaps the cascades: a row starts before the row above it has finished', () => {
    // 120 < 3 * 45 — that is what makes it flow instead of stutter.
    expect(ROW_STAGGER_MS).toBeLessThan(3 * CELL_STAGGER_MS)
  })

  it('compresses the rows once the budget binds, instead of lengthening the round', () => {
    expect(rowStagger(3)).toBe(ROW_STAGGER_MS)
    expect(rowStagger(10)).toBe(ROW_STAGGER_MS)
    expect(rowStagger(20)).toBe(TYPE_BUDGET_MS / 20)
    // No row count may make the cascade longer than the budget.
    for (const rowCount of [1, 2, 5, 10, 25, 100]) {
      expect((rowCount - 1) * rowStagger(rowCount)).toBeLessThanOrEqual(TYPE_BUDGET_MS)
    }
  })

  it('survives an empty table without dividing by zero', () => {
    expect(rowStagger(0)).toBe(ROW_STAGGER_MS)
  })

  it('finishes the head before the results beat starts', () => {
    // Three head rows, four columns; the last one must have faded out before beat 4.
    expect(headCellDelayMs(2, 3) + FADE_MS).toBeLessThan(RESULTS_DELAY_MS)
  })
})

describe('tickOfRow', () => {
  it('gives every other row its own rank', () => {
    expect(tickOfRow(0, 2, 4)).toBe(0)
    expect(tickOfRow(3, 2, 4)).toBe(3)
  })

  it('never lets my row appear before the first foreign marker', () => {
    // My marker has been on the wheel since the crossfade, so a row in slot four would say
    // "not the best" while the picture still shows a single guess.
    expect(tickOfRow(3, 3, 4)).toBe(0)
    // As rank 0 the best foreign guess is rank 1, so that is when my row may land.
    expect(tickOfRow(0, 0, 4)).toBe(1)
  })

  it('has nothing to give away when I guessed alone', () => {
    expect(tickOfRow(0, 0, 1)).toBe(0)
  })

  it('leaves every row alone when none of them is mine', () => {
    expect(tickOfRow(0, null, 3)).toBe(0)
    expect(tickOfRow(2, null, 3)).toBe(2)
  })
})
```

Und in `webapp-vue/src/games/guesshue/__tests__/scoreboard.spec.ts` den Test „numbers the rows by rank" **ersetzen**:

```ts
  it('gives each row its rank as a tick, and holds mine back to the first foreign marker', () => {
    const rows = rowsOf(
      [
        entry({ userId: 'far', outcome: { deviationDeg: 90 } }),
        entry({ userId: 'me', outcome: { deviationDeg: 40 } }),
        entry({ userId: 'near', outcome: { deviationDeg: 1 } }),
      ],
      { mineUserId: 'me' },
    )

    expect(rows.map((row) => [row.userId, row.tick])).toEqual([
      ['near', 0],
      ['me', 0],
      ['far', 2],
    ])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/reveal.spec.ts src/games/guesshue/__tests__/scoreboard.spec.ts
```

Erwartet: FAIL — `cellDelayMs is not a function` und ein Rangvergleich, der `[['near',0],['me',1],['far',2]]` liefert.

- [ ] **Step 3: Write the schedule**

In `webapp-vue/src/games/guesshue/reveal.ts`: den Absatz über die vier Takte auf **vier** aktualisieren, `MARKERS_DELAY_MS` und `MARKER_STAGGER_MS` löschen und ersetzen:

```ts
/**
 * The four beats of the reveal, from the moment the reveal card is inserted. Beat 1 is a CSS
 * transition in the components (the centre button leaving the outgoing card at 0 ms over 200 ms),
 * beat 2 the card crossfade at ~200 ms; the numbers below drive beats 3 and 4 — the tolerance
 * sector and the scoreboard's head at [SECTOR_DELAY_MS], then the results: every row of the table
 * and, with it, its marker on the wheel. They are a first proposal and belong in the lab to be
 * turned — that is what it is for.
 */
export const SECTOR_DELAY_MS = 900
export const RESULTS_DELAY_MS = 1900
export const FADE_MS = 300
export const BAND_GROW_MS = 700

/** Beat 3 writes the scoreboard's head at the same moment the sector fades in. */
export const HEAD_DELAY_MS = SECTOR_DELAY_MS

/** Between the columns of one row — the typewriter's step. */
export const CELL_STAGGER_MS = 45

/**
 * Between rows. Deliberately shorter than a row is wide (3 · [CELL_STAGGER_MS]), so the cascades
 * overlap and the table flows instead of stuttering row by row.
 */
export const ROW_STAGGER_MS = 120

/** The row cascade never runs longer than this, however many people played. */
export const TYPE_BUDGET_MS = 1200

/** The column a marker rides with: the guess cell, because both are „the guess as a colour". */
export const TIP_COLUMN = 1

/**
 * How far apart two rows are. [ROW_STAGGER_MS] below the budget, and whatever fits above it — the
 * same „compress rather than grow" shape [stackStep] gives the marker lanes.
 */
export function rowStagger(rowCount: number): number {
  return Math.min(ROW_STAGGER_MS, TYPE_BUDGET_MS / Math.max(1, rowCount))
}

/** A cell of the scoreboard's head: three rows (heading, solution value, band), four columns. */
export function headCellDelayMs(row: number, column: number): number {
  return HEAD_DELAY_MS + row * ROW_STAGGER_MS + column * CELL_STAGGER_MS
}

/**
 * A cell of the scoreboard's body — and, at [TIP_COLUMN], the matching marker on the wheel. One
 * function for both is the whole point of the coupling: there is no second timetable to drift.
 */
export function cellDelayMs(tick: number, column: number, rowCount: number): number {
  return RESULTS_DELAY_MS + tick * rowStagger(rowCount) + column * CELL_STAGGER_MS
}

/**
 * Which tick a row borrows its timing from. Every row rides its own rank — except the viewer's.
 *
 * My marker has been on the wheel since the crossfade (it is the knob, recoloured), so a row
 * appearing with it would say „I am not the best" from its slot alone, before the picture had
 * shown a single rival guess. Mine therefore waits for the first foreign marker: that is rank 1
 * when I am rank 0, and rank 0 otherwise. Alone in the round there is nothing to give away.
 */
export function tickOfRow(rank: number, myRank: number | null, rowCount: number): number {
  if (myRank === null || rank !== myRank) return rank
  if (rowCount <= 1) return 0
  return myRank === 0 ? 1 : 0
}
```

- [ ] **Step 4: Hang the rule into the rows**

In `webapp-vue/src/games/guesshue/scoreboard.ts`: den Import ergänzen und die letzte Zeile von `scoreboardRows` ersetzen.

```ts
import { tickOfRow } from './reveal'
```

```ts
  ranked.sort((a, b) => a.deviationDeg - b.deviationDeg || a.userId.localeCompare(b.userId))
  const myRank = ranked.findIndex((row) => row.userId === input.mineUserId)
  return ranked.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
```

- [ ] **Step 5: Point the wheel at the new names**

In `webapp-vue/src/games/guesshue/HueWheelReveal.vue`: im Import-Block `MARKERS_DELAY_MS` → `RESULTS_DELAY_MS` und `MARKER_STAGGER_MS` → `ROW_STAGGER_MS`; in `growBand` (Zeile 71) `MARKERS_DELAY_MS` → `RESULTS_DELAY_MS`; im Marker-Style (Zeile 185):

```ts
            transitionDelay: `${RESULTS_DELAY_MS + index * ROW_STAGGER_MS}ms`,
```

Das ist eine reine Umbenennung — Task 7 ersetzt diesen Ausdruck durch den Wert vom Marker.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: PASS. Sucht `grep -rn "MARKERS_DELAY_MS\|MARKER_STAGGER_MS" webapp-vue/src` noch etwas, ist es übersehen worden.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/games/guesshue
git commit -m "$(cat <<'EOF'
feat(guesshue): one timetable for the rows and the markers

Beats four and five collapse into one: a row and its marker are the same event, so
`cellDelayMs` serves both and there is no second schedule to drift. `MARKERS_DELAY_MS`
becomes `RESULTS_DELAY_MS` and `MARKER_STAGGER_MS` becomes `ROW_STAGGER_MS` because
the beat is now more than markers -- and the budget that caps the row cascade
therefore caps the marker cascade too, which was uncapped and ran 1.35s at fifteen
players.

`tickOfRow` is where the one asymmetry lives. My marker has been on the wheel since
the crossfade, so my row appearing with it would say "not the best" from its slot
alone, before the picture had shown a rival. It waits for the first foreign marker.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `GuessHueScoreboard.vue` — die Tabelle

**Files:**
- Create: `webapp-vue/src/games/guesshue/GuessHueScoreboard.vue`
- Test: `webapp-vue/src/games/guesshue/__tests__/GuessHueScoreboard.spec.ts`

**Interfaces:**
- Consumes: `ScoreboardRow`, `ScoreboardSolution` aus `./scoreboard`; `CELL_STAGGER_MS` wird **nicht** direkt gebraucht, wohl aber `FADE_MS`, `cellDelayMs`, `headCellDelayMs` aus `./reveal`; `inBackground`, `prefersReducedMotion` aus `@/ui/motion`.
- Produces: die Komponente mit den Props `rows: ScoreboardRow[]`, `solution: ScoreboardSolution`, `live: boolean`, `animate: boolean`. Task 7 montiert sie.

- [ ] **Step 1: Write the failing test**

Create `webapp-vue/src/games/guesshue/__tests__/GuessHueScoreboard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GuessHueScoreboard from '@/games/guesshue/GuessHueScoreboard.vue'
import { RESULTS_DELAY_MS } from '@/games/guesshue/reveal'
import type { ScoreboardRow, ScoreboardSolution } from '@/games/guesshue/scoreboard'

const SOLUTION: ScoreboardSolution = { hue: 123.4, hex: '#5ce65c', ink: '#111111' }

function row(over: Partial<ScoreboardRow> & { userId: string }): ScoreboardRow {
  return {
    name: over.userId,
    colorHex: '#7d2ae8',
    ink: '#ffffff',
    hue: 128.4,
    guessHex: '#5ce65c',
    guessInk: '#111111',
    deviationDeg: 5,
    points: 1,
    provisional: false,
    tick: 0,
    ...over,
  }
}

function mountBoard(props: Partial<InstanceType<typeof GuessHueScoreboard>['$props']> = {}) {
  return mount(GuessHueScoreboard, {
    props: {
      rows: [row({ userId: 'leela' })],
      solution: SOLUTION,
      live: false,
      animate: false,
      ...props,
    },
  })
}

describe('GuessHueScoreboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('names each player from a row header, so a cell is never read bare', () => {
    // `<th scope="row">` is what makes a screen reader say "Leela, Tipp 128,4" and not "128,4".
    const w = mountBoard({ rows: [row({ userId: 'leela', name: 'Leela' })] })
    const header = w.get('tbody th')

    expect(header.attributes('scope')).toBe('row')
    expect(header.text()).toBe('Leela')
  })

  it('heads all four columns', () => {
    const w = mountBoard()
    const band = w.findAll('thead tr:last-child th')

    expect(band.map((cell) => cell.text())).toEqual(['Name', 'Tipp', 'Differenz', 'Pkt'])
    expect(band.every((cell) => cell.attributes('scope') === 'col')).toBe(true)
  })

  it("keeps the head block in the original's arrangement", () => {
    // The heading sits beside the solution stack, not above the table, and the chip sits over the
    // column that can still change. Both span the two head rows.
    const w = mountBoard({ live: true })

    expect(w.get('thead h2').text()).toBe('Auswertung')
    expect(w.get('thead h2').element.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(w.get('[data-test="hue-scoreboard-live"]').element.closest('td')!.getAttribute('rowspan')).toBe('2')
    expect(w.get('[data-test="hue-scoreboard-solution"]').attributes('headers')).toBe('hue-solution')
    expect(w.get('#hue-solution').text()).toBe('Lösung')
  })

  it('says in the caption what the heading does not', () => {
    const caption = mountBoard().get('caption')

    expect(caption.classes()).toContain('sr-only')
    expect(caption.text()).not.toContain('Auswertung')
    expect(caption.text()).toContain('sortiert')
  })

  it('grounds the row in the player colour and the guess cell in the guess colour', () => {
    const w = mountBoard({
      rows: [row({ userId: 'leela', colorHex: '#7d2ae8', ink: '#ffffff', guessHex: '#5ce65c', guessInk: '#111111' })],
    })
    const cells = w.findAll('tbody th, tbody td')

    // happy-dom may or may not normalise a hex to rgb() — the test pins the colour, not that.
    expect(cells[0]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
    expect(cells[1]!.element.style.backgroundColor).toMatch(/#5ce65c|rgb\(92, ?230, ?92\)/i)
    expect(cells[2]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
    expect(cells[3]!.element.style.backgroundColor).toMatch(/#7d2ae8|rgb\(125, ?42, ?232\)/i)
  })

  it('writes the numbers German, with one decimal and an em dash for nothing', () => {
    const w = mountBoard({ rows: [row({ userId: 'a', hue: 128.4, deviationDeg: 5, points: null })] })
    const cells = w.findAll('tbody td')

    expect(cells[0]!.text()).toBe('128,4')
    expect(cells[1]!.text()).toBe('5,0')
    // U+2014, not a hyphen and not an en dash.
    expect(cells[2]!.text()).toBe('—')
  })

  it('shows the live chip only where a score can still be overtaken', () => {
    expect(mountBoard({ live: false }).find('[data-test="hue-scoreboard-live"]').exists()).toBe(false)

    const live = mountBoard({ live: true }).get('[data-test="hue-scoreboard-live"]')
    expect(live.classes()).toEqual(expect.arrayContaining(['bg-live', 'animate-pulse']))
    // The pulse means nothing over the wire; the chip has to say it.
    expect(live.text()).toContain('ändern')
  })

  it('pulses only the points that can still move, and says so in words too', () => {
    const w = mountBoard({
      rows: [row({ userId: 'a', provisional: true, points: 2 }), row({ userId: 'b', provisional: false, points: 0 })],
    })
    const [first, second] = w.findAll('[data-test="hue-scoreboard-points"]')

    expect(first!.classes()).toEqual(expect.arrayContaining(['animate-pulse', 'italic', 'motion-reduce:animate-none']))
    expect(first!.text()).toContain('vorläufig')
    expect(second!.classes()).not.toContain('animate-pulse')
    expect(second!.text()).toBe('0')
  })

  it('is fully written the moment a reload lands on a spent round', () => {
    const w = mountBoard({ animate: false })

    for (const cell of w.findAll('thead th, thead td, tbody th, tbody td')) {
      expect(cell.classes()).not.toContain('opacity-0')
    }
  })

  it('types itself in, cell by cell and row by row, once it is a live reveal', async () => {
    const w = mountBoard({
      animate: true,
      rows: [row({ userId: 'a', tick: 0 }), row({ userId: 'b', tick: 1 })],
    })

    // Two frames before anything is shown: the painted opacity-0 frame Firefox needs.
    expect(w.get('tbody th').classes()).toContain('opacity-0')
    vi.advanceTimersByTime(50)
    await w.vm.$nextTick()
    expect(w.get('tbody th').classes()).toContain('opacity-100')

    const cells = w.findAll('tbody tr:first-child th, tbody tr:first-child td')
    const delays = cells.map((cell) => cell.element.style.transitionDelay)
    expect(delays).toEqual([
      `${RESULTS_DELAY_MS}ms`,
      `${RESULTS_DELAY_MS + 45}ms`,
      `${RESULTS_DELAY_MS + 90}ms`,
      `${RESULTS_DELAY_MS + 135}ms`,
    ])

    const second = w.get('tbody tr:nth-child(2) th')
    expect(second.element.style.transitionDelay).toBe(`${RESULTS_DELAY_MS + 120}ms`)
  })

  it('renders nothing at all when no guess could be ranked', () => {
    const w = mountBoard({ rows: [] })

    expect(w.find('table').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/GuessHueScoreboard.spec.ts
```

Erwartet: FAIL — `Failed to resolve import "@/games/guesshue/GuessHueScoreboard.vue"`.

- [ ] **Step 3: Write the component**

Create `webapp-vue/src/games/guesshue/GuessHueScoreboard.vue`:

```vue
<script setup lang="ts">
/**
 * „Auswertung": every ranked guess of the round as a table, best first.
 *
 * Colour does two jobs here and both carry meaning — identity (the row *is* the player, in the
 * colour their avatar has above the card) and value (the guess as a surface, directly under the
 * solution as a surface). Three quiet things hold that together and none of them are decoration:
 * the near-black head band as an anchor, the thin white gutters between all cells, and an ink
 * decision per cell. Take one away and it stops reading as a table.
 *
 * The layout is the origin app's `GuessColorAnalysis.vue`, cell for cell, in a real `<table>`.
 * The table's box is complete from the moment it mounts and only its ink appears, so nothing here
 * ever moves — see the design doc.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FADE_MS, cellDelayMs, headCellDelayMs } from './reveal'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'
import { inBackground, prefersReducedMotion } from '@/ui/motion'

const props = defineProps<{
  rows: ScoreboardRow[]
  solution: ScoreboardSolution
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const COLUMNS = ['Name', 'Tipp', 'Differenz', 'Pkt']

/** Asked once, when the choreography would start — the same four questions the wheel asks. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const shown = ref(still)
const opacity = computed(() => (shown.value ? 'opacity-100' : 'opacity-0'))

let frame = 0

onMounted(() => {
  if (still) return
  // The same two frames `HueWheelReveal` needs: Firefox only starts a transition off a style it
  // has already resolved in an earlier frame, so a painted `opacity-0` frame must exist first.
  frame = requestAnimationFrame(() => {
    void document.body.offsetHeight
    frame = requestAnimationFrame(() => {
      shown.value = true
    })
  })
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
})

const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function degrees(value: number): string {
  return oneDecimal.format(value)
}

/** U+2014. An unscored row says „nothing here", and a hyphen would read as a minus. */
function pointsLabel(points: number | null): string {
  return points === null ? '—' : String(points)
}

function fade(delayMs: number) {
  return { transitionDuration: `${FADE_MS}ms`, transitionDelay: `${delayMs}ms` }
}

function head(row: number, column: number) {
  return fade(headCellDelayMs(row, column))
}

function body(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length))
}

function ground(row: ScoreboardRow) {
  return { backgroundColor: row.colorHex, color: row.ink }
}

function guessGround(row: ScoreboardRow) {
  return { backgroundColor: row.guessHex, color: row.guessInk }
}
</script>

<template>
  <table
    v-if="props.rows.length > 0"
    data-test="hue-scoreboard"
    class="w-full table-fixed border-separate border-spacing-x-1 border-spacing-y-0.5"
  >
    <caption class="sr-only">
      Alle Tipps der Runde, nach Abstand zur Lösung sortiert
    </caption>
    <colgroup>
      <col />
      <col class="w-14" />
      <col class="w-14" />
      <col class="w-9" />
    </colgroup>
    <thead>
      <!-- Head block, row 1: the heading in column one, the label over the guess column, the
           chip over the column that can still change. Exactly where the original puts them. -->
      <tr>
        <td
          rowspan="2"
          class="align-middle transition-opacity"
          :class="opacity"
          :style="head(0, 0)"
        >
          <h2 class="text-2xl">Auswertung</h2>
        </td>
        <th
          id="hue-solution"
          class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
          :class="opacity"
          :style="head(0, 1)"
        >
          Lösung
        </th>
        <td />
        <td rowspan="2" class="align-bottom">
          <span
            v-if="props.live"
            data-test="hue-scoreboard-live"
            class="bg-live block animate-pulse rounded-md px-1.5 text-center text-sm text-white italic transition-opacity motion-reduce:animate-none"
            :class="opacity"
            :style="head(0, 3)"
          >
            live<span class="sr-only">: Die Punkte können sich noch ändern.</span>
          </span>
        </td>
      </tr>
      <!-- Head block, row 2: the value under its own label. `headers`, not `scope` — `scope="col"`
           would put "Lösung" over the guesses below, whose column header is "Tipp". -->
      <tr>
        <td
          headers="hue-solution"
          data-test="hue-scoreboard-solution"
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[{ backgroundColor: props.solution.hex, color: props.solution.ink }, head(1, 1)]"
        >
          {{ degrees(props.solution.hue) }}
        </td>
        <td />
      </tr>
      <!-- The band. The anchor that makes the colour below read as a table. -->
      <tr>
        <th
          v-for="(label, column) in COLUMNS"
          :key="label"
          scope="col"
          class="bg-neutral-900 px-0.5 text-start text-xs font-normal text-white transition-opacity"
          :class="opacity"
          :style="head(2, column)"
        >
          {{ label }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in props.rows" :key="row.userId">
        <th
          scope="row"
          class="truncate px-0.5 text-start font-normal transition-opacity"
          :class="opacity"
          :style="[ground(row), body(row.tick, 0)]"
        >
          {{ row.name }}
        </th>
        <td
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[guessGround(row), body(row.tick, 1)]"
        >
          {{ degrees(row.hue) }}
        </td>
        <td
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="opacity"
          :style="[ground(row), body(row.tick, 2)]"
        >
          {{ degrees(row.deviationDeg) }}
        </td>
        <td
          data-test="hue-scoreboard-points"
          class="px-0.5 text-end tabular-nums transition-opacity"
          :class="[opacity, row.provisional ? 'animate-pulse italic motion-reduce:animate-none' : '']"
          :style="[ground(row), body(row.tick, 3)]"
        >
          {{ pointsLabel(row.points)
          }}<span v-if="row.provisional" class="sr-only"> (vorläufig)</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/GuessHueScoreboard.spec.ts
```

Erwartet: PASS, alle Tests.

- [ ] **Step 5: Commit**

```bash
cd webapp-vue && pnpm typecheck && pnpm lint
git add webapp-vue/src/games/guesshue/GuessHueScoreboard.vue webapp-vue/src/games/guesshue/__tests__/GuessHueScoreboard.spec.ts
git commit -m "$(cat <<'EOF'
feat(guesshue): the scoreboard, cell for cell where the original had it

A real `<table>`, which is what lets it pay the debt the reveal-wheel spec booked:
`<th scope="row">` on the name is the difference between "Leela, Tipp 128,4" and a
bare "128,4". The head block keeps the origin app's arrangement -- heading beside the
solution stack, chip over the points column -- as three rows of the one `<thead>`
HTML allows, with `rowspan="2"` where the original spanned by being a grid.

`<caption>` cannot sit in column one, so it does not try: it stays `sr-only` and says
what the heading does not. "Lösung" binds to its value by `headers`, since
`scope="col"` would claim the guesses whose column header is "Tipp".

Everything the pulse and the colour carry is also written out for assistive tech, the
same lesson `MemberRow` learned: neither travels over the wire.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verdrahtung — Ränge, Fahrplan, Karte

**Files:**
- Modify: `webapp-vue/src/games/guesshue/reveal.ts` (`RevealGuess.revealDelayMs`)
- Modify: `webapp-vue/src/games/guesshue/HueWheelReveal.vue`
- Modify: `webapp-vue/src/games/guesshue/GuessHueReveal.vue`
- Modify: `webapp-vue/src/games/guesshue/GuessHueGame.vue`
- Test: `webapp-vue/src/games/guesshue/__tests__/HueWheelReveal.spec.ts`, `webapp-vue/src/games/guesshue/__tests__/GuessHueGame.spec.ts`, `webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 4–6.
- Produces: `RevealGuess` mit `revealDelayMs: number`; die Auswertungskarte zeigt die Tabelle unter dem Rad.

- [ ] **Step 1: Write the failing tests**

In `webapp-vue/src/games/guesshue/__tests__/HueWheelReveal.spec.ts`: die Konstante `GUESSES` oben um das neue Feld ergänzen und einen Test anfügen:

```ts
const GUESSES: RevealGuess[] = [
  { userId: 'me', hue: 214.5, colorHex: '#3366cc', revealDelayMs: 2000 },
  { userId: 'other', hue: 40, colorHex: '#cc3366', revealDelayMs: 2500 },
]
```

```ts
  it("takes each marker's moment from the guess, and computes none of its own", () => {
    // The scoreboard owns the timetable now: a marker and its row are the same event, and a
    // second calculation here is exactly how the two would drift apart.
    const w = mountWheel({ animate: true })
    const markers = w.findAll('[data-test="hue-marker"]')

    expect(markers[0]!.element.style.transitionDelay).toBe('2000ms')
    expect(markers[1]!.element.style.transitionDelay).toBe('2500ms')
  })
```

In `webapp-vue/src/games/guesshue/__tests__/GuessHueGame.spec.ts`: den Helfer `entry()` um `points` erweitern und einen `describe`-Block anfügen:

```ts
function entry(userId: string, hue: unknown, bgColorHex = '#3366cc', over: Record<string, unknown> = {}) {
  return {
    userId,
    username: userId,
    avatar: { shortName: userId.toUpperCase(), bgColorHex },
    guess: { hue },
    outcome: { deviationDeg: 0 },
    points: 1,
    at: '2026-08-09T12:00:00Z',
    ...over,
  }
}
```

```ts
describe('GuessHueGame, the scoreboard under the wheel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function spentRound(props: Record<string, unknown> = {}) {
    return mountAdapter({
      solution: SOLUTION,
      mineUserId: 'me',
      myGuess: { hue: 214.5 },
      disabled: true,
      ...props,
    })
  }

  it('shows the table under the wheel once the round is spent', () => {
    const w = spentRound({
      entries: [entry('me', 214.5, '#3366cc', { outcome: { deviationDeg: 4.5 } })],
    })

    expect(w.find('[data-test="hue-scoreboard"]').exists()).toBe(true)
    expect(w.get('[data-test="hue-scoreboard"]').text()).toContain('me')
  })

  it('calls the round live exactly when a score can still be overtaken', () => {
    const entries = [entry('me', 214.5, '#3366cc', { outcome: { deviationDeg: 4.5 } })]

    expect(
      spentRound({ entries, awardRule: 'CLOSEST_ONLY' }).find('[data-test="hue-scoreboard-live"]').exists(),
    ).toBe(true)
    expect(
      spentRound({ entries, awardRule: 'ALL_QUALIFYING' }).find('[data-test="hue-scoreboard-live"]').exists(),
    ).toBe(false)
  })

  // The two timing tests do not pass `animate`: `GuessHueGame` has no such prop — it derives the
  // flag from a live null→non-null transition of `solution`, which mounting straight into a spent
  // round is not. That costs these tests nothing: `transitionDelay` is written into every cell's
  // and marker's `style` unconditionally, and only the opacity class waits for the beats.
  it('gives a marker and its row the same moment', () => {
    const w = spentRound({
      entries: [
        entry('me', 214.5, '#3366cc', { outcome: { deviationDeg: 40 } }),
        entry('near', 211, '#cc3366', { outcome: { deviationDeg: 1 } }),
      ],
    })

    const markerDelay = w
      .findAll('[data-test="hue-marker"]')
      .map((marker) => marker.element.style.transitionDelay)
    const tipDelay = w
      .findAll('tbody td:first-of-type')
      .map((cell) => cell.element.style.transitionDelay)

    // The wheel keeps entry order, the table rank order — so "near" is the wheel's second marker
    // and the table's first row. Both must carry the same number.
    expect(markerDelay[1]).toBe(tipDelay[0])
  })

  it('never lands my row before the first foreign marker', () => {
    // I am rank 1 of 2, so my row rides tick 0 — the moment the leader's marker arrives.
    const w = spentRound({
      entries: [
        entry('me', 214.5, '#3366cc', { outcome: { deviationDeg: 40 } }),
        entry('near', 211, '#cc3366', { outcome: { deviationDeg: 1 } }),
      ],
    })

    const rows = w.findAll('tbody tr')
    const nameDelay = (index: number) =>
      rows[index]!.get('th').element.style.transitionDelay

    expect(nameDelay(0)).toBe(`${RESULTS_DELAY_MS}ms`)
    expect(nameDelay(1)).toBe(`${RESULTS_DELAY_MS}ms`)
  })

  it('keeps an unrankable guess in the picture and out of the table', () => {
    const w = spentRound({
      entries: [
        entry('me', 214.5, '#3366cc', { outcome: { deviationDeg: 4.5 } }),
        entry('broken', 90, '#cc3366', { outcome: null }),
      ],
    })

    expect(w.findAll('[data-test="hue-marker"]')).toHaveLength(2)
    expect(w.findAll('tbody tr')).toHaveLength(1)
  })
})
```

`RESULTS_DELAY_MS` oben in der Datei importieren.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd webapp-vue && pnpm exec vitest run src/games/guesshue/__tests__/HueWheelReveal.spec.ts src/games/guesshue/__tests__/GuessHueGame.spec.ts
```

Erwartet: FAIL — kein `[data-test="hue-scoreboard"]`, und die Marker tragen den selbstgerechneten Delay.

- [ ] **Step 3: Put the delay on the guess**

In `webapp-vue/src/games/guesshue/reveal.ts`, `RevealGuess` erweitern:

```ts
/** One guess to place, already narrowed to numbers by whoever read it off the wire. */
export interface RevealGuess {
  userId: string
  hue: number
  /** The guesser's avatar colour — the marker's fill. */
  colorHex: string
  /**
   * When this marker fades in. Computed by `GuessHueGame` from the scoreboard's ranking, so the
   * marker and its row are one event — the wheel keeps no timetable of its own.
   */
  revealDelayMs: number
}
```

- [ ] **Step 4: Let the wheel read it**

In `webapp-vue/src/games/guesshue/HueWheelReveal.vue`: `ROW_STAGGER_MS` aus dem Import entfernen (`RESULTS_DELAY_MS` bleibt — `growBand` braucht es), und den Marker-Style ändern:

```ts
            transitionDelay: `${marker.revealDelayMs}ms`,
```

Die `v-for`-Laufvariable `index` wird damit unbenutzt und entfällt: `v-for="marker in layout.markers"`.

- [ ] **Step 5: Hang the table under the wheel**

`webapp-vue/src/games/guesshue/GuessHueReveal.vue` vollständig ersetzen:

```vue
<script setup lang="ts">
/**
 * The card after the round: the same quote, the wheel as a picture, and the scoreboard under it.
 *
 * The table's box is complete from the moment this card mounts — nothing under the wheel moves
 * afterwards, only its ink appears. That is why the card grows exactly once, during the crossfade
 * both cards share a grid cell for, and never again.
 */
import GuessHueScoreboard from './GuessHueScoreboard.vue'
import HueWheelReveal from './HueWheelReveal.vue'
import type { RevealGuess } from './reveal'
import type { ScoreboardRow, ScoreboardSolution } from './scoreboard'

const props = defineProps<{
  description: string
  saturation: number
  lightness: number
  targetHue: number
  toleranceDeg: number
  guesses: RevealGuess[]
  mineUserId: string | null
  animate: boolean
  rows: ScoreboardRow[]
  solutionCell: ScoreboardSolution
  live: boolean
}>()
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-4">
    <blockquote class="border-l-4 border-neutral-300 py-1 pl-4">
      <p
        data-test="hue-description"
        class="text-xl leading-relaxed font-medium text-neutral-900 italic select-none"
      >
        „{{ props.description }}“
      </p>
    </blockquote>

    <div class="mt-6">
      <HueWheelReveal
        :saturation="props.saturation"
        :lightness="props.lightness"
        :target-hue="props.targetHue"
        :tolerance-deg="props.toleranceDeg"
        :guesses="props.guesses"
        :mine-user-id="props.mineUserId"
        :animate="props.animate"
      />
    </div>

    <div class="mt-6">
      <GuessHueScoreboard
        :rows="props.rows"
        :solution="props.solutionCell"
        :live="props.live"
        :animate="props.animate"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 6: Build the rows and the timetable in one place**

In `webapp-vue/src/games/guesshue/GuessHueGame.vue`: Imports ergänzen,

```ts
import { TIP_COLUMN, cellDelayMs } from './reveal'
import { scoreboardRows, solutionCell } from './scoreboard'
import type { ScoreboardRow } from './scoreboard'
```

den `guesses`-Computed **ersetzen** und die drei neuen daneben stellen:

```ts
/** Empty until the server has revealed: without a solution there is nothing to rank against. */
const rows = computed<ScoreboardRow[]>(() =>
  solution.value === null
    ? []
    : scoreboardRows({
        entries: props.entries,
        saturation: props.payload.saturation,
        lightness: props.payload.lightness,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

/**
 * The head block's solution cell. The `?? 0` is never reached in practice — the reveal card only
 * exists once `solution` is non-null — and exists so this stays a plain computed rather than a
 * nullable prop threaded through two components.
 */
const solutionCellValue = computed(() =>
  solutionCell(solution.value?.targetHue ?? 0, props.payload.saturation, props.payload.lightness),
)

/**
 * An entry the wheel cannot place drops out of the list rather than being drawn wrong. One the
 * *table* cannot rank stays — a guess is not worth removing from the picture because its verdict
 * is junk — and joins the cascade after every row.
 */
const guesses = computed<RevealGuess[]>(() => {
  const tickByUser = new Map(rows.value.map((row) => [row.userId, row.tick]))
  const rowCount = rows.value.length
  let extra = 0
  return props.entries.flatMap((entry) => {
    const hue = hueOf(entry.guess)
    if (hue === null) return []
    const tick = tickByUser.get(entry.userId) ?? rowCount + extra++
    return [
      {
        userId: entry.userId,
        hue,
        colorHex: entry.avatar.bgColorHex,
        revealDelayMs: cellDelayMs(tick, TIP_COLUMN, rowCount),
      },
    ]
  })
})

/** „Live" is the round's rule, not a per-row question — the rows carry their own `provisional`. */
const live = computed(() => props.awardRule === 'CLOSEST_ONLY')
```

Der Bezeichner heißt `solutionCellValue` und nicht `solutionCell`, weil der Name in dieser Datei
schon von der importierten Funktion belegt ist.

Und im Template die drei neuen Props an `GuessHueReveal` hängen, hinter `:animate`:

```html
        :rows="rows"
        :solution-cell="solutionCellValue"
        :live="live"
```

- [ ] **Step 7: Run the whole suite**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
```

Erwartet: PASS. Erwarteter Kollateralschaden: jede Stelle, die ein `RevealGuess`-Literal ohne `revealDelayMs` baut (`reveal.spec.ts` in den `layoutGuesses`-Tests) braucht das Feld — dort genügt `revealDelayMs: 0`, weil `layoutGuesses` es nur durchreicht.

- [ ] **Step 8: Redeem the two comments the earlier cut left behind**

In `webapp-vue/src/games/guesshue/HueWheelReveal.vue` den Kopfkommentar anpassen: aus „**That is deliberately less than parity:** … The full statement is the detail table, which is its own cut — until then a known gap beats nothing at all." wird

```
 * `role="img"` with one label for the whole thing — deliberately less than parity: whoever sees
 * the picture also reads how the guesses stand to each other, and the label says only where the
 * solution is. The full statement is the scoreboard under this wheel, which says every guess,
 * every deviation and every score as text.
```

- [ ] **Step 9: Commit**

```bash
cd webapp-vue && pnpm test && pnpm typecheck && pnpm lint
git add webapp-vue/src/games/guesshue
git commit -m "$(cat <<'EOF'
feat(guesshue): put the scoreboard under the wheel and hand both one timetable

`GuessHueGame` was already the one place that turns `unknown` into numbers; now it
also ranks. It hands the wheel a `revealDelayMs` per marker taken straight off the
matching row's tick, so a marker and its row land together and the wheel keeps no
schedule of its own. The markers therefore appear in ranking order -- from the
solution line outwards -- rather than walking around the circle.

A guess the table cannot rank keeps its marker and joins the cascade after every row.
Removing it from the picture because its verdict is junk would be the worse trade.

`HueWheelReveal`'s comment about the aria-label being "deliberately less than parity,
the full statement is the detail table, which is its own cut" is redeemed rather than
left standing: the table is under it now.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Im Browser drehen, und das Gelernte zurückschreiben

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-guess-hue-scoreboard-design.md` (die Testliste nennt eine `GuessHueReveal.spec.ts`, die es nicht gibt)
- Modify: `.claude/guidelines/frontend-ui.md` (nur, wenn im Browser etwas Übertragbares auffällt)

**Interfaces:**
- Consumes: alles.
- Produces: nichts im Code.

- [ ] **Step 1: Open the lab in both phases**

```bash
cd webapp-vue && pnpm dev
```

Das Backend muss laufen (`cd core && ./mvnw spring-boot:run`). Dann im Browser
`/c/<slug>/lab/guess-hue?seed=1&phase=ONE` öffnen, tippen, und dasselbe mit `phase=TWO`.
**Nicht in einer echten Runde prüfen** — dort kostet jeder Versuch einen unwiderruflichen Tipp.
Mindestens einmal mit mehreren Einträgen (im Lab über „Runde zurücksetzen" und wiederholtes Tippen
als verschiedene Dev-Nutzer, siehe `webapp-vue/README.md`).

- [ ] **Step 2: Judge the six things no test can see**

1. Läuft die Schreibmaschine flüssig, oder stottert sie? Wenn sie stottert: zuerst `ROW_STAGGER_MS`
   senken, dann `CELL_STAGGER_MS`.
2. Wirkt der reservierte Platz unter dem Rad zwischen Takt 2 und Takt 3 leer? Der Kopf soll ihn
   früh genug füllen.
3. Landen Marker und Tipp-Zelle sichtbar gleichzeitig?
4. Tragen die Kontraste über echte Spielerfarben — besonders die mittelhellen, wo
   `readableTextColor` kippt?
5. Kürzt ein langer Name mit Ellipsis, statt die Spalten zu sprengen? (`truncate` auf einer
   Tabellenzelle ist der Punkt, an dem `table-fixed` mitspielen muss.)
6. Auf einem 375-px-Viewport: scrollt nichts seitwärts?

- [ ] **Step 3: Turn a constant if one is wrong, and say so in the commit**

Eine geänderte Konstante ist eine Messung, kein Geschmack — die neue Zahl **und** was man gesehen
hat, gehören in die Commit-Message.

- [ ] **Step 4: Fix the spec's test list**

In `docs/superpowers/specs/2026-08-16-guess-hue-scoreboard-design.md`, im Abschnitt „Tests":
`GuessHueReveal.spec.ts` streichen — die Auswertungskarte ist über `GuessHueGame.spec.ts` abgedeckt,
eine eigene Spec-Datei gibt es für sie nicht und dieser Schnitt legt keine an.

- [ ] **Step 5: Feed the knowledge back**

Nach `.claude/guidelines/feeding-knowledge-back.md`: was **übertragbar** ist, kommt in die
Guidelines; Messungen und Post-mortems bleiben in der Commit-Message. Kandidaten aus diesem
Schnitt, jeweils nur aufnehmen, wenn er sich im Browser bestätigt hat:

- `frontend-ui.md`, Abschnitt „Sizing that doesn't do what it looks like": ob `truncate` auf einer
  `<th>` unter `table-fixed` tut, was es soll — und woran es sonst liegt.
- `frontend-ui.md`, Abschnitt „Animation on a phone's main thread": dass eine gestaffelte
  Einblendung über viele Elemente als **CSS-Transition mit inline `transition-delay`** nichts von
  der `Element.animate()`-Falle hat, weil nur eine Klasse kippt.
- Reserviertem Platz den Vorzug vor wachsenden Kästen zu geben, wenn eine Choreografie unter einem
  Element läuft, das stillstehen muss.

- [ ] **Step 6: Commit**

```bash
git add -A docs .claude webapp-vue
git commit -m "$(cat <<'EOF'
docs(guesshue): close the scoreboard's browser gaps and feed the rules back

<hier eintragen, was im Lab tatsächlich zu sehen war, welche Konstante das geändert
hat und warum -- Messungen gehören in den Commit, nicht in die Guidelines>

The spec's test list named a `GuessHueReveal.spec.ts`; there is none. The reveal card
is covered through `GuessHueGame.spec.ts` and this cut kept it that way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```
