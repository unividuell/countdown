# Blockierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Blockierung“ (`copy-blocks`) als siebtes Rundenspiel: ein Blockgebilde exakt nachbauen, oben das Baufeld, darunter die Vorlage, Minecraft-Klänge.

**Architecture:** Ein neues Modulith-Modul `copyblocks` (reine Logik, kein Schema) trägt Blocktypen, Passung, Sichtbarkeitsregel, Generator und Wertung; der Adapter `CopyBlocksGameType` in `game.internal` trägt Params, Ausgänge und Validierung. Im Frontend ein neues Spielverzeichnis `games/copyblocks/` — reine Module (Typen, Feld, Passung, Zwischenstand, Auflösungsansicht, Rangliste, Klangplan) unter einer Three.js-Ansicht, die aus dem Spike portiert wird. Der eine `AudioContext` zieht nach `ui/audio.ts`.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher · Jackson 3 · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4 · Three.js 0.186.

**Spec:** [`docs/superpowers/specs/2026-10-16-blockierung-design.md`](../specs/2026-10-16-blockierung-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Referenz:** Spike-Branch `feature/3d-blocks-game-spike-f3ad04`, Stand `51db7082`. Dateien daraus holt man mit `git show 51db7082:<pfad>` — sie liegen unter `webapp-vue/src/spike/blocks/` und `webapp-vue/src/pages/c/[slug]/spike/bloecke.vue`.

**Entscheidungen dieses Plans** (die Spec überlässt sie dem Bauenden oder schweigt):

1. **Schlüssel des Zwischenstands** aus angemeldetem Spieler (`useAuth`), Fingerabdruck des Payloads und Phase (`awardRule`) — keine neue Prop im Spielvertrag, `RoundCard` und Labor bleiben unberührt. Im Labor ergibt das genau „Spiel, Seed, Phase“: derselbe Seed zieht denselben Payload.
2. **`three` lädt erst mit dem Spiel:** der Registry-Eintrag ist ein `defineAsyncComponent`. Sonst trüge jede Seite ~130 KB gzip mehr.
3. **Ohne WebGL** steht „Dein Gerät kann die 3D-Ansicht nicht zeigen.“ an Stelle der Ansicht.
4. **Wertung durch Stimmenzählen:** jedes Paar (Tipp-Block, Vorlagen-Block) stimmt je Drehung für eine Verschiebung — O(4 · Tipp · Vorlage) statt O(4 · Tipp² · Vorlage). Gleichstand: weniger Drehungen, dann kleinstes `dx`, `dy`, `dz`.
5. **Die 3D-Ansicht entsteht in der Auflösung neu.** Die Kamera (Gieren, Neigen, Zoom) lebt in `CopyBlocksGame` und geht an die neue Ansicht; die Auflösung behält das Feld der Abgabe. So bewegt sich beim Wechsel nichts.
6. **Keine Synthese als Rückfall:** Ein noch nicht dekodiertes Sample bleibt still.
7. **Der Klopfer schwankt nicht:** genau 0,5 Tonhöhe, 0,25 Lautstärke; nur der Hauptklang streut ±5 %.
8. **Der Abgabeknopf** ist ein runder `HoldButton` mit „Abgeben“ darauf, mittig unter der Vorlage.
9. **Das Brett verweigert still**, was der Server ablehnen würde: den 201. Block und Koordinaten mit Betrag über 64.
10. **Golden-Vektoren von Hand** (sieben Fälle), beide Suiten lesen dieselbe Datei.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`, ohne `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit. Branch: `claude/copy-blocks`. Nicht pushen.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — `.claude/guidelines/kotlin.md`.
- **Testing:** kotest-Matcher, mockk; Frontend Vitest + `vi`. **TDD:** erst der fallende Test.
- **Keine redundanten Inline-Kommentare**, kein Grabstein-Kommentar. Kommentare nur, wo sie beim Lesen dieser Zeile einen Fehler verhindern — kurz, *was* und *warum*.
- **Namen:** Spiel-Id `copy-blocks`, Anzeigename `Blockierung`, Modul `copyblocks`, Klassen `CopyBlocks*`. Die Bühne heißt im Code `scene`.
- **Ströme:** alles aus `random.presentation`, in dieser Reihenfolge: Blockzahl, Typenzahl, Vorlage. `scene` und `solution` bleiben unberührt.
- **Feste Zahlen (Spec, wörtlich):**
  - `GRID = 6`; Blockzahl `8..58`; Typenzahl `3..7`; Generator bricht nach `Blockzahl × 300` Versuchen ab.
  - Tipp: `1..200` Blöcke, Koordinaten-Betrag `≤ 64`.
  - Blocktyp-Reihenfolge: `DIRT, BRICKS, LEAVES, PACKED_ICE, STONE, HAY_BALE, LAPIS`.
  - Passung: `vorlage = drehe(tipp, turns) + (dx, dy, dz)`, `drehe((x, y, z), 1) = (z, y, −x)`.
  - Startkamera: Gieren `0.6`, Neigen `0.45`. Tippschwelle `8` CSS-px.
  - Flächenhelligkeit: oben `1`, Seiten `0.62`/`0.82`, unten `0.5` (`FACE_SHADE` aus dem Spike).
  - Ton: Tonhöhe `0.8 · (1 ± 0.05)`, Lautstärke `1` für Setzen und Abbauen; Klopfer `0.5` / `0.25`; Abstand `60 ms`; Vorlauf `50 ms`.
  - Takte: `SOLUTION_DELAY_MS`, `RESULTS_DELAY_MS` aus `games/revealChoreography.ts`, nie eigene Zahlen.
- **Wörtliche Texte:**
  - InfoBox-Kurztext: `Baue die Vorlage nach — Block für Block, exakt.`
  - AwardBox: qualifiziert `Dein Nachbau muss exakt stimmen.`, schnellster `Der exakte Nachbau — und von allen, die ihn haben, die kürzeste Zeit.`
  - Abgabe: Aufschrift `Abgeben`, Label `Nachbau abgeben — gedrückt halten`.
  - Knöpfe: `Rückgängig`, `Alles abreißen`, `Ton`; Hotbar: die Anzeigenamen und `Spitzhacke`.
  - Ohne Darstellung: `Diese Runde lässt sich hier nicht anzeigen.` · Ohne WebGL: `Dein Gerät kann die 3D-Ansicht nicht zeigen.`
  - Ranglisten-Caption: `Alle Tipps der Runde, nach Punkten sortiert`.
- **Keine Zähler:** nirgends eine Blockzahl im Brett.
- **Lizenzen:** Die 15 Samples und `CREDITS.md` kommen unverändert aus dem Spike. Kies ist CC BY-NC 4.0.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Vor `pnpm lint` die geänderten Dateien mit `pnpm exec prettier --write <Dateien>` formatieren.
- **Nicht im Browser-Pane prüfbar:** Halten und Takte laufen über `requestAnimationFrame`, der Pane meldet sich immer als versteckt; WebGL-Gesten brauchen echte Finger. Die Handprobe gehört aufs Handy, im Labor (Task 12).

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Ein Block jenseits der Leitungsgrenzen** (der 201. oder bei Koordinate 65) wird nicht gesetzt, statt einen Tipp zu bauen, den der Server mit 400 ablehnt. → Task 9.
2. **Ein Zwischenstand, der nicht mehr passt** (Typ außerhalb der Runde, kaputtes JSON, doppelte Zelle, alte Version), wird verworfen; das Brett beginnt leer, nichts wirft. → Task 7.
3. **Ein Speicher, der wirft** (privater Modus, voll), lässt das Spiel ohne Zwischenstand weiterlaufen. → Task 7.
4. **Ein Gerät ohne WebGL** zeigt einen Satz statt einer leeren Karte oder eines Absturzes. → Task 8.
5. **Eine Auflösung ohne eigenen Tipp** (Historie) oder mit einem verstümmelten fremden Outcome zeigt die Vorlage bzw. nur das Lesbare, ohne Fehler. → Task 7 (`revealView`, `scoreRows`) und Task 10.

## File Structure

**Backend, neu:**

| Datei | Aufgabe |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/Blocks.kt` | `BlockType`, `Cell`, `Block` |
| `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/Fit.kt` | die Passung und ihre Umkehrung |
| `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksShape.kt` | die Sichtbarkeitsregel |
| `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksGenerator.kt` | die Ziehung der Vorlage |
| `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksJudge.kt` | Wertung: beste Passung, Abweichungen |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CopyBlocksGameType.kt` | der Adapter |
| `shared/copy-blocks/fit.json` | Golden-Vektoren der Passung |

**Backend, geändert:** `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (ein gültiger Tipp), `shared/README.md`.

**Frontend, neu (`webapp-vue/src/games/copyblocks/`):** `blockTypes.ts`, `types.ts`, `field.ts`, `fit.ts`, `view.ts`, `draft.ts`, `reveal.ts`, `scoreboard.ts`, `textures.ts`, `sounds.ts`, `sounds/*.m4a` + `sounds/CREDITS.md`, `BlockScene.vue`, `CopyBlocksRules.vue`, `CopyBlocksBriefing.vue`, `CopyBlocksBoard.vue`, `CopyBlocksScoreboard.vue`, `CopyBlocksReveal.vue`, `CopyBlocksGame.vue`, Tests unter `__tests__/`; dazu `webapp-vue/src/ui/audio.ts`.

**Frontend, geändert:** `games/songsnippet/usePlayback.ts`, `games/registry.ts`, `gamelab/games.ts`, `pages/legal.vue` + `pages/__tests__/legal.spec.ts`, `package.json` + `pnpm-lock.yaml`.

**Doku:** `.claude/guidelines/frontend-state.md`, `.claude/guidelines/frontend-ui.md`, Spec-Status.

Reihenfolge: Modul `copyblocks` (1–3) → Adapter (4) → Ton-Graph (5) → Frontend rein (6–7) → Ansicht, Texturen, Klänge (8) → Brett (9) → Auflösung (10) → Spiel, Registrierung, Rechtliches (11) → Doku (12). Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

**Achtung nach Task 1 (neues Modul):** Spring Modulith liest eine generierte `application-modules.json`; nach einem neuen Modul ist sie veraltet. Deshalb dort `./mvnw clean test` — siehe `.claude/guidelines/modules-and-migrations.md`.

---

### Task 1: `copyblocks` — Blöcke und Passung, mit Golden-Vektoren

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/Blocks.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/Fit.kt`
- Create: `shared/copy-blocks/fit.json`
- Modify: `shared/README.md`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/copyblocks/FitGoldenVectorTest.kt`

**Interfaces:**
- Produces (Paket `org.unividuell.countdown.core.copyblocks`):
  - `enum class BlockType { DIRT, BRICKS, LEAVES, PACKED_ICE, STONE, HAY_BALE, LAPIS }` — die Reihenfolge ist die Ziehung „die ersten N“.
  - `data class Cell(val x: Int, val y: Int, val z: Int)`
  - `data class Block(val x: Int, val y: Int, val z: Int, val type: BlockType)` mit `fun cell(): Cell` — **eine Funktion, keine Property**: eine Property serialisierte Jackson als viertes Feld.
  - `data class Fit(val turns: Int, val dx: Int, val dy: Int, val dz: Int)` mit `fun toTemplate(cell: Cell): Cell`, `fun toGuess(cell: Cell): Cell`, `companion object { val IDENTITY: Fit }`; `init { require(turns in 0..3) }`.

- [ ] **Step 1: Die Golden-Vektoren anlegen**

`shared/copy-blocks/fit.json`:

```json
{
  "version": 1,
  "rule": "template = turn(guess, turns) + (dx, dy, dz); one quarter turn maps (x, y, z) to (z, y, -x)",
  "cases": [
    { "fit": { "turns": 0, "dx": 0, "dy": 0, "dz": 0 }, "guess": [1, 2, 3], "template": [1, 2, 3] },
    { "fit": { "turns": 1, "dx": 0, "dy": 0, "dz": 0 }, "guess": [1, 2, 3], "template": [3, 2, -1] },
    { "fit": { "turns": 2, "dx": 0, "dy": 0, "dz": 0 }, "guess": [1, 2, 3], "template": [-1, 2, -3] },
    { "fit": { "turns": 3, "dx": 0, "dy": 0, "dz": 0 }, "guess": [1, 2, 3], "template": [-3, 2, 1] },
    { "fit": { "turns": 1, "dx": 3, "dy": 0, "dz": -2 }, "guess": [1, 0, 0], "template": [3, 0, -3] },
    { "fit": { "turns": 2, "dx": 5, "dy": 0, "dz": 5 }, "guess": [0, 1, 0], "template": [5, 1, 5] },
    { "fit": { "turns": 3, "dx": -1, "dy": 4, "dz": 2 }, "guess": [2, -1, 5], "template": [-6, 3, 4] }
  ]
}
```

In `shared/README.md` eine Zeile in die Tabelle:

```markdown
| `copy-blocks/fit.json` | How Blockierung's `fit` maps a guess cell onto the template, and back | by hand — seven cases; Kotlin's `Fit` is the source of truth | `FitGoldenVectorTest` **and** `webapp-vue/src/games/copyblocks/__tests__/fit.spec.ts` |
```

- [ ] **Step 2: Den fallenden Test schreiben**

`FitGoldenVectorTest.kt`:

```kotlin
package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.io.File

class FitGoldenVectorTest {

    data class Case(val fit: Fit, val guess: List<Int>, val template: List<Int>)
    data class Vectors(val version: Int, val rule: String, val cases: List<Case>)

    /** Relative to the module directory, Maven's working directory — the file Vitest reads too. */
    private val vectors = jacksonObjectMapper().readValue(File("../shared/copy-blocks/fit.json"), Vectors::class.java)

    private fun cell(xyz: List<Int>) = Cell(x = xyz[0], y = xyz[1], z = xyz[2])

    @Test
    fun `a guess cell lands on the template where the shared vectors say`() {
        vectors.cases.forEach { case -> case.fit.toTemplate(cell(case.guess)) shouldBe cell(case.template) }
    }

    @Test
    fun `and the inverse brings it back`() {
        vectors.cases.forEach { case -> case.fit.toGuess(cell(case.template)) shouldBe cell(case.guess) }
    }

    @Test
    fun `the identity moves nothing`() {
        Fit.IDENTITY.toTemplate(Cell(x = 4, y = -1, z = 9)) shouldBe Cell(x = 4, y = -1, z = 9)
    }
}
```

- [ ] **Step 3: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='FitGoldenVectorTest'`
Expected: Kompilierfehler — `Fit` ist unbekannt.

- [ ] **Step 4: `Blocks.kt` und `Fit.kt` schreiben**

`toTemplate` dreht `turns` Vierteldrehungen, dann verschiebt; `toGuess` verschiebt zurück, dann dreht `(4 − turns) % 4`. KDoc auf `BlockType`: die Reihenfolge ist die Ziehung, die Codes sind die Leitung. KDoc auf `Fit`: die Konvention aus der Spec, wörtlich, und dass `shared/copy-blocks/fit.json` sie pinnt.

- [ ] **Step 5: Laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS, darunter `FitGoldenVectorTest` und `ModularityTests`.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/copyblocks shared core/src/test/kotlin/org/unividuell/countdown/core/copyblocks
git commit -F - <<'EOF'
Add copyblocks with block types and the fit

Blockierung judges a build up to a shift and a quarter turn about the
vertical. The fit says which: template = turn(guess, turns) + d. The
server computes it, the client inverts it to draw the solution in
the player's own view, so the convention is pinned for both runtimes
in shared/copy-blocks/fit.json.

The block types' order is the draw: a round plays the first N.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `copyblocks` — Sichtbarkeitsregel und Generator

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksShape.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksGenerator.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksShapeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksGeneratorTest.kt`

**Interfaces:**
- Consumes: `Cell`, `Block`, `BlockType` (Task 1); `SeededRandom` (`rng`).
- Produces: `object CopyBlocksShape { fun allVisible(cells: Set<Cell>): Boolean }`; `object CopyBlocksGenerator { fun generate(presentation: SeededRandom, grid: Int, count: Int, types: List<BlockType>): List<Block> }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`CopyBlocksShapeTest.kt`:

```kotlin
package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class CopyBlocksShapeTest {

    private fun box(xs: IntRange, ys: IntRange, zs: IntRange): Set<Cell> =
        xs.flatMap { x -> ys.flatMap { y -> zs.map { z -> Cell(x = x, y = y, z = z) } } }.toSet()

    @Test
    fun `a single block and a groove are fully visible`() {
        CopyBlocksShape.allVisible(setOf(Cell(x = 0, y = 0, z = 0))) shouldBe true
        val groove = box(xs = 0..2, ys = 0..0, zs = 0..2) + box(xs = 0..0, ys = 1..1, zs = 0..2) +
            box(xs = 2..2, ys = 1..1, zs = 0..2)
        CopyBlocksShape.allVisible(groove) shouldBe true
    }

    @Test
    fun `a solid cube hides its centre block`() {
        CopyBlocksShape.allVisible(box(xs = 0..2, ys = 0..2, zs = 0..2)) shouldBe false
    }

    @Test
    fun `a hollow cube hides its cavity`() {
        CopyBlocksShape.allVisible(box(xs = 0..2, ys = 0..2, zs = 0..2) - Cell(x = 1, y = 1, z = 1)) shouldBe false
    }

    @Test
    fun `a kinked tunnel reaches the outside but cannot be looked into`() {
        // The elbow (2,1,2) is walled in on all six lines; its tunnel bends at (3,1,2) and leaves at z = 1.
        val walls = setOf(
            Cell(x = 1, y = 1, z = 2), Cell(x = 4, y = 1, z = 2),
            Cell(x = 2, y = 0, z = 2), Cell(x = 2, y = 2, z = 2),
            Cell(x = 2, y = 1, z = 1), Cell(x = 2, y = 1, z = 3),
        )
        CopyBlocksShape.allVisible(walls) shouldBe false
        CopyBlocksShape.allVisible(walls - Cell(x = 2, y = 1, z = 1)) shouldBe true
    }
}
```

`CopyBlocksGeneratorTest.kt`:

```kotlin
package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeLessThan
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class CopyBlocksGeneratorTest {

    private val types = BlockType.entries.take(5)

    private fun generate(seed: Int, count: Int) = CopyBlocksGenerator.generate(
        presentation = SeededRandom.fromSeed(seed), grid = 6, count = count, types = types,
    )

    /** Face-to-face neighbours only: a template must be buildable block by block. */
    private fun connected(cells: Set<Cell>): Boolean {
        val seen = mutableSetOf(cells.first())
        val queue = ArrayDeque(seen)
        while (queue.isNotEmpty()) {
            val c = queue.removeFirst()
            listOf(
                c.copy(x = c.x + 1), c.copy(x = c.x - 1), c.copy(y = c.y + 1),
                c.copy(y = c.y - 1), c.copy(z = c.z + 1), c.copy(z = c.z - 1),
            ).filter { it in cells && seen.add(it) }.forEach(queue::addLast)
        }
        return seen.size == cells.size
    }

    @Test
    fun `every count up to 58 is reached in a cube of six`() {
        listOf(8, 30, 45, 58).forEach { count ->
            (1..50).forEach { seed -> generate(seed = seed, count = count).size shouldBe count }
        }
    }

    @Test
    fun `a template is normalised, inside the cube, one piece, fully visible, of the given types`() {
        (1..50).forEach { seed ->
            val blocks = generate(seed = seed, count = 40)
            val cells = blocks.map { it.cell() }.toSet()

            cells.size shouldBe blocks.size
            listOf(blocks.minOf { it.x }, blocks.minOf { it.y }, blocks.minOf { it.z }) shouldBe listOf(0, 0, 0)
            blocks.maxOf { maxOf(it.x, it.y, it.z) } shouldBeLessThan 6
            connected(cells) shouldBe true
            CopyBlocksShape.allVisible(cells) shouldBe true
            types.containsAll(blocks.map { it.type }) shouldBe true
        }
    }

    @Test
    fun `one seed is one template`() {
        generate(seed = 7, count = 30) shouldBe generate(seed = 7, count = 30)
        (1..10).map { generate(seed = it, count = 30) }.toSet().size shouldBeGreaterThan 1
    }
}
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='CopyBlocksShapeTest,CopyBlocksGeneratorTest'`
Expected: Kompilierfehler.

- [ ] **Step 3: `CopyBlocksShape.allVisible` schreiben**

Übertragung von `allVisible` aus `git show 51db7082:webapp-vue/src/spike/blocks/voxels.ts`: die Außenmaße aus `cells`, dann je Achse jede Linie von beiden Außenflächen nach innen, jede Zelle bis einschließlich zum ersten Block als gesehen markieren; wahr, wenn jede Zelle der Außenmaße gesehen ist. KDoc mit der ASCII-Skizze aus dem Spike und dem Satz der Spec, warum Luft mitzählt.

- [ ] **Step 4: `CopyBlocksGenerator.generate` schreiben**

Die Zugreihenfolge ist Teil der Rundenidentität und steht deshalb hier fest:

```
c = grid / 2
blocks = [Block(c, c, c, presentation.pick(types))]
attempts = 0
while blocks.size < count && attempts < count * 300:
    attempts++
    from = presentation.pick(blocks)
    dir  = presentation.pick(DIRECTIONS)          // +x, −x, +y, −y, +z, −z — in dieser Reihenfolge
    next = from.cell() + dir
    skip, wenn next außerhalb [0, grid)³ oder belegt
    skip, wenn !CopyBlocksShape.allVisible(belegt + next)
    blocks += Block(next, presentation.pick(types))   // der Typ erst nach der Annahme
normalisieren: je Achse das Minimum abziehen
```

Kein erneuter Versuch bei zu wenigen Blöcken — die Spec nimmt die erreichte Zahl.

- [ ] **Step 5: Laufen lassen**

Run: `cd core && ./mvnw test -Dtest='CopyBlocksShapeTest,CopyBlocksGeneratorTest'`
Expected: PASS. Verfehlt ein Seed seine Blockzahl, ist das ein Befund für den Nutzer — der Spike hat 300 von 300 gemessen —, kein Anlass, den Test aufzuweichen.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/copyblocks core/src/test/kotlin/org/unividuell/countdown/core/copyblocks
git commit -F - <<'EOF'
Grow Blockierung templates that can be seen whole

A template is only rebuildable exactly when every cell inside its
box - block and air - sees out along one axis: a hidden cavity is as
unsolvable as a hidden block, and a kinked tunnel is connected to the
outside without being visible. The generator grows face to face from
the cube's centre and keeps a block only while that rule holds.

Ported from the spike, where 8 to 58 blocks always reached their count
in a cube of six.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `copyblocks` — die Wertung

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksJudge.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksJudgeTest.kt`

**Interfaces:**
- Consumes: `Block`, `Cell`, `Fit` (Task 1).
- Produces: `data class Verdict(val correct: Boolean, val fit: Fit, val missing: List<Block>, val extra: List<Block>, val wrongType: List<Block>)`; `object CopyBlocksJudge { fun judge(template: List<Block>, guess: List<Block>): Verdict }`. Alle drei Listen in Vorlagen-Koordinaten: `missing` mit dem Typ der Vorlage, `extra` und `wrongType` mit dem Typ des Tipps; `missing` in der Reihenfolge der Vorlage, die anderen beiden in der des Tipps.

- [ ] **Step 1: Den fallenden Test schreiben**

`CopyBlocksJudgeTest.kt`:

```kotlin
package org.unividuell.countdown.core.copyblocks

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class CopyBlocksJudgeTest {

    /** Asymmetric, every block another type: exactly one fit can be exact. */
    private val template = listOf(
        Block(x = 0, y = 0, z = 0, type = BlockType.DIRT),
        Block(x = 1, y = 0, z = 0, type = BlockType.BRICKS),
        Block(x = 2, y = 0, z = 0, type = BlockType.LEAVES),
        Block(x = 0, y = 1, z = 0, type = BlockType.STONE),
        Block(x = 0, y = 0, z = 1, type = BlockType.LAPIS),
    )

    /** What a player builds who turned and shifted the template by [fit]. */
    private fun built(fit: Fit, blocks: List<Block> = template) =
        blocks.map { b -> fit.toGuess(b.cell()).let { Block(x = it.x, y = it.y, z = it.z, type = b.type) } }

    @Test
    fun `each of the four turns about the vertical, shifted anywhere, is exact`() {
        (0..3).forEach { turns ->
            val fit = Fit(turns = turns, dx = 3, dy = -2, dz = 7)
            CopyBlocksJudge.judge(template = template, guess = built(fit)).let {
                it.correct shouldBe true
                it.fit shouldBe fit
                it.missing.shouldBeEmpty()
                it.extra.shouldBeEmpty()
                it.wrongType.shouldBeEmpty()
            }
        }
    }

    @Test
    fun `tipped over or mirrored is simply wrong`() {
        val tipped = template.map { it.copy(x = -it.y, y = it.x) }
        val mirrored = template.map { it.copy(x = -it.x) }

        CopyBlocksJudge.judge(template = template, guess = tipped).correct shouldBe false
        CopyBlocksJudge.judge(template = template, guess = mirrored).correct shouldBe false
    }

    @Test
    fun `a missing, an extra and a wrong block each land in their list, in template coordinates`() {
        val fit = Fit(turns = 1, dx = 10, dy = 0, dz = -4)
        val guess = built(fit = fit, blocks = template.filterNot { it.type == BlockType.LAPIS })
            .map { if (it.type == BlockType.LEAVES) it.copy(type = BlockType.STONE) else it } +
            built(fit = fit, blocks = listOf(Block(x = 3, y = 0, z = 0, type = BlockType.DIRT)))

        CopyBlocksJudge.judge(template = template, guess = guess).let {
            it.correct shouldBe false
            it.fit shouldBe fit
            it.missing shouldBe listOf(Block(x = 0, y = 0, z = 1, type = BlockType.LAPIS))
            it.wrongType shouldBe listOf(Block(x = 2, y = 0, z = 0, type = BlockType.STONE))
            it.extra shouldBe listOf(Block(x = 3, y = 0, z = 0, type = BlockType.DIRT))
        }
    }

    @Test
    fun `the right shape in the wrong types is no hit`() {
        val guess = template.map { it.copy(type = BlockType.DIRT) }

        CopyBlocksJudge.judge(template = template, guess = guess).let {
            it.correct shouldBe false
            it.wrongType.size shouldBe 4
        }
    }

    @Test
    fun `an empty guess keeps the identity and misses everything`() {
        CopyBlocksJudge.judge(template = template, guess = emptyList()).let {
            it.correct shouldBe false
            it.fit shouldBe Fit.IDENTITY
            it.missing shouldBe template
        }
    }
}
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='CopyBlocksJudgeTest'`
Expected: Kompilierfehler — `CopyBlocksJudge` ist unbekannt.

- [ ] **Step 3: `CopyBlocksJudge.judge` schreiben**

Die Passung durch Stimmenzählen (Entscheidung 4):

```
für turns in 0..3:
    stimmen: Map<Cell, (positionen, typen)>
    für g im Tipp:   r = drehe(g.cell(), turns)
        für t in der Vorlage:   d = t.cell() − r
            stimmen[d].positionen++;  wenn t.type == g.type: stimmen[d].typen++
beste = max nach positionen, dann typen; Gleichstand → weniger turns, dann kleinstes dx, dy, dz
ohne jede Stimme (leerer Tipp): Fit.IDENTITY
correct = tipp.size == vorlage.size && beste.typen == vorlage.size
```

Weil Zellen in Tipp und Vorlage je einmalig sind, ist die Stimmenzahl einer Verschiebung genau die Zahl der Tipp-Blöcke, die auf einem Vorlagen-Block landen. Danach jeden Tipp-Block mit `fit.toTemplate` abbilden: ohne Vorlagen-Block dort → `extra`, mit anderem Typ → `wrongType`; nicht getroffene Vorlagen-Blöcke → `missing`. KDoc: Treffer heißt gleich bis auf Verschiebung und Vierteldrehung um die Hochachse; gekippt oder gespiegelt ist kein Sonderfall, nur falsch.

- [ ] **Step 4: Laufen lassen**

Run: `cd core && ./mvnw test -Dtest='CopyBlocksJudgeTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksJudge.kt core/src/test/kotlin/org/unividuell/countdown/core/copyblocks/CopyBlocksJudgeTest.kt
git commit -F - <<'EOF'
Judge a Blockierung build against its template

The build may stand anywhere and face any way around the vertical:
the best fit over four turns and every shift that lands a guess block
on a template block decides. Exact means equal size and every block
on a block of its type; tipped or mirrored is no special case.

Every guess/template pair votes for one shift per turn, so 200 blocks
against 58 cost 46 400 votes rather than a scan per candidate. The
deviations come back in template coordinates for the reveal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Der Adapter `CopyBlocksGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CopyBlocksGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/CopyBlocksGameTypeTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt` (`aValidGuessFor`)

**Interfaces:**
- Consumes: `BlockType`, `Block`, `Fit` (Task 1); `CopyBlocksGenerator`, `CopyBlocksShape` (Task 2); `CopyBlocksJudge`, `Verdict` (Task 3).
- Produces (Wire-Vertrag fürs Frontend): Game-Id `copy-blocks`; Bühne `null`; Payload `{ grid, types: [code], blocks: [{x, y, z, type}] }`; Lösung `null`; Outcome `{ correct, fit: {turns, dx, dy, dz}, missing, extra, wrongType }` mit Blöcken `{x, y, z, type}`; Tipp `{ blocks: [{x, y, z, type}] }`.
- Kotlin: `data class CopyBlocksParams(val grid: Int, val types: List<BlockType>, val blocks: List<Block>, val timed: Boolean)` — KDoc wörtlich aus der Spec (*Der Zug*); `data class CopyBlocksPayload(val grid: Int, val types: List<BlockType>, val blocks: List<Block>) : GamePayload`; `data class CopyBlocksOutcome(val correct: Boolean, val fit: Fit, val missing: List<Block>, val extra: List<Block>, val wrongType: List<Block>) : GameOutcome`; `@Component class CopyBlocksGameType(private val mapper: ObjectMapper) : GameType<CopyBlocksParams>` mit `companion object { const val GRID = 6; MIN_BLOCKS = 8; MAX_BLOCKS = 58; MIN_TYPES = 3; MAX_GUESS_BLOCKS = 200; MAX_COORDINATE = 64 }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`CopyBlocksGameTypeTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldNotThrowAny
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.copyblocks.Block
import org.unividuell.countdown.core.copyblocks.BlockType
import org.unividuell.countdown.core.copyblocks.CopyBlocksShape
import org.unividuell.countdown.core.copyblocks.Fit
import org.unividuell.countdown.core.game.internal.CopyBlocksGameType
import org.unividuell.countdown.core.game.internal.CopyBlocksOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class CopyBlocksGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val mapper = JsonMapper.builder().build()
    private val game = CopyBlocksGameType(mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun draw(random: GameRandom = random(), phase: Phase = Phase.ONE) = game.draw(
        random = random,
        context = RoundContext(communityId = community, roundNumber = 12, phase = phase),
    )

    private fun tree(value: Any?): JsonNode = mapper.readTree(mapper.writeValueAsString(value))

    private fun guess(json: String) = mapper.readTree(json)

    private fun guessOf(blocks: List<Block>): JsonNode = mapper.valueToTree(mapOf("blocks" to blocks))

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "copy-blocks"
        game.displayName shouldBe "Blockierung"
    }

    @Test
    fun `a round has 8 to 58 blocks of the first 3 to 7 types, as a visible, normalised template`() {
        val drawn = (1..60).map { draw(random = random(presentation = it)) }

        drawn.forEach { params ->
            params.grid shouldBe 6
            params.blocks.size shouldBeInRange 8..58
            params.types.size shouldBeInRange 3..7
            params.types shouldBe BlockType.entries.take(params.types.size)
            params.types.containsAll(params.blocks.map { it.type }) shouldBe true
            listOf(params.blocks.minOf { it.x }, params.blocks.minOf { it.y }, params.blocks.minOf { it.z }) shouldBe
                listOf(0, 0, 0)
            CopyBlocksShape.allVisible(params.blocks.map { it.cell() }.toSet()) shouldBe true
        }
        drawn.map { it.types.size }.toSet() shouldBe (3..7).toSet()
        drawn.map { it.blocks.size }.toSet().size shouldBeGreaterThan 20
    }

    @Test
    fun `everything follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)) shouldBe draw(random = random(presentation = 2))
    }

    @Test
    fun `phase two is timed - one deliberate reveal, scored on the clock`() {
        val one = draw(phase = Phase.ONE)
        val two = draw(phase = Phase.TWO)

        one.timed shouldBe false
        game.requiresReveal(one) shouldBe false
        game.scoresOnDuration(one) shouldBe false
        two.timed shouldBe true
        game.requiresReveal(two) shouldBe true
        game.scoresOnDuration(two) shouldBe true
    }

    @Test
    fun `payload and outcome carry exactly their fields, scene and solution nothing`() {
        val params = draw()
        val payload = tree(game.present(params))
        val outcome = tree(game.judge(params = params, guess = guessOf(params.blocks)).outcome)

        game.scene(params).shouldBeNull()
        game.solution(params).shouldBeNull()
        payload.propertyNames().toSet() shouldBe setOf("grid", "types", "blocks")
        payload.get("types").get(0).asString() shouldBe "DIRT"
        payload.get("blocks").get(0).propertyNames().toSet() shouldBe setOf("x", "y", "z", "type")
        outcome.propertyNames().toSet() shouldBe setOf("correct", "fit", "missing", "extra", "wrongType")
        outcome.get("fit").propertyNames().toSet() shouldBe setOf("turns", "dx", "dy", "dz")
    }

    @Test
    fun `the template turned and shifted is a hit`() {
        val params = draw()
        val fit = Fit(turns = 3, dx = -2, dy = 0, dz = 5)
        val turned = params.blocks.map { b ->
            fit.toGuess(b.cell()).let { Block(x = it.x, y = it.y, z = it.z, type = b.type) }
        }

        game.judge(params = params, guess = guessOf(turned)).let {
            it.qualifies shouldBe true
            it.deviation shouldBe 0.0
            (it.outcome as CopyBlocksOutcome).correct shouldBe true
        }
    }

    @Test
    fun `one block short is a miss, and the outcome names it`() {
        val params = draw()

        game.judge(params = params, guess = guessOf(params.blocks.drop(1))).let {
            it.qualifies shouldBe false
            (it.outcome as CopyBlocksOutcome).missing shouldHaveSize 1
        }
    }

    @Test
    fun `the stored guess is the validated block list and nothing else`() {
        val stored = game.judge(
            params = draw(),
            guess = guess("""{"blocks":[{"x":0,"y":0,"z":0,"type":"DIRT","note":"hi"}],"pasted":[1,2]}"""),
        ).guess.shouldNotBeNull()

        stored.propertyNames().toSet() shouldBe setOf("blocks")
        stored.get("blocks").get(0).propertyNames().toSet() shouldBe setOf("x", "y", "z", "type")
    }

    @Test
    fun `the wire's limits are valid guesses`() {
        val params = draw()
        val most = (0 until 200).joinToString(",") { i ->
            """{"x":${i % 10},"y":${i / 10 % 10},"z":${i / 100},"type":"DIRT"}"""
        }

        shouldNotThrowAny {
            game.judge(params = params, guess = guess("""{"blocks":[{"x":64,"y":-64,"z":0,"type":"LEAVES"}]}"""))
            game.judge(params = params, guess = guess("""{"blocks":[$most]}"""))
        }
    }

    @Test
    fun `a malformed guess is refused before anything is written`() {
        val params = draw().copy(types = BlockType.entries.take(3))
        val block = """{"x":0,"y":0,"z":0,"type":"DIRT"}"""
        val tooMany = (0 until 201).joinToString(",") { i ->
            """{"x":${i % 10},"y":${i / 10 % 10},"z":${i / 100},"type":"DIRT"}"""
        }
        listOf(
            """{}""",
            """{"blocks":[]}""",
            """{"blocks":"DIRT"}""",
            """{"blocks":[$tooMany]}""",
            """{"blocks":[$block,$block]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":"STONE"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":"GLASS"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0,"type":1}]}""",
            """{"blocks":[{"x":65,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"y":-65,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":1.5,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":"3","y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":9999999999,"y":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"z":0,"type":"DIRT"}]}""",
            """{"blocks":[{"x":0,"y":0,"z":0}]}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(json)) }
        }
    }

    @Test
    fun `it is always available`() {
        game.isAvailable(RoundContext(communityId = community, roundNumber = 1, phase = Phase.ONE)) shouldBe true
    }
}
```

In `LabServiceTest.kt`, in `aValidGuessFor` vor dem `else`-Zweig:

```kotlin
        "copy-blocks" -> mapper.readTree("""{"blocks":[{"x":0,"y":0,"z":0,"type":"DIRT"}]}""")
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='CopyBlocksGameTypeTest'`
Expected: Kompilierfehler — `CopyBlocksGameType` ist unbekannt.

- [ ] **Step 3: Den Adapter schreiben**

`draw` in genau dieser Reihenfolge (die Ziehreihenfolge ist Teil der Rundenidentität):

```kotlin
val count = random.presentation.nextIntBetween(min = MIN_BLOCKS, maxInclusive = MAX_BLOCKS)
val types = BlockType.entries.take(
    random.presentation.nextIntBetween(min = MIN_TYPES, maxInclusive = BlockType.entries.size),
)
val blocks = CopyBlocksGenerator.generate(presentation = random.presentation, grid = GRID, count = count, types = types)
```

`timed = context.phase == Phase.TWO`; `requiresReveal = scoresOnDuration = params.timed` (KDoc wie bei `PlacePatchGameType`); `present` gibt `grid`, `types`, `blocks` weiter; `scene` und `solution` bleiben die `null`-Defaults.

`judge` validiert zuerst, dann wertet:
- `blocks` muss ein Array mit `1..MAX_GUESS_BLOCKS` Elementen sein.
- Jedes Element: `x`, `y`, `z` ganzzahlig **und** `canConvertToInt()` (siehe `FindPatternGameType.judge`), Betrag `≤ MAX_COORDINATE`; `type` ein String (`isString`) und einer der Codes in `params.types`.
- Keine Zelle doppelt.
- Sonst `InvalidGuessException` mit einer Nachricht, die Feld und Wert nennt.

Dann `CopyBlocksJudge.judge(template = params.blocks, guess = blocks)` und

```kotlin
Judgement(
    qualifies = verdict.correct,
    deviation = 0.0,
    guess = mapper.valueToTree(mapOf("blocks" to blocks)),
    outcome = CopyBlocksOutcome(/* verdict 1:1 */),
)
```

KDoc auf der Klasse: Blockierung als ankündbares Spiel, `copyblocks` weiß nichts davon; alles aus `presentation`, weil die Vorlage ab dem Aufdecken ohnehin öffentlich ist; die Integritätsdecke (Spec *Integrität*) in einem Satz.

- [ ] **Step 4: Alles laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS — darunter `CopyBlocksGameTypeTest`, `LabServiceTest` (die Schleife über alle Spiele), `LabPointsParityTest`, `ModularityTests`.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/CopyBlocksGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/CopyBlocksGameTypeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt
git commit -F - <<'EOF'
Announce Blockierung as a round game

A template of 8 to 58 blocks in the first 3 to 7 block types has to
be rebuilt exactly. Phase one pays every exact build, phase two needs
the one reveal and pays the fastest - Musterung's rules through
requiresReveal = scoresOnDuration = timed.

Everything is drawn from the presentation stream: the template is the
payload, so nothing about it stays secret after the reveal. The guess
is validated against the wire's limits and stored as the bare block
list; the outcome names the fit and the deviations in template
coordinates for the reveal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Der eine `AudioContext` zieht nach `ui/audio.ts`

**Files:**
- Create: `webapp-vue/src/ui/audio.ts`
- Modify: `webapp-vue/src/games/songsnippet/usePlayback.ts`
- Test: `webapp-vue/src/ui/__tests__/audio.spec.ts`

**Interfaces:**
- Produces: `export function audioGraph(): AudioContext | null` (lazy, ein Exemplar für die App, nie geschlossen; `null` ohne Web Audio) und `export const START_LOOKAHEAD_SECONDS = 0.05`.
- `usePlayback` behält Signatur und Verhalten; es importiert beides, statt `shared`/`graph()`/die Konstante selbst zu halten. Die KDocs von `shared` und `START_LOOKAHEAD_SECONDS` wandern mit.

- [ ] **Step 1: Den fallenden Test schreiben**

`audio.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('audioGraph', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('is null without Web Audio', async () => {
    const { audioGraph } = await import('@/ui/audio')

    expect(audioGraph()).toBeNull()
  })

  it('opens one graph for the whole app', async () => {
    const created: unknown[] = []
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          created.push(this)
        }
      },
    )
    const { audioGraph } = await import('@/ui/audio')

    expect(audioGraph()).toBe(audioGraph())
    expect(created).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/audio.spec.ts`
Expected: FAIL — `@/ui/audio` fehlt.

- [ ] **Step 3: `ui/audio.ts` schreiben, `usePlayback` umstellen**

- [ ] **Step 4: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/ui src/games/songsnippet && pnpm lint && pnpm typecheck`
Expected: PASS — `usePlayback.spec.ts` unverändert grün.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/audio.ts webapp-vue/src/ui/__tests__/audio.spec.ts webapp-vue/src/games/songsnippet/usePlayback.ts
git commit -F - <<'EOF'
Hoist the app's one AudioContext into ui/audio

The audio rule wants one graph for the whole app, never closed, so
short clips play into an output that is already open. It lived
privately in Anspielung's usePlayback; Blockierung's block sounds need
the same graph.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Frontend — Blocktypen, Einengung, Feld, Passung

**Files:**
- Create: `webapp-vue/src/games/copyblocks/blockTypes.ts`, `types.ts`, `field.ts`, `fit.ts`
- Test: `webapp-vue/src/games/copyblocks/__tests__/types.spec.ts`, `field.spec.ts`, `fit.spec.ts`

**Interfaces:**
- Consumes: Wire-Vertrag (Task 4), `shared/copy-blocks/fit.json` (Task 1).
- Produces:
  - `blockTypes.ts`: `BLOCK_CODES` (die sieben Codes in Reihenfolge, `as const`), `type BlockCode`, `type SoundSet = 'stone' | 'grass' | 'gravel' | 'glass'`, `BLOCK_TYPES: Record<BlockCode, { name: string; place: SoundSet; break: SoundSet }>` — Namen und Klänge aus der Spec-Tabelle *Blocktypen*; `isBlockCode(value: unknown): value is BlockCode`.
  - `field.ts`: `type Cell = readonly [number, number, number]`, `interface Box { lo: Cell; hi: Cell }`, `fieldOf(blocks: readonly { x: number; y: number; z: number }[], grid: number): Box`, `templateFieldOf(blocks: readonly { x: number; y: number; z: number }[]): Box`.
  - `fit.ts`: `interface Fit { turns: number; dx: number; dy: number; dz: number }`, `IDENTITY: Fit`, `toTemplate(fit: Fit, cell: Cell): Cell`, `toGuess(fit: Fit, cell: Cell): Cell`. Kopfkommentar nennt `copyblocks/Fit.kt` als Gegenstück.
  - `types.ts`: `GuessBlock { x; y; z; type: BlockCode }`, `CopyBlocksPayload { grid; types: BlockCode[]; blocks: GuessBlock[] }`, `CopyBlocksOutcome { correct: boolean; fit: Fit; missing; extra; wrongType: GuessBlock[] }`, `CopyBlocksGuess { blocks: GuessBlock[] }`; `asCopyBlocksPayload`, `asCopyBlocksOutcome`, `asCopyBlocksGuess` (je `(value: unknown) => … | null`); `MAX_GUESS_BLOCKS = 200`, `MAX_COORDINATE = 64` (die Grenzen des Servers).

- [ ] **Step 1: Die fallenden Tests schreiben**

`types.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  asCopyBlocksGuess,
  asCopyBlocksOutcome,
  asCopyBlocksPayload,
} from '@/games/copyblocks/types'

const DIRT = { x: 0, y: 0, z: 0, type: 'DIRT' }

describe('asCopyBlocksPayload', () => {
  it('keeps a well-formed payload', () => {
    const payload = { grid: 6, types: ['DIRT', 'BRICKS', 'LEAVES'], blocks: [DIRT] }

    expect(asCopyBlocksPayload(payload)).toEqual(payload)
  })

  it('drops an unknown code and a broken block rather than painting them white', () => {
    expect(
      asCopyBlocksPayload({
        grid: 6,
        types: ['DIRT', 'GLASS'],
        blocks: [
          DIRT,
          { x: 1, y: 0, z: 0, type: 'GLASS' },
          { x: Number.NaN, y: 0, z: 0, type: 'DIRT' },
          { x: 1.5, y: 0, z: 0, type: 'DIRT' },
        ],
      }),
    ).toEqual({ grid: 6, types: ['DIRT'], blocks: [DIRT] })
  })

  it('is null without a grid, a type or a block', () => {
    for (const junk of [
      null,
      'x',
      {},
      { grid: 0, types: ['DIRT'], blocks: [DIRT] },
      { grid: 6, types: [], blocks: [DIRT] },
      { grid: 6, types: ['DIRT'], blocks: [] },
    ]) {
      expect(asCopyBlocksPayload(junk)).toBeNull()
    }
  })
})

describe('asCopyBlocksOutcome', () => {
  const OUTCOME = {
    correct: false,
    fit: { turns: 1, dx: 3, dy: 0, dz: -2 },
    missing: [{ x: 0, y: 0, z: 1, type: 'LAPIS' }],
    extra: [],
    wrongType: [{ x: 2, y: 0, z: 0, type: 'STONE' }],
  }

  it('keeps a well-formed outcome', () => {
    expect(asCopyBlocksOutcome(OUTCOME)).toEqual(OUTCOME)
  })

  it('drops junk blocks from the lists', () => {
    expect(asCopyBlocksOutcome({ ...OUTCOME, missing: [{ x: 'a' }, null] })?.missing).toEqual([])
  })

  it('is null for a fit that is no quarter turn or not whole', () => {
    for (const fit of [{ turns: 4, dx: 0, dy: 0, dz: 0 }, { turns: 1, dx: 0.5, dy: 0, dz: 0 }, null]) {
      expect(asCopyBlocksOutcome({ ...OUTCOME, fit })).toBeNull()
    }
    expect(asCopyBlocksOutcome({ ...OUTCOME, correct: 'yes' })).toBeNull()
  })
})

describe('asCopyBlocksGuess', () => {
  it('keeps the blocks and drops what is not one', () => {
    expect(asCopyBlocksGuess({ blocks: [DIRT, { x: 1 }] })).toEqual({ blocks: [DIRT] })
    expect(asCopyBlocksGuess({ blocks: [] })).toBeNull()
    expect(asCopyBlocksGuess(null)).toBeNull()
  })
})
```

`field.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fieldOf, templateFieldOf } from '@/games/copyblocks/field'

describe('fieldOf', () => {
  it('starts as the grid cube', () => {
    expect(fieldOf([], 6)).toEqual({ lo: [0, 0, 0], hi: [5, 5, 5] })
  })

  it('reaches one past the build, sideways and up', () => {
    expect(fieldOf([{ x: 5, y: 5, z: 5 }], 6)).toEqual({ lo: [0, 0, 0], hi: [6, 6, 6] })
    expect(fieldOf([{ x: 0, y: 0, z: 0 }], 6)).toEqual({ lo: [-1, 0, -1], hi: [5, 5, 5] })
  })

  it('lowers the floor to the lowest block, never below it', () => {
    expect(fieldOf([{ x: 2, y: -2, z: 2 }], 6)).toEqual({ lo: [0, -2, 0], hi: [5, 5, 5] })
  })

  it('shrinks back with the build, never below the grid cube', () => {
    expect(fieldOf([{ x: 2, y: 2, z: 2 }], 6)).toEqual({ lo: [0, 0, 0], hi: [5, 5, 5] })
  })
})

describe('templateFieldOf', () => {
  it('lays a floor one cell wider than the footprint, as tall as the template', () => {
    expect(
      templateFieldOf([
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 3, z: 1 },
      ]),
    ).toEqual({ lo: [-1, 0, -1], hi: [3, 3, 2] })
  })
})
```

`fit.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IDENTITY, toGuess, toTemplate } from '@/games/copyblocks/fit'
import type { Fit } from '@/games/copyblocks/fit'

// The file FitGoldenVectorTest asserts against: one side cannot drift without the other going red.
const VECTORS_PATH = '../shared/copy-blocks/fit.json'

type Triple = [number, number, number]
interface Case {
  fit: Fit
  guess: Triple
  template: Triple
}
const vectors = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as { cases: Case[] }

describe('fit', () => {
  it.each(vectors.cases)('maps $guess onto $template', ({ fit, guess, template }) => {
    expect(toTemplate(fit, guess)).toEqual(template)
  })

  it.each(vectors.cases)('maps $template back onto $guess', ({ fit, guess, template }) => {
    expect(toGuess(fit, template)).toEqual(guess)
  })

  it('the identity moves nothing', () => {
    expect(toTemplate(IDENTITY, [4, -1, 9])).toEqual([4, -1, 9])
  })
})
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks`
Expected: FAIL — die Module fehlen.

- [ ] **Step 3: Die vier Module schreiben**

- `fieldOf`: Start `[0, grid − 1]³`; je Block `lo.x ≤ x − 1`, `lo.y ≤ y`, `lo.z ≤ z − 1`, `hi ≥ (x + 1, y + 1, z + 1)` — die Regel aus `field` in `git show 51db7082:webapp-vue/src/pages/c/[slug]/spike/bloecke.vue`. `templateFieldOf` ist dort `templateField`.
- `toGuess`/`toTemplate`: Negieren als `0 - v`, nie `-v` — `-0` aus einer Null bräche `toEqual`, und der dritte Fall der Rückrichtung (`[0, 1, 0]` bei zwei Drehungen) erzeugt genau das.
- Die Einengung: ein Block nur mit ganzzahligen Koordinaten und bekanntem Code; ein Payload ohne `grid ≥ 1`, ohne Typ oder ohne Block ist `null`; ein Outcome ist `null`, wenn `correct` kein Boolean ist oder `fit` nicht vier ganze Zahlen mit `turns` in `0..3` trägt; seine Listen verlieren nur die kaputten Einträge.

- [ ] **Step 4: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/copyblocks
git commit -F - <<'EOF'
Narrow Blockierung's wire and lay out its field

The payload, the outcome and stored guesses arrive as unknown; an
unknown block code falls out instead of drawing a white block. The
build field starts as the grid cube and reaches one past the build.
The fit mirrors Kotlin's and reads the same golden vectors.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Frontend — Zwischenstand, Auflösungsansicht, Rangliste

**Files:**
- Create: `webapp-vue/src/games/copyblocks/draft.ts`, `reveal.ts`, `scoreboard.ts`
- Test: `webapp-vue/src/games/copyblocks/__tests__/draft.spec.ts`, `reveal.spec.ts`, `scoreboard.spec.ts`

**Interfaces:**
- Consumes: `types.ts`, `fit.ts` (Task 6); `formatDuration`, `durationOrder` (`games/durations`), `isProvisional` (`games/awards`), `tickOfRow` (`games/revealChoreography`), `readableTextColor` (`ui/readableTextColor`), `ScoreboardRow` (`games/scoreboardColumns`).
- Produces:
  - `draft.ts`: `draftKey(input: { userId: string; payload: CopyBlocksPayload; timed: boolean }): string` — `copy-blocks:draft:<userId>:<1|2>:<FNV-1a-32 des kanonischen Payloads, hex>`; `deviceStorage(): Storage | null` (der Zugriff auf `window.localStorage` selbst kann werfen); `loadDraft(storage: Storage | null, key: string, types: readonly BlockCode[]): GuessBlock[] | null`; `saveDraft(storage: Storage | null, key: string, blocks: readonly GuessBlock[]): void`; `clearDraft(storage: Storage | null, key: string): void`; `sweepDrafts(storage: Storage | null, keep: string): void` — entfernt die anderen Entwürfe **desselben** Spielers. Gespeichert wird `{"v":1,"blocks":[[x,y,z,"CODE"],…]}`. Jeder Zugriff in `try`/`catch`.
  - `reveal.ts`: `type MarkKind = 'missing' | 'extra' | 'wrongType'`, `type Mark = GuessBlock & { kind: MarkKind }`, `revealView(input: { template: readonly GuessBlock[]; ownFit: Fit | null; shown: CopyBlocksOutcome | null }): { blocks: GuessBlock[]; marks: Mark[] }`.
  - `scoreboard.ts`: `interface ScoreRow extends ScoreboardRow { correct: boolean; durationLabel: string | null; outcome: CopyBlocksOutcome | null }`, `scoreRows(input: { entries: readonly GameEntry[]; awardRule: AwardRule | null; mineUserId: string | null }): ScoreRow[]`, `hasDurations(rows: readonly ScoreRow[]): boolean`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`draft.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, draftKey, loadDraft, saveDraft, sweepDrafts } from '@/games/copyblocks/draft'
import type { CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}
const BUILD: GuessBlock[] = [{ x: 1, y: 0, z: 2, type: 'BRICKS' }]
const KEY = draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('is keyed by player, round and phase', () => {
    expect(KEY.startsWith('copy-blocks:draft:u1:')).toBe(true)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: false })).toBe(KEY)
    expect(draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })).not.toBe(KEY)
    expect(draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })).not.toBe(KEY)
    const other = { ...PAYLOAD, blocks: [{ x: 1, y: 0, z: 0, type: 'DIRT' as const }] }
    expect(draftKey({ userId: 'u1', payload: other, timed: false })).not.toBe(KEY)
  })

  it('gives back what it saved, and nothing once cleared', () => {
    saveDraft(localStorage, KEY, BUILD)
    expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toEqual(BUILD)

    clearDraft(localStorage, KEY)
    expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toBeNull()
  })

  it("sweeps the same player's drafts of other rounds, and nobody else's", () => {
    const old = draftKey({ userId: 'u1', payload: PAYLOAD, timed: true })
    const theirs = draftKey({ userId: 'u2', payload: PAYLOAD, timed: false })
    for (const key of [KEY, old, theirs]) saveDraft(localStorage, key, BUILD)
    localStorage.setItem('infobox:copy-blocks', 'true')

    sweepDrafts(localStorage, KEY)

    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(old)).toBeNull()
    expect(localStorage.getItem(theirs)).not.toBeNull()
    expect(localStorage.getItem('infobox:copy-blocks')).toBe('true')
  })

  it('discards what it cannot read, rather than repairing it', () => {
    for (const raw of [
      '{',
      '"x"',
      JSON.stringify({ v: 2, blocks: [] }),
      JSON.stringify({ v: 1, blocks: [[0, 0, 0, 'STONE']] }),
      JSON.stringify({ v: 1, blocks: [[0.5, 0, 0, 'DIRT']] }),
      JSON.stringify({ v: 1, blocks: [[0, 0, 0, 'DIRT'], [0, 0, 0, 'DIRT']] }),
    ]) {
      localStorage.setItem(KEY, raw)
      expect(loadDraft(localStorage, KEY, PAYLOAD.types)).toBeNull()
      expect(localStorage.getItem(KEY)).toBeNull()
    }
  })

  it('plays on without a storage that works', () => {
    const denied = () => {
      throw new Error('denied')
    }
    const broken = {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
      key: denied,
      clear: denied,
      get length(): number {
        return denied()
      },
    } as unknown as Storage

    expect(() => saveDraft(broken, KEY, BUILD)).not.toThrow()
    expect(() => sweepDrafts(broken, KEY)).not.toThrow()
    expect(() => clearDraft(broken, KEY)).not.toThrow()
    expect(loadDraft(broken, KEY, PAYLOAD.types)).toBeNull()
    expect(loadDraft(null, KEY, PAYLOAD.types)).toBeNull()
  })
})
```

`reveal.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toGuess } from '@/games/copyblocks/fit'
import type { Fit } from '@/games/copyblocks/fit'
import { revealView } from '@/games/copyblocks/reveal'
import type { CopyBlocksOutcome, GuessBlock } from '@/games/copyblocks/types'

const TEMPLATE: GuessBlock[] = [
  { x: 0, y: 0, z: 0, type: 'DIRT' },
  { x: 1, y: 0, z: 0, type: 'BRICKS' },
  { x: 0, y: 1, z: 0, type: 'LEAVES' },
]
const FIT: Fit = { turns: 1, dx: 4, dy: 0, dz: 2 }

/** A template-space block as the player with [fit] sees it. */
function seen(fit: Fit, b: GuessBlock): GuessBlock {
  const [x, y, z] = toGuess(fit, [b.x, b.y, b.z])
  return { x, y, z, type: b.type }
}

function outcome(over: Partial<CopyBlocksOutcome>): CopyBlocksOutcome {
  return { correct: false, fit: FIT, missing: [], extra: [], wrongType: [], ...over }
}

describe('revealView', () => {
  it('without a selection shows the template as it stands', () => {
    expect(revealView({ template: TEMPLATE, ownFit: null, shown: null })).toEqual({
      blocks: TEMPLATE,
      marks: [],
    })
  })

  it('shows a hit as the template in my own coordinates, unmarked', () => {
    expect(
      revealView({ template: TEMPLATE, ownFit: FIT, shown: outcome({ correct: true }) }),
    ).toEqual({ blocks: TEMPLATE.map((b) => seen(FIT, b)), marks: [] })
  })

  it('rebuilds the shown tip from its deviations and marks them', () => {
    const wrong: GuessBlock = { x: 1, y: 0, z: 0, type: 'STONE' }
    const extra: GuessBlock = { x: 2, y: 0, z: 0, type: 'DIRT' }
    const view = revealView({
      template: TEMPLATE,
      ownFit: FIT,
      shown: outcome({ missing: [TEMPLATE[2]!], extra: [extra], wrongType: [wrong] }),
    })

    expect(view.blocks).toEqual([seen(FIT, TEMPLATE[0]!), seen(FIT, wrong), seen(FIT, extra)])
    expect(view.marks).toEqual([
      { ...seen(FIT, TEMPLATE[2]!), kind: 'missing' },
      { ...seen(FIT, extra), kind: 'extra' },
      { ...seen(FIT, wrong), kind: 'wrongType' },
    ])
  })

  it("draws someone else's tip with my own fit, so my view does not turn", () => {
    const theirs = outcome({ fit: { turns: 3, dx: -5, dy: 0, dz: 0 }, missing: [TEMPLATE[0]!] })

    expect(revealView({ template: TEMPLATE, ownFit: FIT, shown: theirs }).blocks).toEqual(
      [TEMPLATE[1]!, TEMPLATE[2]!].map((b) => seen(FIT, b)),
    )
  })
})
```

`scoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hasDurations, scoreRows } from '@/games/copyblocks/scoreboard'

function entry(over: Partial<GameEntry>): GameEntry {
  return {
    userId: 'u',
    username: 'U',
    stage: 0,
    guess: null,
    outcome: null,
    points: null,
    durationMs: null,
    avatar: { bgColorHex: '#336699' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

const HIT = { correct: true, fit: { turns: 0, dx: 0, dy: 0, dz: 0 }, missing: [], extra: [], wrongType: [] }
const MISS = { ...HIT, correct: false, missing: [{ x: 0, y: 0, z: 0, type: 'DIRT' }] }

describe('scoreRows', () => {
  it('ranks points, then hits, then the clock, then the id', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'd', outcome: MISS, points: 0, durationMs: 1000 }),
        entry({ userId: 'c', outcome: HIT, points: 0, durationMs: 9000 }),
        entry({ userId: 'b', outcome: HIT, points: 3, durationMs: 5000 }),
        entry({ userId: 'a', outcome: HIT, points: 0, durationMs: 9000 }),
        entry({ userId: 'e', outcome: HIT, points: null, durationMs: 500 }),
      ],
      awardRule: 'CLOSEST_ONLY',
      mineUserId: null,
    })

    expect(rows.map((row) => row.userId)).toEqual(['b', 'a', 'c', 'd', 'e'])
    expect(rows.map((row) => row.durationLabel)).toEqual(['00:05', '00:09', '00:09', '00:01', '00:00'])
    expect(rows[0]!.outcome).toEqual(HIT)
  })

  it('has no clock in phase one', () => {
    const rows = scoreRows({
      entries: [entry({ outcome: HIT, points: 1 })],
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
    })

    expect(hasDurations(rows)).toBe(false)
  })

  it('reads a junk outcome as no hit with nothing to show', () => {
    const [row] = scoreRows({
      entries: [entry({ outcome: { correct: 'yes' }, points: 0 })],
      awardRule: null,
      mineUserId: null,
    })

    expect(row!.correct).toBe(false)
    expect(row!.outcome).toBeNull()
  })
})
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks`
Expected: FAIL — die drei Module fehlen.

- [ ] **Step 3: Die drei Module schreiben**

- `revealView`: ohne `shown` die Vorlage, keine Marken. Mit `shown`: der Tipp in Vorlagen-Koordinaten ist die Vorlage ohne `missing`-Zellen, an `wrongType`-Zellen mit dem Typ des Tipps, gefolgt von `extra`; Marken in der Reihenfolge `missing`, `extra`, `wrongType`; alles durch `toGuess(ownFit ?? IDENTITY, …)`.
- `scoreRows`: nach dem Muster von `games/placepatch/scoreboard.ts`; `correct` und `outcome` aus `asCopyBlocksOutcome(entry.outcome)`; Sortierung Punkte absteigend (`null` zuletzt), Treffer vor Nicht-Treffern, `durationOrder`, `userId`.
- `draftKey`: der Fingerabdruck über `JSON.stringify([grid, types, blocks.map(b => [b.x, b.y, b.z, b.type])])`.

- [ ] **Step 4: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/copyblocks
git commit -F - <<'EOF'
Keep Blockierung drafts and compute its reveal

A build of 30 to 58 blocks takes minutes on a phone, and a phone may
discard the tab meanwhile; in phase two the server's clock keeps
running. The draft is kept per player, round and phase on the device
and dropped once unreadable rather than repaired.

The reveal rebuilds any player's tip from its deviations in template
coordinates and draws it with the viewer's own inverse fit, so picking
another name never turns the view.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Frontend — Three.js-Ansicht, Texturen, Klänge

**Files:**
- Modify: `webapp-vue/package.json`, `webapp-vue/pnpm-lock.yaml`
- Create: `webapp-vue/src/games/copyblocks/view.ts`, `textures.ts`, `sounds.ts`, `BlockScene.vue`
- Create: `webapp-vue/src/games/copyblocks/sounds/` — die 15 `.m4a` und `CREDITS.md`
- Test: `webapp-vue/src/games/copyblocks/__tests__/sounds.spec.ts`, `BlockScene.spec.ts`

**Interfaces:**
- Consumes: `BlockCode`, `BLOCK_TYPES`, `SoundSet` (Task 6); `Box`, `Cell` (Task 6); `Mark` (Task 7); `audioGraph`, `START_LOOKAHEAD_SECONDS` (Task 5).
- Produces:
  - `view.ts`: `interface Camera { yaw: number; pitch: number; zoom: number }`, `START_CAMERA: Camera = { yaw: 0.6, pitch: 0.45, zoom: 1 }`, `interface Hit { block: Cell | null; place: Cell | null }`, `TAP_SLOP_PX = 8`.
  - `textures.ts`: `blockMaterials(code: BlockCode): MeshBasicMaterial[]`, `iconUrl(code: BlockCode): string`.
  - `sounds.ts`: `interface PlannedSound { set: SoundSet; rate: number; gain: number; offsetS: number }`, `soundPlan(action: 'place' | 'break', code: BlockCode, roll: () => number): PlannedSound[]`, `preloadSounds(): void`, `playSound(action: 'place' | 'break', code: BlockCode): void`; Konstanten `PITCH = 0.8`, `PITCH_SPREAD = 0.05`, `KNOCK_PITCH = 0.5`, `KNOCK_GAIN = 0.25`, `KNOCK_GAP_S = 0.06`.
  - `BlockScene.vue`: Props `blocks: readonly GuessBlock[]`, `field: Box`, `build?: boolean`, `marks?: readonly Mark[]`, `background: string`; `defineModel<Camera>('camera', { required: true })`; Emit `tap: [Hit]`.

- [ ] **Step 1: `three` dazunehmen**

Run: `cd webapp-vue && pnpm add three@^0.186.1 && pnpm add -D @types/three@^0.186.0`
Expected: beide in `package.json` (wie im Spike), Lockfile aktualisiert.

- [ ] **Step 2: Samples und Quellenangaben übernehmen**

```bash
mkdir -p webapp-vue/src/games/copyblocks/sounds
for f in stone1 stone2 stone3 stone4 grass1 grass2 grass3 grass4 gravel1 gravel2 gravel3 gravel4 glass1 glass2 glass3; do
  git show "51db7082:webapp-vue/src/spike/blocks/samples/$f.m4a" > "webapp-vue/src/games/copyblocks/sounds/$f.m4a"
done
git show 51db7082:webapp-vue/src/spike/blocks/samples/CREDITS.md > webapp-vue/src/games/copyblocks/sounds/CREDITS.md
```

In `CREDITS.md` nur das Spike-Vokabular ersetzen: „the spike's block types“ → „Blockierung's block types“. Lizenzen, Autoren, Links bleiben wörtlich.

- [ ] **Step 3: Die fallenden Tests schreiben**

`sounds.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { playSound, preloadSounds, soundPlan } from '@/games/copyblocks/sounds'

describe('soundPlan', () => {
  it('places with one sound of the type, pitched to 0.8 ± 5 %', () => {
    const [low] = soundPlan('place', 'DIRT', () => 0)
    const [high] = soundPlan('place', 'DIRT', () => 1)

    expect(low).toMatchObject({ set: 'gravel', gain: 1, offsetS: 0 })
    expect(low!.rate).toBeCloseTo(0.76)
    expect(high!.rate).toBeCloseTo(0.84)
    expect(soundPlan('place', 'DIRT', () => 0.5)).toHaveLength(1)
  })

  it('breaks with a knock from the place sound, then the break sound', () => {
    const [knock, crack, ...rest] = soundPlan('break', 'PACKED_ICE', () => 0.5)

    expect(knock).toEqual({ set: 'stone', rate: 0.5, gain: 0.25, offsetS: 0 })
    expect(crack).toMatchObject({ set: 'glass', gain: 1, offsetS: 0.06 })
    expect(crack!.rate).toBeCloseTo(0.8)
    expect(rest).toEqual([])
  })
})

describe('without Web Audio', () => {
  it('stays silent rather than failing', () => {
    expect(() => {
      preloadSounds()
      playSound('break', 'STONE')
    }).not.toThrow()
  })
})
```

`BlockScene.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import { START_CAMERA } from '@/games/copyblocks/view'

describe('BlockScene', () => {
  it('says so when the device cannot draw 3D, instead of an empty card', async () => {
    // happy-dom has no WebGL: this is exactly the device that cannot.
    const wrapper = mount(BlockScene, {
      props: {
        blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
        field: { lo: [0, 0, 0], hi: [5, 5, 5] },
        background: '#cfe2f4',
        camera: START_CAMERA,
      },
    })
    await nextTick()

    expect(wrapper.text()).toContain('Dein Gerät kann die 3D-Ansicht nicht zeigen.')
  })
})
```

- [ ] **Step 4: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks/__tests__/sounds.spec.ts src/games/copyblocks/__tests__/BlockScene.spec.ts`
Expected: FAIL — die Module fehlen.

- [ ] **Step 5: `view.ts`, `textures.ts`, `sounds.ts` schreiben**

- `textures.ts`: Port von `git show 51db7082:webapp-vue/src/spike/blocks/textures.ts`, nach `BlockCode` statt Index geschlüsselt; Farben und Muster wie dort, `FACE_SHADE` wörtlich. `iconUrl` liefert `''`, wenn der Canvas keinen 2D-Kontext hat.
- `sounds.ts`: `soundPlan` ist rein. Setzen: `[{ set: place, rate: PITCH · (1 − PITCH_SPREAD + 2 · PITCH_SPREAD · roll()), gain: 1, offsetS: 0 }]`. Abbauen: zuerst `{ set: place, rate: KNOCK_PITCH, gain: KNOCK_GAIN, offsetS: 0 }`, dann `{ set: break, rate: wie beim Setzen, gain: 1, offsetS: KNOCK_GAP_S }`. `playSound` führt den Plan mit `Math.random` aus: je Eintrag eine zufällige Variante der Menge, ein `AudioBufferSourceNode` mit `playbackRate`, ein `GainNode`, gestartet bei `currentTime + START_LOOKAHEAD_SECONDS + offsetS`; dahinter ein Bus (Gain 0,6, Kompressor) wie im Spike. Ohne `audioGraph()` oder ohne dekodierten Puffer: nichts. `preloadSounds` dekodiert alle 15 einmal (`?url`-Importe wie im Spike), ein Fehler hinterlässt `null`. Die Synthese des Spikes entfällt (Entscheidung 6). Ein abgelehntes `resume()` wird mit `console.warn` gemeldet, nie verschluckt.

- [ ] **Step 6: `BlockScene.vue` portieren**

Ausgangspunkt `git show 51db7082:webapp-vue/src/spike/blocks/BlockScene.vue`. **Entfernen:** `aim`, `hold`, `breaking`, `alt`, Fadenkreuz-Logik (`target`, `dist`, `aimed`, `frozen`, `pan`, `repivot`, `showAim`), Geist und Umriss, `fire`, `reset`, Langdruck-Timer, Rechtsklick. **Behalten:** Rendern nur bei Eingaben, `MeshBasicMaterial` aus `blockMaterials`, Boden mit Raster, Käfig nur bei `build`, Marken mit den Farben des Spikes (`missing` gelb, `extra` rot, `wrongType` orange), `cast()` mit `scene.updateMatrixWorld()` und dem Gleichstand Block-vor-Boden, `hitOf`, ein Finger dreht (Neigung begrenzt auf ±(π/2 − 0,01)), zwei Finger und Mausrad zoomen (Zoom in `0.25..4`), Tippen unter `TAP_SLOP_PX` emittiert `tap` — auch ohne `build`, das Brett ignoriert es dort. **Neu:**
- Die Kamera ist das v-model `camera` (`zoom` ersetzt das interne `zoomK`); die lokale Kopie für Züge innerhalb eines Tasks bleibt (siehe Kommentar im Spike).
- `new WebGLRenderer` in `try`/`catch`; scheitert er, steht statt des Canvas `<p>Dein Gerät kann die 3D-Ansicht nicht zeigen.</p>`.
- `webglcontextlost` → `preventDefault()`; `webglcontextrestored` → neu zeichnen aus den Props.
- `onBeforeUnmount`: Renderer `dispose()`, Geometrien und eigene Materialien frei.
- Der Kopfkommentar beschreibt die Gesten ohne Fadenkreuz; kein „SPIKE“ mehr.

- [ ] **Step 7: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/package.json webapp-vue/pnpm-lock.yaml webapp-vue/src/games/copyblocks
git commit -F - <<'EOF'
Draw and sound Blockierung's blocks

One Three.js view, ported from the spike without crosshair, preview
or long press: one finger turns, two zoom, a tap reports the block and
the free cell under it. It renders on input only and says so when the
device has no WebGL.

The blocks play Minecraft's own samples, the only openly licensed ones
(see sounds/CREDITS.md). Breaking knocks first - the place sample at
half pitch and a quarter volume, as Minecraft's hit setting does,
since its hit files themselves belong to Mojang.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Frontend — Regeln, Erklärung, Brett

**Files:**
- Create: `webapp-vue/src/games/copyblocks/CopyBlocksRules.vue`, `CopyBlocksBriefing.vue`, `CopyBlocksBoard.vue`
- Test: `webapp-vue/src/games/copyblocks/__tests__/CopyBlocksBoard.spec.ts`

**Interfaces:**
- Consumes: `BlockScene`, `Camera`, `Hit`, `START_CAMERA` (Task 8); `playSound`, `preloadSounds`, `iconUrl` (Task 8); `fieldOf`, `templateFieldOf` (Task 6); `BLOCK_TYPES`, `MAX_GUESS_BLOCKS`, `MAX_COORDINATE` (Task 6); `loadDraft`, `saveDraft`, `sweepDrafts`, `deviceStorage` (Task 7); `HoldButton`, `RevealCover`, `InfoBox`, `AwardBox` (`ui/`).
- Produces: `CopyBlocksBoard` mit Props `payload: CopyBlocksPayload | null`, `sealed: boolean`, `disabled: boolean`, `draftKey: string | null`, `awardRule: AwardRule | null`, `awardPoints: number | null`; `defineModel<Camera>('camera', { required: true })` — die Kamera des Baufelds; Emits `guess: [CopyBlocksGuess]`, `reveal: []`. `CopyBlocksBriefing` mit `awardRule`, `awardPoints`.

- [ ] **Step 1: Den fallenden Test schreiben**

`CopyBlocksBoard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import CopyBlocksBoard from '@/games/copyblocks/CopyBlocksBoard.vue'
import { loadDraft, saveDraft } from '@/games/copyblocks/draft'
import { playSound } from '@/games/copyblocks/sounds'
import type { CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'
import type { Hit } from '@/games/copyblocks/view'
import { START_CAMERA } from '@/games/copyblocks/view'
import RevealCover from '@/ui/RevealCover.vue'
import { DEFAULT_HOLD_MS } from '@/ui/useHoldProgress'

vi.mock('@/games/copyblocks/sounds', () => ({ preloadSounds: vi.fn(), playSound: vi.fn() }))
vi.mock('@/games/copyblocks/textures', () => ({ iconUrl: () => '', blockMaterials: () => [] }))

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(CopyBlocksBoard, {
    props: {
      payload: PAYLOAD,
      sealed: false,
      disabled: false,
      draftKey: null,
      awardRule: null,
      awardPoints: null,
      camera: START_CAMERA,
      ...over,
    },
    global: { stubs: { BlockScene: true } },
  })
}

type Board = ReturnType<typeof mountBoard>
const buildView = (w: Board) => w.findAllComponents(BlockScene)[0]!
const built = (w: Board) => buildView(w).props('blocks') as GuessBlock[]

async function tap(w: Board, hit: Hit) {
  buildView(w).vm.$emit('tap', hit)
  await nextTick()
}

async function choose(w: Board, label: string) {
  await w.get(`button[aria-label="${label}"]`).trigger('click')
}

describe('CopyBlocksBoard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(playSound).mockClear()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('puts the build field above the template and a hotbar of the round’s types plus the pickaxe', () => {
    const wrapper = mountBoard()
    const [build, template] = wrapper.findAllComponents(BlockScene)

    expect(build!.props('build')).toBe(true)
    expect(build!.props('blocks')).toEqual([])
    expect(template!.props('blocks')).toEqual(PAYLOAD.blocks)
    expect(
      wrapper.findAll('[data-test^="copy-blocks-slot-"]').map((s) => s.attributes('aria-label')),
    ).toEqual(['Erde', 'Ziegel', 'Laub', 'Spitzhacke'])
  })

  it('places the chosen type on the tapped face, with its sound', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, { block: null, place: [2, 0, 3] })
    await choose(wrapper, 'Ziegel')
    await tap(wrapper, { block: [2, 0, 3], place: [2, 1, 3] })

    expect(built(wrapper)).toEqual([
      { x: 2, y: 0, z: 3, type: 'DIRT' },
      { x: 2, y: 1, z: 3, type: 'BRICKS' },
    ])
    expect(vi.mocked(playSound).mock.calls).toEqual([
      ['place', 'DIRT'],
      ['place', 'BRICKS'],
    ])
  })

  it('breaks with the pickaxe only', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [2, 0, 3] })

    await choose(wrapper, 'Spitzhacke')
    await tap(wrapper, { block: [2, 0, 3], place: [2, 1, 3] })

    expect(built(wrapper)).toEqual([])
    expect(vi.mocked(playSound)).toHaveBeenLastCalledWith('break', 'DIRT')
  })

  it('undoes step by step, and clears everything in one undoable step', async () => {
    const wrapper = mountBoard()
    await tap(wrapper, { block: null, place: [0, 0, 0] })
    await tap(wrapper, { block: null, place: [1, 0, 0] })

    await choose(wrapper, 'Alles abreißen')
    expect(built(wrapper)).toEqual([])
    await choose(wrapper, 'Rückgängig')
    expect(built(wrapper)).toHaveLength(2)
    await choose(wrapper, 'Rückgängig')
    expect(built(wrapper)).toEqual([{ x: 0, y: 0, z: 0, type: 'DIRT' }])
  })

  it('refuses a block the server would refuse', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({
      x: i % 10,
      y: Math.floor(i / 10) % 10,
      z: Math.floor(i / 100),
      type: 'DIRT' as const,
    }))
    saveDraft(localStorage, 'k', full)
    const wrapper = mountBoard({ draftKey: 'k' })
    await nextTick()

    await tap(wrapper, { block: null, place: [5, 0, 5] })
    expect(built(wrapper)).toHaveLength(200)

    const empty = mountBoard()
    await tap(empty, { block: null, place: [65, 0, 0] })
    await tap(empty, { block: null, place: [0, -65, 0] })
    expect(built(empty)).toEqual([])
  })

  it('submits the build on a full hold, never an empty one', async () => {
    const wrapper = mountBoard()
    const hold = () => wrapper.get('[data-test="hold-button"]')
    expect(hold().attributes('disabled')).toBeDefined()

    await tap(wrapper, { block: null, place: [2, 0, 3] })
    await hold().trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(DEFAULT_HOLD_MS + 100)

    expect(wrapper.emitted('guess')).toEqual([[{ blocks: [{ x: 2, y: 0, z: 3, type: 'DIRT' }] }]])
  })

  it('mutes, and the device remembers it', async () => {
    const wrapper = mountBoard()

    await choose(wrapper, 'Ton')
    await tap(wrapper, { block: null, place: [2, 0, 3] })

    expect(wrapper.get('button[aria-label="Ton"]').attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('copy-blocks:sound')).toBe('false')
    expect(vi.mocked(playSound)).not.toHaveBeenCalled()
  })

  it('restores a draft and saves every change', async () => {
    saveDraft(localStorage, 'k', [{ x: 1, y: 0, z: 1, type: 'LEAVES' }])
    const wrapper = mountBoard({ draftKey: 'k' })
    await nextTick()
    expect(built(wrapper)).toEqual([{ x: 1, y: 0, z: 1, type: 'LEAVES' }])

    await tap(wrapper, { block: null, place: [2, 0, 2] })

    expect(loadDraft(localStorage, 'k', PAYLOAD.types)).toHaveLength(2)
  })

  it('ignores taps while disabled', async () => {
    const wrapper = mountBoard({ disabled: true })

    await tap(wrapper, { block: null, place: [2, 0, 3] })

    expect(built(wrapper)).toEqual([])
  })

  it('shows no 3D view under the cover, and the cover reveals', async () => {
    const wrapper = mountBoard({ sealed: true, payload: null })

    expect(wrapper.findAllComponents(BlockScene)).toHaveLength(0)
    wrapper.findComponent(RevealCover).vm.$emit('start')

    expect(wrapper.emitted('reveal')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks/__tests__/CopyBlocksBoard.spec.ts`
Expected: FAIL — `CopyBlocksBoard.vue` fehlt.

- [ ] **Step 3: `CopyBlocksRules.vue` und `CopyBlocksBriefing.vue` schreiben**

Nach dem Muster von Platzierung. Briefing: `InfoBox storage-key="copy-blocks"` mit dem Kurztext, darunter die Regeln; `AwardBox game-id="copy-blocks"` mit den beiden Sätzen aus *Global Constraints*. Regeln, wörtlich:

```html
<li>Oben baust du, darunter steht die Vorlage. Ein Finger dreht die Ansicht, zwei Finger oder das Mausrad zoomen.</li>
<li>Tippen setzt einen Block des gewählten Typs auf die getroffene Fläche. Mit der Spitzhacke tippst du einen Block weg.</li>
<li>Wie herum du baust, ist egal — nur oben bleibt oben.</li>
<li>Es zählt nur der exakte Nachbau: jeder Block an seinem Platz, jeder vom richtigen Typ.</li>
<li>Abgegeben wird, indem du den Knopf unter der Vorlage gedrückt hältst.</li>
```

- [ ] **Step 4: `CopyBlocksBoard.vue` schreiben**

Aufbau von oben (Spec *Brett*), kartenbreit wie `PlacePatchBoard` (`-mx-4 -mt-4`):

1. Baufeld: `section` mit `h-[46svh]`, `BlockScene` mit `build`, `blocks = build`, `field = fieldOf(build, payload.grid)`, `v-model:camera`, Hintergrund `#cfe2f4`. Oben rechts drei Knöpfe `size-11` (`Rückgängig`, `Alles abreißen`, `Ton` mit `aria-pressed`), unten die Hotbar — Markup und Klassen aus der Hotbar des Spikes (`flex aspect-square w-11 min-w-0 shrink`), je Slot `data-test="copy-blocks-slot-<CODE>"` bzw. `copy-blocks-slot-PICKAXE`, `aria-pressed` für den gewählten. Icons: `~icons/lucide/undo-2`, `trash-2`, `volume-2`/`volume-x`, `pickaxe`.
2. Vorlage: `section` mit `mx-auto h-[34svh] w-3/4 overflow-hidden rounded-lg`, `BlockScene` ohne `build`, `blocks = payload.blocks`, `field = templateFieldOf(payload.blocks)`, eigene Kamera ab `START_CAMERA`, Hintergrund `#9cc3ea`.
3. Abgabe: `div.relative.mx-auto.size-20` mit `HoldButton` (`color="#171717"`, `label` wie in *Global Constraints*, rund) und darüber `<span class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">Abgeben</span>`; `disabled`, solange gesperrt, versiegelt oder leer.

Versiegelt (`sealed` oder kein `payload`): an Stelle der beiden `BlockScene` zwei leere Flächen gleicher Höhe, das Ganze `inert`, darüber `RevealCover state="ready"` wie bei Platzierung; der `HoldButton` fehlt dann (die Hülle bringt ihren eigenen), sein Platz bleibt. Darunter immer `CopyBlocksBriefing`.

Zustand, aus dem Spike-Seitencode (`place`, `remove`, `commit`, `undo`): `build: GuessBlock[]`, ein Rückgängig-Stapel nur im Speicher, `slot: BlockCode | 'PICKAXE'` ab dem ersten Typ. Ein Tipp tut nichts, wenn `disabled` oder versiegelt; Setzen nur auf eine freie `place`-Zelle mit Beträgen `≤ MAX_COORDINATE` und solange `build.length < MAX_GUESS_BLOCKS`. Ton über `useLocalStorage('copy-blocks:sound', true)`; `preloadSounds()` in `onMounted`.

Zwischenstand: `watch(() => props.draftKey, …, { immediate: true })` — mit Schlüssel: `sweepDrafts`, dann `build = loadDraft(…) ?? []`, Rückgängig leer. `watch(build, …)` speichert unter dem Schlüssel. `deviceStorage()` einmal je Instanz.

- [ ] **Step 5: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/copyblocks
git commit -F - <<'EOF'
Build Blockierung's board

The build field runs card-wide on top, the template stands below at
three quarters width so the strips beside it still scroll the page.
Taps place the chosen type on the face they hit; only the pickaxe
breaks. The hotbar never scrolls: its slots shrink below 44 px on a
narrow phone instead.

The board refuses what the server would refuse, saves its draft after
every change and restores it when the round opens again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Frontend — Auflösung und Rangliste

**Files:**
- Create: `webapp-vue/src/games/copyblocks/CopyBlocksScoreboard.vue`, `CopyBlocksReveal.vue`
- Test: `webapp-vue/src/games/copyblocks/__tests__/CopyBlocksReveal.spec.ts`

**Interfaces:**
- Consumes: `revealView`, `scoreRows`/`ScoreRow`, `hasDurations` (Task 7); `fieldOf` (Task 6); `BlockScene`, `Camera` (Task 8); `RevealScoreboard`, `SOLUTION_DELAY_MS`, `useRevealArming`, `prefersReducedMotion`, `inBackground`.
- Produces: `CopyBlocksScoreboard` mit Props `rows`, `live`, `animate`, `selectedUserId: string | null`, Emit `select: [userId: string]` — der Namensknopf wie in `DedusterScoreboard`, `[mm:ss]` nur mit `hasDurations`. `CopyBlocksReveal` mit Props `payload: CopyBlocksPayload`, `rows: ScoreRow[]`, `mineUserId: string | null`, `myGuess: GuessBlock[] | null`, `myOutcome: CopyBlocksOutcome | null`, `live: boolean`, `animate: boolean`; `defineModel<Camera>('camera', { required: true })`.

- [ ] **Step 1: Den fallenden Test schreiben**

`CopyBlocksReveal.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BlockScene from '@/games/copyblocks/BlockScene.vue'
import CopyBlocksReveal from '@/games/copyblocks/CopyBlocksReveal.vue'
import { fieldOf } from '@/games/copyblocks/field'
import type { ScoreRow } from '@/games/copyblocks/scoreboard'
import type { CopyBlocksOutcome, CopyBlocksPayload, GuessBlock } from '@/games/copyblocks/types'
import { START_CAMERA } from '@/games/copyblocks/view'
import { SOLUTION_DELAY_MS } from '@/games/revealChoreography'

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [
    { x: 0, y: 0, z: 0, type: 'DIRT' },
    { x: 1, y: 0, z: 0, type: 'BRICKS' },
  ],
}
const IDENTITY = { turns: 0, dx: 0, dy: 0, dz: 0 }
const MINE: CopyBlocksOutcome = {
  correct: false,
  fit: IDENTITY,
  missing: [{ x: 1, y: 0, z: 0, type: 'BRICKS' }],
  extra: [],
  wrongType: [],
}
const THEIRS: CopyBlocksOutcome = {
  correct: false,
  fit: IDENTITY,
  missing: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
  extra: [],
  wrongType: [],
}
const MY_GUESS: GuessBlock[] = [{ x: 0, y: 0, z: 0, type: 'DIRT' }]

function row(userId: string, outcome: CopyBlocksOutcome | null): ScoreRow {
  return {
    userId,
    name: userId,
    colorHex: '#336699',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    durationLabel: null,
    outcome,
  }
}

function mountReveal(over: Record<string, unknown> = {}) {
  return mount(CopyBlocksReveal, {
    props: {
      payload: PAYLOAD,
      rows: [row('me', MINE), row('them', THEIRS)],
      mineUserId: 'me',
      myGuess: MY_GUESS,
      myOutcome: MINE,
      live: false,
      animate: false,
      camera: START_CAMERA,
      ...over,
    },
    global: { stubs: { BlockScene: true } },
  })
}

const scene = (w: ReturnType<typeof mountReveal>) => w.getComponent(BlockScene)

describe('CopyBlocksReveal', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the field of the submitted build, so nothing moves at the switch', () => {
    expect(scene(mountReveal()).props('field')).toEqual(fieldOf(MY_GUESS, 6))
  })

  it('marks my own tip at once on a reload', () => {
    expect(scene(mountReveal()).props('marks')).toEqual([{ x: 1, y: 0, z: 0, type: 'BRICKS', kind: 'missing' }])
  })

  describe('live', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
      })
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    })

    it('shows my build as it stood, and the solution at its beat', async () => {
      const wrapper = mountReveal({ animate: true })
      expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)
      expect(scene(wrapper).props('marks')).toEqual([])

      vi.advanceTimersByTime(SOLUTION_DELAY_MS + 100)
      await nextTick()

      expect(scene(wrapper).props('marks')).toHaveLength(1)
    })
  })

  it('preselects my tip; another name shows theirs; tapping it again returns to mine', async () => {
    const wrapper = mountReveal()
    expect(wrapper.get('[data-test="select-me"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual([{ x: 1, y: 0, z: 0, type: 'BRICKS' }])

    await wrapper.get('[data-test="select-them"]').trigger('click')
    expect(scene(wrapper).props('blocks')).toEqual(MY_GUESS)
  })

  it('shows the template as it stands without a tip of my own, nobody selected', () => {
    const wrapper = mountReveal({ myGuess: null, myOutcome: null, mineUserId: null })

    expect(scene(wrapper).props('blocks')).toEqual(PAYLOAD.blocks)
    expect(scene(wrapper).props('marks')).toEqual([])
    expect(wrapper.findAll('[aria-pressed="true"]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks/__tests__/CopyBlocksReveal.spec.ts`
Expected: FAIL — `CopyBlocksReveal.vue` fehlt.

- [ ] **Step 3: `CopyBlocksScoreboard.vue` schreiben**

`RevealScoreboard` mit der Caption aus *Global Constraints*; Spalte `clock` (`[mm:ss]`, `3.5rem`) nur mit `hasDurations`; Namens-Slot als Knopf, Markup aus `DedusterScoreboard.vue` ohne die Marken.

- [ ] **Step 4: `CopyBlocksReveal.vue` schreiben**

- Oben, kartenbreit und genau so hoch wie das Baufeld (`-mx-4 -mt-4 h-[46svh]`): eine `BlockScene` ohne `build`, `v-model:camera`, Hintergrund `#cfe2f4`, `field = fieldOf(myGuess ?? payload.blocks, payload.grid)` — für jede Auswahl dasselbe Feld.
- `selectedUserId` beginnt bei `mineUserId`, wenn `myOutcome` da ist, sonst `null`. `select(u)`: derselbe Name nochmal → zurück zum eigenen (bzw. `null` ohne eigenen); sonst `u`.
- `view = revealView({ template: payload.blocks, ownFit: myOutcome?.fit ?? null, shown })` mit `shown` = Outcome der gewählten Zeile (`myOutcome` für die eigene).
- Takt: `still` wie in `PlacePatchReveal`; `useRevealArming(still, …)` startet im `onArmed` einen `setTimeout(SOLUTION_DELAY_MS)`, der `solved` setzt; `still` setzt es sofort. Vor `solved` gehen `marks` leer an die Ansicht; die Blöcke sind dann genau der eigene Nachbau. Timer beim Unmount löschen.
- Darunter `CopyBlocksScoreboard` an der Stelle der Vorlage; die Rangliste trägt ihren eigenen Takt (`RESULTS_DELAY_MS`).

- [ ] **Step 5: Laufen lassen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/copyblocks
git commit -F - <<'EOF'
Reveal Blockierung in the player's own view

The build field becomes the solution without a camera jump: the
template is drawn through the player's own inverse fit, missing
blocks as yellow ghosts, extra ones red, wrong types orange - at
Musterung's solution beat. The scoreboard takes the template's place;
a name shows that player's tip in the same view, tapping it again
returns to one's own.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Frontend — Spiel, Registrierung, Labor, Rechtliches

**Files:**
- Create: `webapp-vue/src/games/copyblocks/CopyBlocksGame.vue`
- Modify: `webapp-vue/src/games/registry.ts`, `webapp-vue/src/gamelab/games.ts`, `webapp-vue/src/pages/legal.vue`
- Test: `webapp-vue/src/games/copyblocks/__tests__/CopyBlocksGame.spec.ts`, `webapp-vue/src/pages/__tests__/legal.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 6–10; `useAuth` (`auth/useAuth`), `GameEntry`.
- Produces: `CopyBlocksGame` mit dem Spielvertrag aller Spiele (Props wie `DedusterGame`; `skip`/`giveUp` deklariert, nie emittiert; `solution` und `scene` deklariert, nie gelesen). Registry-Eintrag `'copy-blocks': defineAsyncComponent(() => import('./copyblocks/CopyBlocksGame.vue'))` (Entscheidung 2); `labGameList` += `{ id: 'copy-blocks', title: 'Blockierung' }`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`CopyBlocksGame.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CopyBlocksBoard from '@/games/copyblocks/CopyBlocksBoard.vue'
import CopyBlocksGame from '@/games/copyblocks/CopyBlocksGame.vue'
import CopyBlocksReveal from '@/games/copyblocks/CopyBlocksReveal.vue'
import { draftKey, saveDraft } from '@/games/copyblocks/draft'
import type { CopyBlocksPayload } from '@/games/copyblocks/types'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

vi.mock('@/auth/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ user: ref({ id: 'me', isSuperAdmin: false }) }) }
})

const PAYLOAD: CopyBlocksPayload = {
  grid: 6,
  types: ['DIRT', 'BRICKS', 'LEAVES'],
  blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' }],
}
const GUESS = { blocks: [{ x: 0, y: 0, z: 0, type: 'DIRT' as const }] }

function mountGame(over: Record<string, unknown> = {}) {
  return mount(CopyBlocksGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      closed: false,
      sealed: false,
      scene: null,
      ...over,
    },
    global: { stubs: { CopyBlocksBoard: true, CopyBlocksReveal: true } },
  })
}

describe('CopyBlocksGame', () => {
  beforeEach(() => localStorage.clear())

  it('plays on the board, with a draft key for me, this round and its phase', () => {
    const board = mountGame().getComponent(CopyBlocksBoard)

    expect(board.props('draftKey')).toBe(draftKey({ userId: 'me', payload: PAYLOAD, timed: false }))
  })

  it('switches to the reveal once my tip is in, and forgets the draft', async () => {
    const key = draftKey({ userId: 'me', payload: PAYLOAD, timed: false })
    saveDraft(localStorage, key, GUESS.blocks)
    const wrapper = mountGame()

    await wrapper.setProps({ myGuess: GUESS, outcome: { correct: true, fit: { turns: 0, dx: 0, dy: 0, dz: 0 }, missing: [], extra: [], wrongType: [] } })

    expect(wrapper.findComponent(CopyBlocksReveal).exists()).toBe(true)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('hands the build camera on to the reveal', async () => {
    const wrapper = mountGame()
    const turned = { yaw: 2, pitch: -0.3, zoom: 1.7 }
    wrapper.getComponent(CopyBlocksBoard).vm.$emit('update:camera', turned)
    await nextTick()

    await wrapper.setProps({ myGuess: GUESS })

    expect(wrapper.getComponent(CopyBlocksReveal).props('camera')).toEqual(turned)
  })

  it('shows a closed round without a tip of mine as its reveal', () => {
    expect(mountGame({ closed: true }).findComponent(CopyBlocksReveal).exists()).toBe(true)
  })

  it('mounts the board under the cover while sealed', () => {
    const board = mountGame({ sealed: true, payload: null }).getComponent(CopyBlocksBoard)

    expect(board.props('sealed')).toBe(true)
  })

  it('says it cannot render a round without a payload', () => {
    expect(mountGame({ payload: { grid: 'x' } }).text()).toContain(
      'Diese Runde lässt sich hier nicht anzeigen.',
    )
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['copy-blocks']).toBeDefined()
    expect(labGameList).toContainEqual({ id: 'copy-blocks', title: 'Blockierung' })
  })
})
```

In `legal.spec.ts` dazu:

```ts
  it('credits the block sounds of Blockierung, with author and license', () => {
    const wrapper = mount(Legal)
    const html = wrapper.html()

    expect(html).toContain('Klänge in Blockierung')
    for (const author of ['carrigsound', 'Snoman', 'tigersound', 'datasoundsample', 'lsprice', 'cmusounddesign']) {
      expect(html).toContain(author)
    }
    expect(html).toContain('CC BY-NC 4.0')
    for (const link of wrapper.findAll('a[href^="https://freesound.org"]')) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toContain('noopener')
    }
    expect(wrapper.findAll('a[href^="https://freesound.org"]').length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Laufen lassen, scheitern sehen**

Run: `cd webapp-vue && pnpm test src/games/copyblocks/__tests__/CopyBlocksGame.spec.ts src/pages/__tests__/legal.spec.ts`
Expected: FAIL.

- [ ] **Step 3: `CopyBlocksGame.vue` schreiben**

Nach dem Muster von `DedusterGame.vue`: `payload`, `myGuess`, `myOutcome` über die Einengung; `done = closed || myGuess !== null`; `rows = scoreRows(…)`; `live = awardRule === 'CLOSEST_ONLY'`; `hasRevealedLive` wie dort. `camera = ref<Camera>({ ...START_CAMERA })` geht als `v-model:camera` an Brett und Auflösung. `draftKey` aus `useAuth().user.value?.id`, `payload` und `timed = awardRule === 'CLOSEST_ONLY'` — `null` ohne Nutzer oder Payload. `watch([myGuess, draftKey], …, { immediate: true })` löscht den Entwurf, sobald ein eigener Tipp da ist. Vorlage:

- `!sealed && payload === null` → der Satz „Diese Runde lässt sich hier nicht anzeigen.“
- `done && payload` → `CopyBlocksReveal` (`myGuess?.blocks ?? null`, `myOutcome`).
- sonst `CopyBlocksBoard`.

- [ ] **Step 4: Registrieren**

`registry.ts`: Import `defineAsyncComponent` aus `vue`, Eintrag wie unter *Interfaces*, mit einem Satz Kommentar: `three` soll nur laden, wer Blockierung spielt. `gamelab/games.ts`: den Eintrag ans Ende von `labGameList`.

- [ ] **Step 5: `legal.vue` ergänzen**

Den Kopfkommentar anpassen („the only content this page carries“ stimmt nicht mehr — die Seite trägt jetzt auch die Namensnennung der Klänge). Nach dem Datenschutz-Abschnitt:

```html
<div class="space-y-2">
  <h2 class="font-semibold">Klänge in Blockierung</h2>
  <p>
    Die Klänge beim Setzen und Abbauen stammen aus Minecraft; Mojang hat sie aus freien Aufnahmen
    von Freesound bearbeitet. Wir haben sie ins AAC-Format umgewandelt.
  </p>
  <ul class="ms-4 list-disc space-y-1">
    <li>Stein: „Step“ von carrigsound — CC0 1.0</li>
    <li>Gras: „grass1–4“ von Snoman — CC BY 4.0</li>
    <li>Kies: „gravel walking“ von tigersound — CC BY-NC 4.0</li>
    <li>
      Glas: „glass shatter“ von datasoundsample — CC BY 4.0; „gb12“ von lsprice — CC BY 3.0;
      „bm_Glass_Break“ von cmusounddesign — CC BY 4.0
    </li>
  </ul>
</div>
```

Jeder Aufnahmetitel verlinkt seine Freesound-Seite, jede Lizenz ihre Creative-Commons-Seite — URLs aus `sounds/CREDITS.md` (Stein: die erste der fünf Aufnahmen genügt nicht; alle fünf Nummern verlinken, durch Kommas getrennt). Links mit `target="_blank" rel="noopener" class="text-blue-700 underline"` wie die Google-Links.

- [ ] **Step 6: Laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS; der Build legt `three` in einen eigenen Chunk (eine Warnung über dessen Größe ist erwartet und harmlos).

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/games/copyblocks webapp-vue/src/games/registry.ts webapp-vue/src/gamelab/games.ts webapp-vue/src/pages/legal.vue webapp-vue/src/pages/__tests__/legal.spec.ts
git commit -F - <<'EOF'
Render Blockierung in rounds and the lab

The game component keeps the build camera so the reveal opens at the
angle of the submission, and drops the draft once the tip is in. It
loads asynchronously: three.js stays out of the bundle for everyone
who is not playing it.

The legal page names the block sounds' authors and licenses; gravel
is CC BY-NC, which countdown, being non-commercial, may use.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Doku nachziehen, Gesamtlauf, Handprobe

**Files:**
- Modify: `.claude/guidelines/frontend-state.md` (Abschnitt „Sound“)
- Modify: `.claude/guidelines/frontend-ui.md` (Zeile „Watch the tap target“)

- [ ] **Step 1: `frontend-state.md`**

Im Abschnitt `## Sound — a short clip needs the graph, not the <audio> element` den Satz

```markdown
already running. `usePlayback` (`src/games/songsnippet/`) is the worked example.
```

ersetzen durch

```markdown
already running. The context lives in `src/ui/audio.ts` (`audioGraph()`, `START_LOOKAHEAD_SECONDS`);
`usePlayback` (`src/games/songsnippet/`) and Blockierung's `sounds.ts` are the worked examples.
```

- [ ] **Step 2: `frontend-ui.md`**

Unter dem Punkt „Watch the tap target“ anfügen:

```markdown
  One named exception: a strip that must stay whole beats the floor. Blockierung's hotbar
  (`games/copyblocks/CopyBlocksBoard.vue`) never scrolls, so on a narrow phone its up to eight
  slots shrink below 44px (38.6px at 375px).
```

- [ ] **Step 3: Gesamtlauf**

```bash
cd core && ./mvnw clean test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Expected: alles PASS.

- [ ] **Step 4: Commit**

```bash
git add .claude/guidelines/frontend-state.md .claude/guidelines/frontend-ui.md
git commit -F - <<'EOF'
Record the shared audio graph and the hotbar rule

The app's one AudioContext now lives in ui/audio, and Blockierung's
hotbar is the named exception to the 44 px tap floor: a strip that
must stay whole shrinks its slots instead of scrolling.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Die Handprobe übergeben**

Nicht im Browser-Pane prüfbar (siehe *Global Constraints*). Dem Nutzer als Liste für das Labor am Handy übergeben, mit Seed- und Phasen-Links:

1. Setzen, Abbauen, Drehen, Zoomen in beiden Ansichten; Seitenscrollen über die Streifen neben der Vorlage.
2. Die Hotbar bei sieben Typen auf dem schmalsten Handy — scrollt nicht.
3. Neu laden mitten im Bau (beide Phasen) — der Nachbau steht wieder, Rückgängig ist leer.
4. Abgeben: nichts bewegt sich, bei `SOLUTION_DELAY_MS` erscheinen Geister und Marken, dann die Rangliste; ein fremder Name zeigt dessen Tipp im selben Blickwinkel.
5. Zu stimmen: Übergang (gleicher Blickwinkel oder Drehbewegung), Breite der Vorlage, Tippschwelle, Takte, Abstand zwischen Klopfer und Abbau-Klang (Startwert 60 ms).
