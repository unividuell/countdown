# Musterung („Find Pattern“) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Farbmuster in einem 8×14-Gitter aus vier fast gleichen Graustufen finden — Spielfeld und Suchmuster als server-gerenderte PNGs im Payload, in Phase zwei mit einmaligem Aufdecken und Zeitwertung.

**Architecture:** Ein neues, rein rechnendes Modul `findpattern` (Zug, Palette, PNG-Rendering) plus der Adapter `FindPatternGameType` in `game.internal`. Das Framework lernt Zeitwertung: für ein Spiel mit `requiresReveal` ist `deviation` die Dauer zwischen Aufdecken und Guess, und `durationMs` wird auf den Play-DTOs veröffentlicht. Im Frontend rendert ein `PatternGrid` das Board-PNG mit einem transparenten Zell-Overlay und einer Liste Markierungen — dieselbe Darstellung für Board und Reveal.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 / Java 25 · `java.awt` + `ImageIO` (JDK, kein neues Dependency) · JUnit 5 + kotest + mockk + Testcontainers · Vue 3 + TypeScript strict + Tailwind v4 + Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-24-musterung-design.md`](../specs/2026-08-24-musterung-design.md)

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch** mit `„…“`-Anführungszeichen, nie `"`. Spec/Plan deutsch.
- **Named arguments ab zwei Argumenten** an jedem Kotlin-Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix).
- **Testing:** kotest-Matcher, mockk, MockMvc Kotlin DSL, Testcontainers. Frontend: Vitest `vi`, nie kotest. TDD: erst der fallende Test.
- **Keine Migration, keine Tabelle, kein neues Dependency** in diesem Plan.
- **Modulgrenzen:** `ModularityTests.verify()` muss grün bleiben. Pfeil einbahnig `game → findpattern`; `findpattern` importiert **nie** aus `game`.
- **Keine redundanten Inline-Kommentare** — Kommentare nur für Constraints, die der Code nicht zeigen kann.
- **Feste Spielmaße:** `COLS = 8`, `ROWS = 14`, `PATTERN_LENGTH = 4`, `PALETTE_SIZE = 4`, `BLOCK_COUNT = 112`, `LAST_START_INDEX = 108`, `BOARD_BLOCK_PX = 24`, `PATTERN_BLOCK_PX = 48`, `delta ∈ [0.10, 0.20]`.
- **Game-ID `find-pattern`**, Anzeigename `„Musterung“`, Modul `findpattern`, Klassen `FindPattern*`.
- **Der Client bekommt vor der Auflösung keinen Farbwert.** Payload sind genau fünf Felder: `cols`, `rows`, `patternLength`, `boardImage`, `patternImage`. Jede Erweiterung braucht eine Änderung am Feldset-Test und eine Begründung in der Spec.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`. Nach jeder Frontend-Task: `pnpm lint && pnpm typecheck && pnpm test`.

## File Structure

**Backend — neues Modul `findpattern`** (`core/src/main/kotlin/org/unividuell/countdown/core/findpattern/`)

| Datei | Verantwortung |
|---|---|
| `FindPatternLayout.kt` | Die Maße als einziger Ort: Spalten, Zeilen, Musterlänge, Blockgrößen, Delta-Grenzen. |
| `FindPatternBoard.kt` | Der Zug: Blöcke, Delta, Startindex — und die reine Suche nach allen Vorkommen. |
| `FindPatternPalette.kt` | Vier Graustufen aus Referenzpunkt und Delta, chroma-js-treu über L\*. |
| `FindPatternImages.kt` | Board- und Muster-PNG als `data:`-URI. |

**Backend — Adapter und Framework** (`core/src/main/kotlin/org/unividuell/countdown/core/game/`)

| Datei | Änderung |
|---|---|
| `internal/FindPatternGameType.kt` | neu: Params, Payload, Outcome, Solution, Adapter. |
| `internal/PlayDuration.kt` | neu: die eine Dauer-Arithmetik, von `PlayService` und `RoundResponses` geteilt. |
| `internal/PlayService.kt` | `deviation` = Dauer, wenn das Spiel ein Aufdecken verlangt. |
| `internal/RoundDtos.kt` | `durationMs` auf `MyPlayDto` und `OtherPlayDto`. |
| `internal/RoundResponses.kt` | füllt `durationMs`, wenn `requiresReveal`. |

**Backend — Labor** (`core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/`): `LabRoundStore.kt` (Öffnungsstempel + `LabEntry.durationMs`), `LabService.kt` (Stempel setzen, `deviation`-Override, DTO füllen), `LabDtos.kt` (`durationMs`).

**Frontend** (`webapp-vue/src/`)

| Datei | Verantwortung |
|---|---|
| `games/revealChoreography.ts` | neu, hochgezogen aus `games/guesshue/reveal.ts`: Beats und Kaskaden-Arithmetik für alle Spiele. |
| `ui/InfoBox.vue` | neu: einklappbare Erklär-Card, Zustand in `localStorage`, Inhalt per Slot. |
| `games/findpattern/types.ts` | Wire-Typen und Narrowing für Payload, Solution, Guess. |
| `games/findpattern/selection.ts` | Die Auswahlregeln als pure Index-Arithmetik. |
| `games/findpattern/marks.ts` | Outline-Stapel und Zahl-Sichtbarkeit als pure Funktionen. |
| `games/findpattern/scoreboard.ts` | Zeilen, Sortierung, `mm:ss`. |
| `games/findpattern/PatternGrid.vue` | Bild + Zell-Overlay + Markierungen. Board und Reveal teilen sie. |
| `games/findpattern/FindPatternBoard.vue` | Spielfläche, Muster-Bild, Erklär-Card, Auswahl → `guess`. |
| `games/findpattern/FindPatternScoreboard.vue` | Die Tabelle samt Lösungs-Chips. |
| `games/findpattern/FindPatternReveal.vue` | Reveal-Gitter, Palette, Scoreboard, Choreographie. |
| `games/findpattern/FindPatternGame.vue` | Narrowing und Umschalten Board ↔ Reveal. |
| `rounds/RoundCard.vue` | Das `sealed`-Face sagt, was der Klick kostet. |
| `games/GameEntry.ts`, `api/types.ts`, `gamelab/types.ts` | `durationMs`. |
| `games/registry.ts`, `gamelab/games.ts` | `find-pattern` eintragen. |

---

### Task 1: `findpattern` — Maße, Zug und Möglichkeiten

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternLayout.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternBoard.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternBoardTest.kt`

**Interfaces:**
- Produces: `FindPatternLayout.{COLS, ROWS, PATTERN_LENGTH, PALETTE_SIZE, BLOCK_COUNT, LAST_START_INDEX, DELTA_MIN, DELTA_MAX}`; `FindPatternBoard.blocks(presentation: SeededRandom): List<Int>`, `FindPatternBoard.delta(presentation: SeededRandom): Double`, `FindPatternBoard.patternStartIndex(solution: SeededRandom): Int`, `FindPatternBoard.patternAt(blocks: List<Int>, startIndex: Int): List<Int>`, `FindPatternBoard.matches(blocks: List<Int>, pattern: List<Int>): List<Int>`.
- Consumes: `org.unividuell.countdown.core.rng.SeededRandom` — `nextInt(boundExclusive: Int): Int`, `nextDouble(): Double`.

- [ ] **Step 1: Den fallenden Test schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternBoardTest.kt`:

```kotlin
package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.doubles.shouldBeGreaterThanOrEqual
import io.kotest.matchers.doubles.shouldBeLessThanOrEqual
import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThanOrEqual
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class FindPatternBoardTest {

    @Test
    fun `the board is 112 blocks of four tones`() {
        val blocks = FindPatternBoard.blocks(SeededRandom.fromSeed(4711))

        blocks shouldHaveSize FindPatternLayout.BLOCK_COUNT
        blocks.forEach {
            it shouldBeGreaterThanOrEqual 0
            it shouldBeLessThanOrEqual FindPatternLayout.PALETTE_SIZE - 1
        }
        blocks.distinct() shouldHaveSize FindPatternLayout.PALETTE_SIZE
    }

    @Test
    fun `the same seed draws the same board`() {
        FindPatternBoard.blocks(SeededRandom.fromSeed(99)) shouldBe
            FindPatternBoard.blocks(SeededRandom.fromSeed(99))
    }

    @Test
    fun `delta stays inside the calibrated window`() {
        for (seed in 1..200) {
            val delta = FindPatternBoard.delta(SeededRandom.fromSeed(seed))
            delta shouldBeGreaterThanOrEqual FindPatternLayout.DELTA_MIN
            delta shouldBeLessThanOrEqual FindPatternLayout.DELTA_MAX
        }
    }

    @Test
    fun `a start index always leaves room for the whole pattern`() {
        for (seed in 1..200) {
            val start = FindPatternBoard.patternStartIndex(SeededRandom.fromSeed(seed))
            start shouldBeGreaterThanOrEqual 0
            start shouldBeLessThanOrEqual FindPatternLayout.LAST_START_INDEX
        }
    }

    /**
     * The original clamped an out-of-range candidate onto the last index, which made that one
     * position more likely than every other. Drawing inside the range instead must spread out.
     */
    @Test
    fun `the last start index is not more likely than the others`() {
        val drawn = (1..2000).map { FindPatternBoard.patternStartIndex(SeededRandom.fromSeed(it)) }

        val onLast = drawn.count { it == FindPatternLayout.LAST_START_INDEX }
        onLast shouldBeLessThanOrEqual 2000 / FindPatternLayout.LAST_START_INDEX
    }

    @Test
    fun `the pattern is the run of four at the start index`() {
        val blocks = List(FindPatternLayout.BLOCK_COUNT) { it % 4 }

        FindPatternBoard.patternAt(blocks = blocks, startIndex = 5) shouldContainExactly
            listOf(1, 2, 3, 0)
    }

    @Test
    fun `every occurrence of the pattern is a possibility, wrapped rows included`() {
        val blocks = MutableList(FindPatternLayout.BLOCK_COUNT) { 0 }
        // Two runs: one inside a row, one straddling the row boundary at index 8.
        listOf(2, 3, 4, 5).forEachIndexed { offset, index -> blocks[index] = listOf(1, 2, 3, 1)[offset] }
        listOf(6, 7, 8, 9).forEachIndexed { offset, index -> blocks[index] = listOf(1, 2, 3, 1)[offset] }

        FindPatternBoard.matches(blocks = blocks, pattern = listOf(1, 2, 3, 1)) shouldContainExactly
            listOf(2, 6)
    }

    @Test
    fun `a pattern that occurs nowhere has no possibility`() {
        val blocks = List(FindPatternLayout.BLOCK_COUNT) { 0 }

        FindPatternBoard.matches(blocks = blocks, pattern = listOf(1, 2, 3, 1)) shouldHaveSize 0
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternBoardTest`
Expected: FAIL — `Unresolved reference: FindPatternBoard`.

- [ ] **Step 3: Layout und Zug implementieren**

`FindPatternLayout.kt`:

```kotlin
package org.unividuell.countdown.core.findpattern

/**
 * The board's measurements, in one place because four files derive from them: the draw, the palette,
 * the two images and the payload the client lays its cell grid out from.
 *
 * The numbers are the original's (`utils/find-pattern-game-attributes.ts`). Eight columns in
 * portrait is what makes a block big enough to tap on a phone.
 */
object FindPatternLayout {
    const val COLS = 8
    const val ROWS = 14
    const val PATTERN_LENGTH = 4
    const val PALETTE_SIZE = 4

    const val BLOCK_COUNT = COLS * ROWS
    const val LAST_START_INDEX = BLOCK_COUNT - PATTERN_LENGTH

    /**
     * How far apart the lightest and the darkest tone sit on the ramp — the difficulty.
     * Calibrated by playing the original: 0.2 is easy, 0.12 medium, 0.1 hard.
     */
    const val DELTA_MIN = 0.10
    const val DELTA_MAX = 0.20
}
```

`FindPatternBoard.kt`:

```kotlin
package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.BLOCK_COUNT
import org.unividuell.countdown.core.findpattern.FindPatternLayout.DELTA_MAX
import org.unividuell.countdown.core.findpattern.FindPatternLayout.DELTA_MIN
import org.unividuell.countdown.core.findpattern.FindPatternLayout.LAST_START_INDEX
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PALETTE_SIZE
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PATTERN_LENGTH
import org.unividuell.countdown.core.rng.SeededRandom

/**
 * The round's board and where the sought run hides in it.
 *
 * Which stream each value comes from is the caller's decision and a load-bearing one — the
 * parameter names say it: the board is shown, so it is drawn from the presentation stream; the
 * start index is the answer and comes from the solution stream. See `GameRandom`.
 */
object FindPatternBoard {

    fun blocks(presentation: SeededRandom): List<Int> =
        List(BLOCK_COUNT) { presentation.nextInt(PALETTE_SIZE) }

    fun delta(presentation: SeededRandom): Double =
        DELTA_MIN + presentation.nextDouble() * (DELTA_MAX - DELTA_MIN)

    fun patternStartIndex(solution: SeededRandom): Int = solution.nextInt(LAST_START_INDEX + 1)

    fun patternAt(blocks: List<Int>, startIndex: Int): List<Int> =
        blocks.subList(startIndex, startIndex + PATTERN_LENGTH)

    /**
     * Every start index whose run equals [pattern] — the round's „Möglichkeiten“. Index arithmetic
     * only, which is why a run may straddle a row boundary: the board is read like a book, and a
     * row is a display decision.
     */
    fun matches(blocks: List<Int>, pattern: List<Int>): List<Int> =
        (0..blocks.size - pattern.size).filter { start ->
            pattern.indices.all { blocks[start + it] == pattern[it] }
        }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternBoardTest`
Expected: PASS, 8 Tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/findpattern core/src/test/kotlin/org/unividuell/countdown/core/findpattern
git commit -m "feat(findpattern): draw the board, find every occurrence of its pattern"
```

---

### Task 2: `findpattern` — die Palette

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternPalette.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternPaletteTest.kt`

**Interfaces:**
- Consumes: `FindPatternLayout.PALETTE_SIZE`.
- Produces: `FindPatternPalette.of(reference: Double, delta: Double): List<String>` — vier `#rrggbb`-Strings, hell nach dunkel bzw. umgekehrt, je nach Referenzlage.

- [ ] **Step 1: Die Golden Values aus chroma-js holen**

Das Referenzprojekt hat chroma-js installiert. Skript ablegen und ausführen (Dateiendung `.cjs`, damit Node CommonJS nimmt, unabhängig vom `type` der `package.json`):

```bash
cat > /tmp/palette-golden.cjs <<'JS'
const chroma = require('chroma-js')
const SIZE = 4
function palette(reference, delta) {
  const half = delta / 2
  let ref = reference
  if (ref + half > 1) ref = 1 - half
  if (ref - half < 0) ref = half
  const f = chroma.scale()
  return chroma.scale([f(ref - half), f(ref + half)]).mode('lch').colors(SIZE)
}
for (const [ref, delta] of [[0.5, 0.1], [0.5, 0.2], [0.2, 0.12], [0.05, 0.2], [0.97, 0.1]]) {
  console.log(ref, delta, JSON.stringify(palette(ref, delta)))
}
JS
cd /opt/unividuell/projects/huettehuette.unividuell.org && node /tmp/palette-golden.cjs
```

Die fünf ausgegebenen Zeilen sind die erwarteten Werte für Step 2. Trage sie dort **wörtlich** ein
(chroma gibt Hex in Kleinbuchstaben aus).

- [ ] **Step 2: Den fallenden Test schreiben**

`FindPatternPaletteTest.kt` — die `EXPECTED`-Literale aus Step 1 einsetzen:

```kotlin
package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

/**
 * The palette is a port of chroma-js, not a new idea: the original's difficulty values were
 * calibrated against its output, so they only keep their meaning while the tones match. The golden
 * values below come from chroma-js itself (see the plan's Task 2, step 1).
 *
 * If a channel comes out one off, a constant is wrong — do not widen this into a tolerance. The
 * Lab conversion has to match chroma's `LAB_CONSTANTS`, including its non-standard `t0..t3`.
 */
class FindPatternPaletteTest {

    private val expected = mapOf(
        (0.5 to 0.1) to listOf("#8c8c8c", "#848484", "#7c7c7c", "#747474"),
        (0.5 to 0.2) to listOf("#999999", "#898989", "#797979", "#696969"),
        (0.2 to 0.12) to listOf("#c6c6c6", "#bbbbbb", "#b0b0b0", "#a5a5a5"),
        (0.05 to 0.2) to listOf("#ffffff", "#e8e8e8", "#d2d2d2", "#bcbcbc"),
        (0.97 to 0.1) to listOf("#2f2f2f", "#232323", "#161616", "#000000"),
    )

    @Test
    fun `it reproduces chroma-js for every calibrated pair`() {
        for ((input, tones) in expected) {
            val (reference, delta) = input
            FindPatternPalette.of(reference = reference, delta = delta) shouldBe tones
        }
    }

    @Test
    fun `it always yields four distinct greys`() {
        for (step in 0..100) {
            val tones = FindPatternPalette.of(reference = step / 100.0, delta = 0.1)
            tones shouldHaveSize FindPatternLayout.PALETTE_SIZE
            tones.distinct() shouldHaveSize FindPatternLayout.PALETTE_SIZE
        }
    }

    /** A reference at either end is pulled inwards so the window never leaves the ramp. */
    @Test
    fun `a reference at the edge is clamped, not clipped`() {
        FindPatternPalette.of(reference = 0.0, delta = 0.2) shouldBe
            FindPatternPalette.of(reference = 0.1, delta = 0.2)
        FindPatternPalette.of(reference = 1.0, delta = 0.2) shouldBe
            FindPatternPalette.of(reference = 0.9, delta = 0.2)
    }
}
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternPaletteTest`
Expected: FAIL — `Unresolved reference: FindPatternPalette`.

- [ ] **Step 4: Die Palette implementieren**

```kotlin
package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.PALETTE_SIZE
import kotlin.math.cbrt
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Four greys, `delta` apart on the white→black ramp, interpolated in L\* between the two ends.
 *
 * A port of the original's grey-scale mode (`useFindPatternGameColor`, branch `distance <= 1`), and
 * deliberately a faithful one: the difficulty values in `FindPatternLayout` were calibrated by
 * playing against chroma-js's output, so the tones have to be chroma's tones. That is also why the
 * constants below are chroma's own `LAB_CONSTANTS` rather than the textbook CIE ones — chroma
 * approximates the linear segment with `t0..t3`, and a "more correct" formula here would move
 * every tone by a channel or two and quietly recalibrate the game.
 *
 * Interpolating in LCH reduces to interpolating L\* because a grey has no chroma and no hue, so the
 * four steps are perceptually even — which is the whole point at a delta of 0.1.
 *
 * `pow`/`cbrt` are fine here: this runs on the JVM only, and no browser recomputes it (see
 * cross-runtime-parity.md). The client is handed the finished hex strings.
 */
object FindPatternPalette {

    fun of(reference: Double, delta: Double): List<String> {
        val half = delta / 2
        val centre = reference.coerceIn(minimumValue = half, maximumValue = 1.0 - half)
        val from = lightnessOfRamp(centre - half)
        val to = lightnessOfRamp(centre + half)
        return (0 until PALETTE_SIZE).map { step ->
            hexOfLightness(from + (to - from) * step / (PALETTE_SIZE - 1))
        }
    }

    /** `chroma.scale()` with no arguments is white→black, interpolated in RGB. */
    private fun lightnessOfRamp(position: Double): Double = lightnessOf(255.0 * (1.0 - position))

    private fun lightnessOf(channel: Double): Double {
        val y = linear(channel / 255.0)
        return 116.0 * xyzToLab(y) - 16.0
    }

    private fun hexOfLightness(lightness: Double): String {
        val y = labToXyz((lightness + 16.0) / 116.0)
        val channel = (gamma(y) * 255.0).roundToInt().coerceIn(minimumValue = 0, maximumValue = 255)
        val hex = channel.toString(radix = 16).padStart(length = 2, padChar = '0')
        return "#$hex$hex$hex"
    }

    private fun linear(channel: Double): Double =
        if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)

    private fun gamma(value: Double): Double =
        if (value <= 0.00304) 12.92 * value else 1.055 * value.pow(1.0 / 2.4) - 0.055

    private fun xyzToLab(t: Double): Double = if (t > T3) cbrt(t) else t / T2 + T0

    private fun labToXyz(t: Double): Double = if (t > T1) t * t * t else T2 * (t - T0)

    // chroma-js LAB_CONSTANTS — its own approximation of the linear segment, kept bit-for-bit.
    private const val T0 = 0.137931034
    private const val T1 = 0.206896552
    private const val T2 = 0.12841855
    private const val T3 = 0.008856452
}
```

- [ ] **Step 5: Test laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternPaletteTest`
Expected: PASS, 3 Tests. Weicht ein Kanal um 1 ab, stimmt eine Konstante nicht — Toleranz **nicht** aufweichen, sondern `T0..T3`, `0.00304` und `0.04045` gegen chroma-js prüfen.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternPalette.kt core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternPaletteTest.kt
git commit -m "feat(findpattern): four greys a delta apart, chroma-js faithful"
```

---

### Task 3: `findpattern` — die zwei Bilder

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImages.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImagesTest.kt`

**Interfaces:**
- Consumes: `FindPatternLayout`, `FindPatternPalette` (nur die Hex-Strings).
- Produces: `FindPatternImages.BOARD_BLOCK_PX: Int` (24), `FindPatternImages.PATTERN_BLOCK_PX: Int` (48), `FindPatternImages.board(blocks: List<Int>, palette: List<String>): String`, `FindPatternImages.pattern(pattern: List<Int>, palette: List<String>): String` — beide `data:image/png;base64,…`.

- [ ] **Step 1: Den fallenden Test schreiben**

```kotlin
package org.unividuell.countdown.core.findpattern

import io.kotest.matchers.shouldBe
import io.kotest.matchers.string.shouldStartWith
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.util.Base64
import javax.imageio.ImageIO

class FindPatternImagesTest {

    private val palette = listOf("#ffffff", "#c0c0c0", "#808080", "#000000")
    private val blocks = List(FindPatternLayout.BLOCK_COUNT) { it % FindPatternLayout.PALETTE_SIZE }

    private fun decode(dataUri: String) = ImageIO.read(
        ByteArrayInputStream(Base64.getDecoder().decode(dataUri.substringAfter(","))),
    )

    @Test
    fun `the board is one image per block at the board scale`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))

        image.width shouldBe FindPatternLayout.COLS * FindPatternImages.BOARD_BLOCK_PX
        image.height shouldBe FindPatternLayout.ROWS * FindPatternImages.BOARD_BLOCK_PX
    }

    @Test
    fun `it is a PNG data uri`() {
        FindPatternImages.board(blocks = blocks, palette = palette) shouldStartWith
            "data:image/png;base64,"
    }

    /** The pattern is as wide as the board, with blocks twice the size — the original's proportion. */
    @Test
    fun `the pattern image matches the board width`() {
        val board = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val image = decode(FindPatternImages.pattern(pattern = listOf(0, 1, 2, 3), palette = palette))

        image.width shouldBe board.width
        image.height shouldBe FindPatternImages.PATTERN_BLOCK_PX
    }

    @Test
    fun `a cell carries the colour its block index names`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val scale = FindPatternImages.BOARD_BLOCK_PX
        // Block 2 sits in row 0, column 2 — its tone is palette[2] = #808080.
        val centre = image.getRGB(2 * scale + scale / 2, scale / 2) and 0xFFFFFF

        centre shouldBe 0x808080
    }

    @Test
    fun `the last row is drawn, not cropped`() {
        val image = decode(FindPatternImages.board(blocks = blocks, palette = palette))
        val scale = FindPatternImages.BOARD_BLOCK_PX
        val lastIndex = FindPatternLayout.BLOCK_COUNT - 1
        val x = (lastIndex % FindPatternLayout.COLS) * scale + scale / 2
        val y = (lastIndex / FindPatternLayout.COLS) * scale + scale / 2

        (image.getRGB(x, y) and 0xFFFFFF) shouldBe 0x000000
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternImagesTest`
Expected: FAIL — `Unresolved reference: FindPatternImages`.

- [ ] **Step 3: Die Bilder implementieren**

```kotlin
package org.unividuell.countdown.core.findpattern

import org.unividuell.countdown.core.findpattern.FindPatternLayout.COLS
import org.unividuell.countdown.core.findpattern.FindPatternLayout.PATTERN_LENGTH
import org.unividuell.countdown.core.findpattern.FindPatternLayout.ROWS
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO

/**
 * The board and the sought run as PNGs. This is the game's anti-cheat lever: what the player has to
 * look at never becomes a number in the browser, so the console one-liner that solved the original
 * turns into image processing (see the anti-cheat spec's documented ceiling).
 *
 * They travel inside the payload as `data:` URIs rather than through the round's asset endpoint:
 * two flat images of a few hundred bytes need no storage, no migration and no release hook, and the
 * endpoint's pre-guess gate admits exactly one key for a single-stage game. Rendered per response
 * — a millisecond — instead of frozen into the params, which keeps the round's secret free of its
 * own presentation.
 */
object FindPatternImages {

    const val BOARD_BLOCK_PX = 24

    /** As wide as the board, so both images fill the same column without either being scaled. */
    const val PATTERN_BLOCK_PX = BOARD_BLOCK_PX * COLS / PATTERN_LENGTH

    fun board(blocks: List<Int>, palette: List<String>): String =
        dataUri(grid(tones = blocks, palette = palette, cols = COLS, rows = ROWS, scale = BOARD_BLOCK_PX))

    fun pattern(pattern: List<Int>, palette: List<String>): String =
        dataUri(
            grid(
                tones = pattern, palette = palette,
                cols = PATTERN_LENGTH, rows = 1, scale = PATTERN_BLOCK_PX,
            ),
        )

    private fun grid(
        tones: List<Int>,
        palette: List<String>,
        cols: Int,
        rows: Int,
        scale: Int,
    ): BufferedImage {
        val image = BufferedImage(cols * scale, rows * scale, BufferedImage.TYPE_INT_RGB)
        val canvas = image.createGraphics()
        try {
            for (index in tones.indices) {
                canvas.color = Color.decode(palette[tones[index]])
                canvas.fillRect((index % cols) * scale, (index / cols) * scale, scale, scale)
            }
        } finally {
            canvas.dispose()
        }
        return image
    }

    private fun dataUri(image: BufferedImage): String {
        val bytes = ByteArrayOutputStream()
        ImageIO.write(image, "png", bytes)
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes.toByteArray())
    }
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternImagesTest`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImages.kt core/src/test/kotlin/org/unividuell/countdown/core/findpattern/FindPatternImagesTest.kt
git commit -m "feat(findpattern): render board and pattern as PNG data uris"
```

---

### Task 4: Der Adapter `FindPatternGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/FindPatternGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/FindPatternGameTypeTest.kt`

**Interfaces:**
- Consumes: `FindPatternLayout`, `FindPatternBoard`, `FindPatternPalette`, `FindPatternImages` aus Task 1–3; `GameType`, `GamePayload`, `GameOutcome`, `GameSolution`, `Judgement`, `GameRandom`, `RoundContext`, `Phase`, `InvalidGuessException`.
- Produces: `FindPatternParams(blocks: List<Int>, patternStartIndex: Int, palette: List<String>, delta: Double, timed: Boolean)`, `FindPatternPayload(cols, rows, patternLength, boardImage, patternImage)`, `FindPatternOutcome(correct: Boolean)`, `FindPatternSolution(blocks: List<Int>, pattern: List<Int>, palette: List<String>, delta: Double, startIndices: List<Int>)`, Bean `FindPatternGameType` mit `id = "find-pattern"`.

- [ ] **Step 1: Den fallenden Test schreiben**

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.collections.shouldHaveSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.kotest.matchers.string.shouldStartWith
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.findpattern.FindPatternBoard
import org.unividuell.countdown.core.findpattern.FindPatternLayout
import org.unividuell.countdown.core.game.internal.FindPatternGameType
import org.unividuell.countdown.core.game.internal.FindPatternOutcome
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper

/**
 * The adapter, tested without a Spring context: it has no collaborators to inject — everything it
 * needs is `findpattern`'s pure functions.
 */
class FindPatternGameTypeTest {

    private val game = FindPatternGameType()
    private val mapper = JsonMapper.builder().build()

    private fun draw(phase: Phase, seed: Int = 4711, presentationSeed: Int = 0x1234) =
        game.draw(
            random = GameRandom(
                solution = SeededRandom.fromSeed(seed),
                presentation = SeededRandom.fromSeed(presentationSeed),
            ),
            context = RoundContext(roundNumber = 12, phase = phase),
        )

    private fun guessOf(startIndex: Int) = mapper.readTree("""{"startIndex":$startIndex}""")

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "find-pattern"
        game.displayName shouldBe "Musterung"
    }

    @Test
    fun `a drawn round carries a full board, a palette and a start index in range`() {
        val params = draw(phase = Phase.ONE)

        params.blocks shouldHaveSize FindPatternLayout.BLOCK_COUNT
        params.palette shouldHaveSize FindPatternLayout.PALETTE_SIZE
        params.patternStartIndex shouldBe
            params.patternStartIndex.coerceIn(minimumValue = 0, maximumValue = FindPatternLayout.LAST_START_INDEX)
    }

    /** The board is shown, the answer is not — so they must not share a stream. */
    @Test
    fun `the board follows the presentation seed alone`() {
        val a = draw(phase = Phase.ONE, seed = 1, presentationSeed = 7)
        val b = draw(phase = Phase.ONE, seed = 2, presentationSeed = 7)

        a.blocks shouldBe b.blocks
        a.palette shouldBe b.palette
        a.delta shouldBe b.delta
    }

    @Test
    fun `the start index follows the solution seed alone`() {
        val a = draw(phase = Phase.ONE, seed = 5, presentationSeed = 7)
        val b = draw(phase = Phase.ONE, seed = 5, presentationSeed = 99)

        a.patternStartIndex shouldBe b.patternStartIndex
    }

    @Test
    fun `only phase two asks for a deliberate reveal`() {
        game.requiresReveal(draw(phase = Phase.ONE)) shouldBe false
        game.requiresReveal(draw(phase = Phase.TWO)) shouldBe true
    }

    @Test
    fun `the payload carries exactly the five fields the client needs`() {
        val json = mapper.writeValueAsString(game.present(draw(phase = Phase.ONE)))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("cols", "rows", "patternLength", "boardImage", "patternImage")
    }

    @Test
    fun `the payload's images are png data uris and its measures are the layout`() {
        val payload = game.present(draw(phase = Phase.ONE))

        payload.cols shouldBe FindPatternLayout.COLS
        payload.rows shouldBe FindPatternLayout.ROWS
        payload.patternLength shouldBe FindPatternLayout.PATTERN_LENGTH
        payload.boardImage shouldStartWith "data:image/png;base64,"
        payload.patternImage shouldStartWith "data:image/png;base64,"
        payload.boardImage shouldNotBe payload.patternImage
    }

    @Test
    fun `the solution carries exactly the five fields the reveal needs`() {
        val json = mapper.writeValueAsString(game.solution(draw(phase = Phase.ONE)))
        val fields = mapper.readTree(json).propertyNames().toSet()

        fields shouldBe setOf("blocks", "pattern", "palette", "delta", "startIndices")
    }

    @Test
    fun `the solution names every possibility, the drawn one included`() {
        val params = draw(phase = Phase.ONE)
        val solution = game.solution(params)

        solution.pattern shouldContainExactly
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = params.patternStartIndex)
        solution.startIndices shouldContain params.patternStartIndex
        solution.startIndices.forEach {
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = it) shouldBe solution.pattern
        }
    }

    @Test
    fun `the drawn start index qualifies, and so does every other possibility`() {
        val params = draw(phase = Phase.ONE)

        game.solution(params).startIndices.forEach {
            game.judge(params = params, guess = guessOf(it)).qualifies shouldBe true
        }
    }

    @Test
    fun `a run that does not match does not qualify`() {
        val params = draw(phase = Phase.ONE)
        val possibilities = game.solution(params).startIndices.toSet()
        val miss = (0..FindPatternLayout.LAST_START_INDEX).first { it !in possibilities }

        val judgement = game.judge(params = params, guess = guessOf(miss))

        judgement.qualifies shouldBe false
        judgement.outcome shouldBe FindPatternOutcome(correct = false)
    }

    /** The framework overwrites this for a timed round; the game itself never ranks. */
    @Test
    fun `the game reports no distance of its own`() {
        val params = draw(phase = Phase.TWO)

        game.judge(params = params, guess = guessOf(params.patternStartIndex)).deviation shouldBe 0.0
    }

    @Test
    fun `an out-of-range or malformed guess is refused before anything is written`() {
        val params = draw(phase = Phase.ONE)

        shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guessOf(-1)) }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = guessOf(FindPatternLayout.LAST_START_INDEX + 1))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"startIndex":"3"}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("""{"startIndex":3.5}"""))
        }
        shouldThrow<InvalidGuessException> {
            game.judge(params = params, guess = mapper.readTree("{}"))
        }
    }

    @Test
    fun `the last legal start index is playable`() {
        val params = draw(phase = Phase.ONE)

        game.judge(params = params, guess = guessOf(FindPatternLayout.LAST_START_INDEX))
            .outcome shouldNotBe null
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternGameTypeTest`
Expected: FAIL — `Unresolved reference: FindPatternGameType`.

- [ ] **Step 3: Den Adapter implementieren**

```kotlin
package org.unividuell.countdown.core.game.internal

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.findpattern.FindPatternBoard
import org.unividuell.countdown.core.findpattern.FindPatternImages
import org.unividuell.countdown.core.findpattern.FindPatternLayout
import org.unividuell.countdown.core.findpattern.FindPatternPalette
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import tools.jackson.databind.JsonNode

/**
 * The frozen round. [patternStartIndex] is the answer and never leaves the server; [blocks] is the
 * board, which does — as an image.
 *
 * [palette] is the drawn result, not the input it came from: freezing the four tones rather than the
 * reference point keeps `present()` and `solution()` field reads, and it means a later change to the
 * palette arithmetic cannot repaint a round that is already running.
 *
 * [timed] is how the phase reaches [requiresReveal] — the same shape as Guess Hue's `toleranceDeg`.
 * Phase one is played at leisure, phase two against the clock.
 */
data class FindPatternParams(
    val blocks: List<Int>,
    val patternStartIndex: Int,
    val palette: List<String>,
    val delta: Double,
    val timed: Boolean,
)

/**
 * What the player needs in order to play — and **not a single colour**. The board and the sought run
 * are images; the three numbers are what the client lays its cell grid out from.
 *
 * Adding a field here means changing the field-set test in `FindPatternGameTypeTest`, which is the
 * point: a colour, a block value or an index would each hand over part of the answer.
 */
data class FindPatternPayload(
    val cols: Int,
    val rows: Int,
    val patternLength: Int,
    val boardImage: String,
    val patternImage: String,
) : GamePayload

/** Right or wrong — the whole verdict this game has to give. */
data class FindPatternOutcome(val correct: Boolean) : GameOutcome

/**
 * What the reveal may show: the board as numbers, the sought run, the palette those numbers name,
 * the difficulty, and every start index that would have counted.
 */
data class FindPatternSolution(
    val blocks: List<Int>,
    val pattern: List<Int>,
    val palette: List<String>,
    val delta: Double,
    val startIndices: List<Int>,
) : GameSolution

/**
 * Musterung as an announceable game. Like Guess Hue's and Song Snippet's, the adapter lives here and
 * `findpattern` knows nothing about it.
 *
 * The draw order out of the presentation stream — blocks, delta, palette reference — is part of the
 * round's identity: a seed reproduces a round only as long as it stays.
 */
@Component
class FindPatternGameType : GameType<FindPatternParams> {

    override val id = "find-pattern"
    override val displayName = "Musterung"
    override val paramsType = FindPatternParams::class.java

    override fun draw(random: GameRandom, context: RoundContext): FindPatternParams {
        val blocks = FindPatternBoard.blocks(random.presentation)
        val delta = FindPatternBoard.delta(random.presentation)
        return FindPatternParams(
            blocks = blocks,
            // The only draw from the solution stream. Everything above is published as an image.
            patternStartIndex = FindPatternBoard.patternStartIndex(random.solution),
            palette = FindPatternPalette.of(
                reference = random.presentation.nextDouble(), delta = delta,
            ),
            delta = delta,
            timed = context.phase == Phase.TWO,
        )
    }

    override fun present(params: FindPatternParams) = FindPatternPayload(
        cols = FindPatternLayout.COLS,
        rows = FindPatternLayout.ROWS,
        patternLength = FindPatternLayout.PATTERN_LENGTH,
        boardImage = FindPatternImages.board(blocks = params.blocks, palette = params.palette),
        patternImage = FindPatternImages.pattern(
            pattern = patternOf(params), palette = params.palette,
        ),
    )

    /**
     * Phase two only. In phase one the clock is not part of the result, so a deliberate reveal would
     * cost a tap for nothing; in phase two it is the whole second half of „Winner Takes It All“ —
     * find the pattern *and* be fastest — and the reveal is what starts it, exactly once.
     */
    override fun requiresReveal(params: FindPatternParams) = params.timed

    override fun judge(params: FindPatternParams, guess: JsonNode): Judgement {
        val startIndex = guess.get("startIndex")
            ?.takeIf { it.isIntegralNumber }
            ?.asInt()
            ?: throw InvalidGuessException("guess must carry an integral 'startIndex'")
        if (startIndex < 0 || startIndex > FindPatternLayout.LAST_START_INDEX) {
            throw InvalidGuessException(
                "startIndex must lie in [0, ${FindPatternLayout.LAST_START_INDEX}], was $startIndex",
            )
        }
        val correct =
            FindPatternBoard.patternAt(blocks = params.blocks, startIndex = startIndex) ==
                patternOf(params)
        return Judgement(
            qualifies = correct,
            // Right or wrong has no distance. For a timed round the framework replaces this with the
            // duration between reveal and guess — the clock is its, not the game's.
            deviation = 0.0,
            outcome = FindPatternOutcome(correct = correct),
        )
    }

    override fun solution(params: FindPatternParams): FindPatternSolution {
        val pattern = patternOf(params)
        return FindPatternSolution(
            blocks = params.blocks,
            pattern = pattern,
            palette = params.palette,
            delta = params.delta,
            startIndices = FindPatternBoard.matches(blocks = params.blocks, pattern = pattern),
        )
    }

    private fun patternOf(params: FindPatternParams): List<Int> =
        FindPatternBoard.patternAt(blocks = params.blocks, startIndex = params.patternStartIndex)
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest=FindPatternGameTypeTest`
Expected: PASS, 13 Tests.

- [ ] **Step 5: Modulgrenzen und Katalog prüfen**

Run: `cd core && ./mvnw -q test -Dtest='ModularityTests,GameCatalogTest'`
Expected: PASS. `ModularityTests` bestätigt den einbahnigen Pfeil `game → findpattern`; schlägt es fehl, importiert etwas in `findpattern` aus `game`.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/FindPatternGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/FindPatternGameTypeTest.kt
git commit -m "feat(game): announce Musterung, with the board leaving as an image"
```

---

### Task 5: `deviation` ist die Dauer, wenn das Spiel ein Aufdecken verlangt

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayDuration.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt` (in `guess`, um `val deviation = …`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTimedTest.kt`

**Interfaces:**
- Produces: `durationMsBetween(revealedAt: Instant, guessedAt: Instant): Long` (top-level in `game.internal`) — von Task 6 wiederverwendet.
- Consumes: `GameTypeHandle.requiresReveal(params: JsonNode): Boolean`.

- [ ] **Step 1: Den fallenden Test schreiben**

`PlayServiceTimedTest.kt` — dieselbe Bauform wie `PlayServiceStrictRevealTest`: ein eigener Spring-Kontext mit einem Fake-Spiel und einer Uhr, die der Test von Hand vorstellt. Die Runde wird direkt per `store.announce` geschrieben, damit die Auswahl nicht mitredet.

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

/**
 * The clock is the second half of „Winner Takes It All“, so it has to be provable: a timed game's
 * recorded distance must be the milliseconds between the reveal and the guess, and under
 * `CLOSEST_ONLY` the fastest correct guess must be the one that pays.
 *
 * Its own Spring context, like [PlayServiceStrictRevealTest]: the fake game and the stepping clock
 * must not leak into any other test's context.
 */
@Import(TestcontainersConfiguration::class, PlayServiceTimedTest.TimedGame::class)
@SpringBootTest
@Transactional
class PlayServiceTimedTest(
    @Autowired val play: PlayService,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: TimedGame.SteppingClock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @TestConfiguration
    class TimedGame {
        /** A clock the test moves by hand — reveal and guess have to land on two known instants. */
        class SteppingClock(private var now: Instant) : Clock() {
            override fun instant(): Instant = now
            override fun getZone(): ZoneId = ZoneOffset.UTC
            override fun withZone(zone: ZoneId?): Clock = this
            fun advance(by: Duration) {
                now = now.plus(by)
            }
        }

        data class TimedParams(val answer: Int)
        data class TimedPayload(val prompt: String) : GamePayload

        @Bean
        @Primary
        fun steppingClock() = SteppingClock(Instant.parse("2026-08-25T10:00:00Z"))

        /** Right/wrong plus a deliberate reveal — the shape Musterung has in phase two. */
        @Bean
        fun timedGame(): GameType<TimedParams> = object : GameType<TimedParams> {
            override val id = "timed-fake"
            override val displayName = "Uhrwerk"
            override val paramsType = TimedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = TimedParams(answer = 7)
            override fun present(params: TimedParams) = TimedPayload(prompt = "?")
            override fun judge(params: TimedParams, guess: JsonNode) = Judgement(
                qualifies = guess.get("value")?.asInt() == params.answer,
                deviation = 0.0,
                outcome = null,
            )
            override fun requiresReveal(params: TimedParams) = true
        }
    }

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun aCommunity(name: String): Community {
        val ownerId = aUser("owner")
        val community = communities.create(creatorUserId = ownerId, rawName = name)
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community
    }

    private fun announce(community: Community, rule: AwardRule) {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
        store.announce(
            edition = edition, roundNumber = roundNumber, gameType = "timed-fake",
            params = mapper.readTree("""{"answer":7}"""),
            award = Award(rule = rule, points = 3), announcedAt = clock.instant(),
        )
    }

    private fun currentNumber(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(),
            startsAt = requireNotNull(edition.startsAt),
            zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    private fun roundGameId(community: Community): UUID {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return requireNotNull(
            store.find(edition = edition, roundNumber = currentNumber(community))?.id,
        )
    }

    @Test
    fun `the recorded distance is the milliseconds between reveal and guess`() {
        val community = aCommunity("Timed Distance")
        announce(community = community, rule = AwardRule.ALL_QUALIFYING)
        val viewer = aUser("viewer")

        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(42))
        play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = roundGameId(community), userId = viewer,
        ).shouldNotBeNull()
        row.deviation shouldBe 42_000.0
        row.qualifies shouldBe true
    }

    @Test
    fun `under closest-only the fastest correct guess takes the points`() {
        val community = aCommunity("Timed Race")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val quick = aUser("quick")
        val slow = aUser("slow")

        play.reveal(slug = community.slug, userId = quick, isSuperAdmin = false)
        play.reveal(slug = community.slug, userId = slow, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(5))
        play.guess(
            slug = community.slug, userId = quick, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )
        clock.advance(Duration.ofSeconds(30))
        play.guess(
            slug = community.slug, userId = slow, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        val rows = plays.findByRoundGameId(roundGameId(community)).associateBy { it.userId }
        rows[quick].shouldNotBeNull().points shouldBe 3
        rows[slow].shouldNotBeNull().points shouldBe 0
    }

    @Test
    fun `a wrong guess scores nothing however fast it was`() {
        val community = aCommunity("Timed Wrong")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val wrong = aUser("wrong")

        play.reveal(slug = community.slug, userId = wrong, isSuperAdmin = false)
        clock.advance(Duration.ofMillis(200))
        play.guess(
            slug = community.slug, userId = wrong, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":1}"""),
        )

        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = roundGameId(community), userId = wrong,
        ).shouldNotBeNull()
        row.deviation shouldBe 200.0
        row.points shouldBe 0
    }
}
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=PlayServiceTimedTest`
Expected: FAIL — der erste Test bekommt `deviation == 0.0` statt `42000.0`.

- [ ] **Step 3: Die geteilte Arithmetik anlegen**

`core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayDuration.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import java.time.Duration
import java.time.Instant

/**
 * From the reveal that started the clock to the guess that stopped it.
 *
 * One function for two callers on purpose: `PlayService` turns it into the round's `deviation` and
 * `RoundResponses` publishes it as `durationMs`. Two copies of this subtraction would be two chances
 * for the number that decides the round to differ from the number the scoreboard prints.
 */
fun durationMsBetween(revealedAt: Instant, guessedAt: Instant): Long =
    Duration.between(revealedAt, guessedAt).toMillis()
```

- [ ] **Step 4: `PlayService.guess` umstellen**

In `PlayService.guess` den Stempel hochziehen und die Distanz-Entscheidung erweitern. Vorher:

```kotlin
        // For a staged game the distance IS the stage — framework state the game cannot know. A
        // single-stage game keeps the game's own distance.
        val deviation = if (stages > 1) play.stage.toDouble() else judgement.deviation
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = clock.instant(),
```

Nachher:

```kotlin
        // Framework state the game cannot know, in both branches. For a staged game the distance IS
        // the stage. For a game that asked for a deliberate reveal it is the time that reveal
        // started: the clock belongs to the server, and `judge(params, guess)` has no way to reach
        // it — which is exactly why the game returns a meaningless 0.0 and this line decides.
        val guessedAt = clock.instant()
        val deviation = when {
            stages > 1 -> play.stage.toDouble()
            current.handle.requiresReveal(round.params) ->
                durationMsBetween(revealedAt = play.revealedAt, guessedAt = guessedAt).toDouble()
            else -> judgement.deviation
        }
        val recorded = plays.recordGuess(
            id = requireNotNull(play.id),
            guess = guess,
            guessedAt = guessedAt,
```

- [ ] **Step 5: Test laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest=PlayServiceTimedTest`
Expected: PASS, 3 Tests.

- [ ] **Step 6: Die anderen Spiele dürfen sich nicht bewegt haben**

Run: `cd core && ./mvnw -q test -Dtest='PlayServiceTest,PlayServiceStagedTest,PlayServiceStrictRevealTest,RoundScoringTest'`
Expected: PASS. Guess Hue (`requiresReveal = false`) behält seine eigene Distanz, Anspielung (staged) die Stufe.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayDuration.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTimedTest.kt
git commit -m "feat(game): a timed round's distance is the time it took"
```

---

### Task 6: `durationMs` auf beiden Seiten der Leitung

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt` (`OtherPlayDto`, `MyPlayDto`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt` (`announced`, `mineDtoOf`, `otherDtoOf`)
- Modify: `webapp-vue/src/api/types.ts` (`OtherPlayDto`)
- Modify: `webapp-vue/src/games/GameEntry.ts`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTimedTest.kt` (zwei Tests ergänzen)

**Interfaces:**
- Consumes: `durationMsBetween` aus Task 5.
- Produces: `MyPlayDto.durationMs: Long?`, `OtherPlayDto.durationMs: Long?`, TS `OtherPlayDto.durationMs: number | null`, TS `GameEntry.durationMs: number | null`.

- [ ] **Step 1: Die fallenden Tests schreiben**

An `PlayServiceTimedTest` anhängen:

```kotlin
    @Test
    fun `a timed round publishes how long each finished player took`() {
        val community = aCommunity("Timed Published")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY)
        val mine = aUser("mine")
        val other = aUser("other")

        play.reveal(slug = community.slug, userId = other, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(9))
        play.guess(
            slug = community.slug, userId = other, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )
        play.reveal(slug = community.slug, userId = mine, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(4))
        val response = play.guess(
            slug = community.slug, userId = mine, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":7}"""),
        )

        response.me.shouldNotBeNull().durationMs shouldBe 4_000L
        response.others.single().durationMs shouldBe 9_000L
    }

    @Test
    fun `a player who has only revealed carries no duration yet`() {
        val community = aCommunity("Timed Unfinished")
        announce(community = community, rule = AwardRule.ALL_QUALIFYING)
        val viewer = aUser("viewer")

        val response = play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        response.me.shouldNotBeNull().durationMs shouldBe null
    }
```

Und in `PlayServiceTest` (dem Guess-Hue-Kontext) einen Test, der die andere Richtung festnagelt. Die
Klasse hat `aCommunity(name)`, `announceGuessHue(community)`, `aMember(community, login)`,
`currentRoundNumberOf(community)` und `guess(hue)` — die benutzen, keine neuen bauen:

```kotlin
    /** Guess Hue asks for no deliberate reveal, so how long anybody sat on the round stays theirs. */
    @Test
    fun `a round without a deliberate reveal publishes no duration`() {
        val (community, _) = aCommunity("No Duration")
        announceGuessHue(community)
        val viewer = aMember(community = community, login = "viewer")

        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        val response = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = currentRoundNumberOf(community), guess = guess(hue = 10.0),
        )

        response.me.shouldNotBeNull().durationMs shouldBe null
    }
```

- [ ] **Step 2: Tests laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest='PlayServiceTimedTest,PlayServiceTest'`
Expected: FAIL — `Unresolved reference: durationMs`.

- [ ] **Step 3: Die DTOs erweitern**

In `RoundDtos.kt`, `OtherPlayDto` — Feld plus die Begründung, weil sie eine Regel justiert:

```kotlin
    val points: Int?,
    /**
     * How long this player took, from their reveal to their guess — and `null` unless the round's
     * game asked for a deliberate reveal.
     *
     * The timestamps above stay absent: *when* somebody looked is theirs. But for a game that scores
     * on time the duration is not behaviour, it is the result — under `CLOSEST_ONLY` it is *why* the
     * winner won, and „what the others played and what it scored is the round, and they get it“. The
     * condition is `GameType.requiresReveal`, not a new switch: that flag already means „the clock is
     * part of this game“, so a game where the duration is nobody's business never publishes one.
     */
    val durationMs: Long?,
```

Dieselben zwei Zeilen (Feld ohne den Kommentar, mit `/** The viewer's own — see [OtherPlayDto]. */`)
in `MyPlayDto`, hinter `points`.

- [ ] **Step 4: `RoundResponses` füllen**

In `announced`, direkt nach `val open = …`:

```kotlin
        // Asked once per response, not per row: it is the round's game that decides, not the player.
        val timed = current.handle.requiresReveal(current.roundGame.params)
```

`timed` an beide Mapper durchgeben und dort:

```kotlin
    private fun mineDtoOf(play: RoundPlay, identity: MemberIdentity?, timed: Boolean): MyPlayDto? =
        identity?.let {
            MyPlayDto(
                …
                points = play.points,
                durationMs = durationMsOf(play = play, timed = timed),
            )
        }

    private fun otherDtoOf(play: RoundPlay, identity: MemberIdentity?, timed: Boolean): OtherPlayDto? =
        identity?.let {
            OtherPlayDto(
                …
                points = play.points,
                durationMs = durationMsOf(play = play, timed = timed),
            )
        }

    /** Only for a game that asked for the reveal, and only once the play is finished. */
    private fun durationMsOf(play: RoundPlay, timed: Boolean): Long? =
        if (!timed) null
        else play.guessedAt?.let { durationMsBetween(revealedAt = play.revealedAt, guessedAt = it) }
```

- [ ] **Step 5: Tests laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest='PlayServiceTimedTest,PlayServiceTest,RoundControllerTest,RoundHistoryServiceTest'`
Expected: PASS.

- [ ] **Step 6: Die TS-Seite nachziehen**

`webapp-vue/src/api/types.ts`, in `OtherPlayDto` hinter `points` (Kommentar oben in der Klasse
anpassen: die Stempel fehlen weiter, die Dauer nicht):

```ts
  /**
   * How long this player took, reveal to guess. `null` unless the round's game asks for a
   * deliberate reveal — see `OtherPlayDto` on the Kotlin side for why the duration travels while
   * the timestamps do not.
   */
  durationMs: number | null
```

`webapp-vue/src/games/GameEntry.ts`, hinter `points`:

```ts
  /** Reveal to guess, in milliseconds. `null` for a game that does not score on time. */
  durationMs: number | null
```

- [ ] **Step 7: Frontend grün halten**

Run: `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS. Meldet `typecheck` fehlende `durationMs` in Test-Fixtures, dort `durationMs: null`
ergänzen — genau dafür sind die Fixtures typgeprüft.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundDtos.kt core/src/main/kotlin/org/unividuell/countdown/core/game/internal/RoundResponses.kt core/src/test/kotlin/org/unividuell/countdown/core/game/ webapp-vue/src/api/types.ts webapp-vue/src/games/GameEntry.ts webapp-vue/src
git commit -m "feat(game): publish how long a timed round took, for everybody in it"
```

---

### Task 7: Das Labor bekommt eine Uhr

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabRoundStore.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabDtos.kt`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabRoundStoreTest.kt` (ergänzen)

**Interfaces:**
- Produces: `LabRoundStore.markOpened(communityId: UUID, gameId: String, round: LabRound, userId: UUID)`, `LabEntry.durationMs: Long?`, `LabEntryDto.durationMs: Long?`, TS `LabEntryDto.durationMs: number | null`; `LabRoundStore.record(…, timed: Boolean)`.
- Consumes: `durationMsBetween` gibt es in `game.internal` und ist von hier **nicht** erreichbar (Modulgrenze) — das Labor rechnet mit `Duration.between` selbst; es ist eine Subtraktion, kein geteiltes Konzept.

- [ ] **Step 1: Den fallenden Test schreiben**

An `LabRoundStoreTest` anhängen (die Klasse hat schon `private val clock = Clock.fixed(…)`; für die
Dauer braucht es zwei Instants, also eine eigene, vorstellbare Uhr in diesem Test):

```kotlin
    @Test
    fun `an entry knows how long the tester took, from the first open`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 5)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(12))
        val result = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )

        val entry = (result as RecordResult.Recorded).snapshot.entries.single()
        entry.durationMs shouldBe 12_000L
        // A timed round ranks on the clock: the distance the rescore sees is the duration.
        entry.deviation shouldBe 12_000.0
    }

    @Test
    fun `an untimed round keeps the game's own distance and no duration`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 6)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "guess-hue", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(3))
        val result = store.record(
            communityId = community, gameId = "guess-hue", round = round, userId = tester,
            guess = mapper.readTree("""{"hue":10}"""),
            judgement = Judgement(qualifies = true, deviation = 7.5, outcome = null),
            timed = false,
        )

        val entry = (result as RecordResult.Recorded).snapshot.entries.single()
        entry.durationMs shouldBe null
        entry.deviation shouldBe 7.5
    }

    @Test
    fun `the stamp survives a second open and is dropped by forget`() {
        val stepping = SteppingClock(Instant.parse("2026-08-08T12:00:00Z"))
        val store = LabRoundStore(stepping)
        val round = round(seed = 7)
        val tester = UUID.randomUUID()

        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(20))
        // A reload must not restart the clock — the same rule `revealed_at` follows in a real round.
        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(5))
        val first = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )
        (first as RecordResult.Recorded).snapshot.entries.single().durationMs shouldBe 25_000L

        store.forget(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(1))
        store.markOpened(communityId = community, gameId = "find-pattern", round = round, userId = tester)
        stepping.advance(Duration.ofSeconds(2))
        val again = store.record(
            communityId = community, gameId = "find-pattern", round = round, userId = tester,
            guess = mapper.readTree("""{"startIndex":3}"""),
            judgement = Judgement(qualifies = true, deviation = 0.0, outcome = null),
            timed = true,
        )
        (again as RecordResult.Recorded).snapshot.entries.single().durationMs shouldBe 2_000L
    }
```

Dazu in derselben Testklasse, unterhalb der bestehenden Helfer:

```kotlin
    /** Two instants are the minimum for a duration, and `Clock.fixed` only ever gives one. */
    private class SteppingClock(private var now: Instant) : Clock() {
        override fun instant(): Instant = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        fun advance(by: Duration) {
            now = now.plus(by)
        }
    }
```

`round(seed)`, `community` und `mapper` gibt es in dieser Klasse bereits — die benutzen, keine neuen
bauen. Die drei Tests legen sich je einen eigenen `LabRoundStore` mit `SteppingClock` an, weil das
Feld `store` der Klasse an `Clock.fixed` hängt und eine Dauer zwei Instants braucht.

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd core && ./mvnw -q test -Dtest=LabRoundStoreTest`
Expected: FAIL — `markOpened` und der `timed`-Parameter existieren nicht.

- [ ] **Step 3: Den Store erweitern**

In `LabEntry`:

```kotlin
    /** The stage this tester's entry was recorded at — the lab's stand-in for round_plays.stage. */
    val stage: Int,
    /**
     * How long this tester took, from their first `open` of this round to this guess. `null` for a
     * round whose game does not score on time. The lab's stand-in for `revealed_at → guessed_at`:
     * the lab shows no sealed face, so *landing on the round* is what starts the clock here.
     */
    val durationMs: Long?,
```

In `class Round`:

```kotlin
        /** First open per tester — the lab's `revealed_at`. A reload must not restart it. */
        val openedAt = ConcurrentHashMap<UUID, Instant>()
```

Neue Methode, neben `stageOf`:

```kotlin
    /**
     * Start this tester's clock, once. `putIfAbsent`, so a reload keeps the first stamp — the same
     * property `revealed_at` has in a real round.
     */
    fun markOpened(communityId: UUID, gameId: String, round: LabRound, userId: UUID) {
        val (stored, _) = openRound(Key(communityId, gameId), round)
        synchronized(stored) {
            stored.openedAt.putIfAbsent(userId, clock.instant())
        }
    }
```

`record` bekommt den Parameter und rechnet **einmal**:

```kotlin
    fun record(
        communityId: UUID,
        gameId: String,
        round: LabRound,
        userId: UUID,
        guess: JsonNode,
        judgement: Judgement,
        /**
         * Whether this round ranks on the clock. The answer comes from `GameType.requiresReveal` via
         * [LabService] — the store does not ask a game anything. It is passed in rather than derived
         * so the duration is computed exactly once here, and the entry's `durationMs` and the
         * `deviation` the rescore ranks on can never be two different numbers.
         */
        timed: Boolean,
    ): RecordResult {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        synchronized(stored) {
            val at = clock.instant()
            val durationMs = stored.openedAt[userId]?.let { Duration.between(it, at).toMillis() }
            val entry = LabEntry(
                userId = userId,
                guess = guess,
                qualifies = judgement.qualifies,
                deviation = if (timed && durationMs != null) durationMs.toDouble() else judgement.deviation,
                outcome = judgement.outcome,
                points = 0,
                at = at,
                stage = stored.stages[userId] ?: 0,
                durationMs = if (timed) durationMs else null,
            )
            if (stored.entries.putIfAbsent(userId, entry) != null) return RecordResult.AlreadyGuessed
            stored.sequence[userId] = stored.counter.getAndIncrement()
            stored.rescore()
            return RecordResult.Recorded(stored.snapshot(tookOver))
        }
    }
```

In `forget` und `resetRound` den Stempel mit aufräumen — wer seinen Guess löscht, fängt die Zeit neu
an, sonst stünde nach dem Löschen eine Dauer, die noch die alte Sitzung mitzählt:

```kotlin
            stored.stages.remove(userId)
            stored.openedAt.remove(userId)
```

```kotlin
            stored.stages.clear()
            stored.openedAt.clear()
```

`import java.time.Duration` ergänzen.

- [ ] **Step 4: `LabService` anpassen**

In `open()`, vor dem `respond`:

```kotlin
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        // Landing on the round is the lab's reveal: this is where a timed game's clock starts.
        store.markOpened(communityId = communityId, gameId = gameId, round = round, userId = userId)
```

In `guess()` den `adjusted`-Ausdruck ersetzen — die Distanz eines zeitgewerteten Spiels entsteht jetzt
im Store, wo der Stempel liegt:

```kotlin
        // A staged game's distance is the stage, and the store never sees stages; a timed game's is
        // the duration, and only the store knows when this tester opened the round. Hence one
        // adjustment here and one flag passed down — the same split `PlayService` makes.
        val timed = handle.requiresReveal(playing.params)
        val adjusted = if (stages > 1) judgement.copy(deviation = stage.toDouble()) else judgement
        val result = store.record(
            communityId = communityId, gameId = gameId, round = playing,
            userId = userId, guess = guess, judgement = adjusted, timed = timed,
        )
```

In `giveUp()` denselben Parameter mitgeben — `timed = false`: Aufgeben ist kein Ergebnis auf Zeit, es
verbraucht den Einsatz und zahlt null:

```kotlin
        val result = store.record(
            communityId = communityId, gameId = gameId, round = playing, userId = userId,
            guess = NullNode.instance,
            judgement = Judgement(qualifies = false, deviation = stage.toDouble(), outcome = null),
            timed = false,
        )
```

In `respond`'s `dtoOf`:

```kotlin
                stage = entry.stage,
                durationMs = entry.durationMs,
```

- [ ] **Step 5: `LabEntryDto` und die TS-Seite**

`LabDtos.kt` — der bisherige Kommentar an `at` („The lab does not score time.“) stimmt nicht mehr:

```kotlin
    /** Display order only — never a score. */
    val at: Instant,
    val stage: Int,
    /** Reveal-to-guess, as in a real round. `null` for a game that does not score on time. */
    val durationMs: Long?,
```

`webapp-vue/src/gamelab/types.ts`, in `LabEntryDto`:

```ts
  /** Reveal-to-guess in milliseconds; `null` for a game that does not score on time. */
  durationMs: number | null
```

- [ ] **Step 6: Tests laufen lassen und Erfolg prüfen**

Run: `cd core && ./mvnw -q test -Dtest='LabRoundStoreTest,LabServiceTest,LabControllerTest,LabStagedFlowTest,LabPointsParityTest,LabDisabledTest'`
Expected: PASS.
Run: `cd webapp-vue && pnpm typecheck && pnpm test`
Expected: PASS (Lab-Fixtures um `durationMs: null` ergänzen).

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab webapp-vue/src/gamelab/types.ts webapp-vue/src
git commit -m "feat(gamelab): start a clock on the first open, so a timed game can be reviewed"
```

---

### Task 8: Das `sealed`-Face sagt, was der Klick kostet

**Files:**
- Modify: `webapp-vue/src/rounds/RoundCard.vue`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts` (ergänzen)

**Interfaces:**
- Consumes: nichts Neues — `face === 'sealed'` heißt schon `game.requiresReveal`.

- [ ] **Step 1: Den fallenden Test schreiben**

An `RoundCard.spec.ts` anhängen; den vorhandenen Mount-Helfer der Datei benutzen, der eine Runde mit
`stage: 'sealed'` herstellt:

```ts
it('says what the reveal costs before it is clicked', () => {
  const w = mountCard({ round: aRound(), stage: 'sealed' })

  const notice = w.get('[data-test="round-reveal-cost"]').text()
  expect(notice).toContain('Zeit')
  expect(notice).toContain('ein Versuch')
})

it('says nothing about a clock on a round that is being played', () => {
  const w = mountCard({ round: aRound({ me: aPlay() }), stage: 'playing' })

  expect(w.find('[data-test="round-reveal-cost"]').exists()).toBe(false)
})
```

`mountCard`, `aRound` und `aPlay` sind die Helfer dieser Datei — die Signaturen dort ablesen und die
Aufrufe an die Nachbartests anpassen (`mountCard` verlangt `round` **und** `stage`).

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundCard.spec.ts`
Expected: FAIL — `[data-test="round-reveal-cost"]` existiert nicht.

- [ ] **Step 3: Den Text ergänzen**

Im `sealed`-Zweig von `RoundCard.vue`, über dem Knopf:

```html
      <div v-else-if="face === 'sealed'" class="flex flex-col items-center gap-4 text-center">
        <!--
          Framework copy, not a game's: `sealed` exists only because a game answered
          `requiresReveal` with true, and that flag means the same thing for every game that ever
          sets it — the clock starts here, and there is no second attempt. The game's own component
          is not even mounted yet, so this is the only place the sentence can stand.
        -->
        <p data-test="round-reveal-cost" class="text-sm text-neutral-600">
          Deine Zeit läuft ab dem Aufdecken — und du hast nur <strong>ein Versuch</strong>.
        </p>
        <button
          type="button"
          data-test="round-reveal"
          …
```

Hinweis: `ein Versuch` bleibt so stehen — „einen Versuch“ wäre grammatisch, liest im Fettdruck aber
als Zählwort; der Original-Text lautete „Du hast nur 1 Versuch“. Beim Umformulieren den Test
mitziehen.

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/rounds/__tests__/RoundCard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/rounds/RoundCard.vue webapp-vue/src/rounds/__tests__/RoundCard.spec.ts
git commit -m "feat(rounds): the sealed face names the clock and the single attempt"
```

---

### Task 9: Die Reveal-Choreographie hochziehen

**Files:**
- Create: `webapp-vue/src/games/revealChoreography.ts`
- Create: `webapp-vue/src/games/__tests__/revealChoreography.spec.ts`
- Modify: `webapp-vue/src/games/guesshue/reveal.ts` (die hochgezogenen Teile entfernen)
- Modify: `webapp-vue/src/games/guesshue/scoreboard.ts`, `GuessHueGame.vue`, `GuessHueScoreboard.vue`, `HueWheelReveal.vue` (Imports)
- Modify: `webapp-vue/src/games/guesshue/__tests__/reveal.spec.ts` (die hochgezogenen Assertions umziehen)

**Interfaces:**
- Produces: `@/games/revealChoreography` exportiert `FADE_MS = 300`, `SOLUTION_DELAY_MS = 900`, `RESULTS_DELAY_MS = 1900`, `HEAD_DELAY_MS`, `CELL_STAGGER_MS = 45`, `ROW_STAGGER_MS = 120`, `TYPE_BUDGET_MS = 1200`, `TIP_COLUMN = 1`, `rowStagger(rowCount: number): number`, `headCellDelayMs(row: number, column: number): number`, `cellDelayMs(tick: number, column: number, rowCount: number): number`, `tickOfRow(rank: number, myRank: number | null, rowCount: number): number`.
- Bleibt in `guesshue/reveal.ts`: `STACK_STEP`, `COLLISION_WINDOW_DEG`, `MIN_BAND_INNER_FRACTION`, `BAND_GROW_MS`, `stackStep`, `trackFraction`, `bandInnerFraction`, `circularDistance`, `layoutGuesses`, `sectorPaths`, `unitPoint`, `sectorInk` und die Hue-Typen.

- [ ] **Step 1: Das Modul anlegen, mit dem Umzug als Verschiebung, nicht als Neuschrift**

`webapp-vue/src/games/revealChoreography.ts` — die Blöcke wörtlich aus `guesshue/reveal.ts`
übernehmen, mit einer Umbenennung (`SECTOR_DELAY_MS` → `SOLUTION_DELAY_MS`) und einem Kopf, der sagt,
warum das Modul einen Stock höher liegt:

```ts
/**
 * When a reveal happens, for every game: the beats after the card switches, and the cascade that
 * walks the scoreboard's cells.
 *
 * One module rather than one per game, because the coupling is the point: a marker on the picture
 * and its row in the table are the same event, and two copies of these numbers would be two
 * timetables drifting apart. What stays with a game is *what* moves — lanes on a wheel, outlines on
 * a grid — never *when*.
 *
 * The numbers were first proposed in Guess Hue's reveal and turned in the lab; they are still
 * proposals, and the lab is still where they get turned.
 */

/** Beat 3: the solution appears — Guess Hue's tolerance sector, Musterung's possibilities. */
export const SOLUTION_DELAY_MS = 900

/** Beat 4: the results start landing, row by row with their marker. */
export const RESULTS_DELAY_MS = 1900

export const FADE_MS = 300

/** Beat 3 writes the scoreboard's head at the same moment the solution appears. */
export const HEAD_DELAY_MS = SOLUTION_DELAY_MS

/** Between the columns of one row — the typewriter's step. */
export const CELL_STAGGER_MS = 45

/**
 * Between rows. Deliberately shorter than a row is wide (3 · [CELL_STAGGER_MS]), so the cascades
 * overlap and the table flows instead of stuttering row by row.
 */
export const ROW_STAGGER_MS = 120

/** The row cascade never runs longer than this, however many people played. */
export const TYPE_BUDGET_MS = 1200

/** The column a marker rides with: the guess cell, because both are „the guess“. */
export const TIP_COLUMN = 1

/**
 * How far apart two rows are. [ROW_STAGGER_MS] below the budget, and whatever fits above it.
 */
export function rowStagger(rowCount: number): number {
  return Math.min(ROW_STAGGER_MS, TYPE_BUDGET_MS / Math.max(1, rowCount))
}

/** A cell of the scoreboard's head. */
export function headCellDelayMs(row: number, column: number): number {
  return HEAD_DELAY_MS + row * ROW_STAGGER_MS + column * CELL_STAGGER_MS
}

/**
 * A cell of the scoreboard's body — and, at [TIP_COLUMN], the matching marker on the picture. One
 * function for both is the whole point of the coupling: there is no second timetable to drift.
 */
export function cellDelayMs(tick: number, column: number, rowCount: number): number {
  return RESULTS_DELAY_MS + tick * rowStagger(rowCount) + column * CELL_STAGGER_MS
}

/**
 * Which tick a row borrows its timing from. Every row rides its own rank — except the viewer's.
 *
 * My own marker is already on the picture when the reveal starts, so a row appearing with it would
 * say „I am not the best“ from its slot alone, before a single rival had been shown. Mine therefore
 * waits for the first foreign marker: rank 1 when I am rank 0, rank 0 otherwise. Alone in the round
 * there is nothing to give away.
 */
export function tickOfRow(rank: number, myRank: number | null, rowCount: number): number {
  if (myRank === null || rank !== myRank) return rank
  if (rowCount <= 1) return 0
  return myRank === 0 ? 1 : 0
}
```

- [ ] **Step 2: Den Test umziehen**

`webapp-vue/src/games/__tests__/revealChoreography.spec.ts` — die Assertions zu `rowStagger`,
`cellDelayMs`, `headCellDelayMs` und `tickOfRow` aus `guesshue/__tests__/reveal.spec.ts`
**ausschneiden** und hier gegen `@/games/revealChoreography` einsetzen; `SECTOR_DELAY_MS` in den
umgezogenen Erwartungen zu `SOLUTION_DELAY_MS` umbenennen. In `reveal.spec.ts` bleiben die Tests zu
Lanes, Sektorpfaden und `circularDistance`.

Zusätzlich, weil die Kopplung jetzt geteilt ist:

```ts
it('keeps the tip column on the same beat as its row', () => {
  expect(cellDelayMs(2, TIP_COLUMN, 5)).toBe(cellDelayMs(2, 1, 5))
})
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/__tests__/revealChoreography.spec.ts`
Expected: FAIL — Modul existiert noch nicht bzw. `SOLUTION_DELAY_MS` fehlt (je nachdem, wie weit
Step 1 gekommen ist).

- [ ] **Step 4: Guess Hue umstellen**

In `guesshue/reveal.ts` die hochgezogenen Konstanten und Funktionen **löschen** und den Kopf-Kommentar
auf das reduzieren, was bleibt. Dann die Importe geradeziehen:

- `guesshue/scoreboard.ts`: `import { tickOfRow } from './reveal'` → `from '@/games/revealChoreography'`
- `guesshue/GuessHueGame.vue`: `import { TIP_COLUMN, cellDelayMs } from './reveal'` → `from '@/games/revealChoreography'`
- `guesshue/GuessHueScoreboard.vue`: `import { FADE_MS, TIP_COLUMN, cellDelayMs, headCellDelayMs } from './reveal'` → `from '@/games/revealChoreography'`
- `guesshue/HueWheelReveal.vue`: der Import wird geteilt — `BAND_GROW_MS`, `layoutGuesses`, `sectorInk`, `type RevealGuess` bleiben bei `'./reveal'`; `FADE_MS`, `RESULTS_DELAY_MS` und `SOLUTION_DELAY_MS` (vormals `SECTOR_DELAY_MS`) kommen aus `'@/games/revealChoreography'`. Im Template/Script `SECTOR_DELAY_MS` überall zu `SOLUTION_DELAY_MS` umbenennen.
- `guesshue/__tests__/GuessHueGame.spec.ts`, `__tests__/GuessHueScoreboard.spec.ts`, `__tests__/HueWheelReveal.spec.ts`: dieselbe Trennung in ihren Imports.

- [ ] **Step 5: Alles laufen lassen**

Run: `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS, und die Guess-Hue-Tests **inhaltlich unverändert** — der Umzug darf keine Zahl und
kein Verhalten ändern. Wer hier eine Erwartung anpassen muss, hat mehr als verschoben.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games
git commit -m "refactor(games): the reveal's beats belong to every game, not to Guess Hue"
```

---

### Task 10: `ui/InfoBox.vue` — die einklappbare Erklär-Card

**Files:**
- Create: `webapp-vue/src/ui/InfoBox.vue`
- Test: `webapp-vue/src/ui/__tests__/InfoBox.spec.ts`

**Interfaces:**
- Produces: `InfoBox` mit Prop `storageKey: string`, Slots `abstract` (immer sichtbar) und default (klappbar). Persistiert unter `infobox:<storageKey>`.
- Consumes: `useLocalStorage` aus `@vueuse/core`, `~icons/lucide/info`, `~icons/lucide/chevron-down`, `~icons/lucide/chevron-up`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoBox from '@/ui/InfoBox.vue'

function mountBox(storageKey = 'find-pattern') {
  return mount(InfoBox, {
    props: { storageKey },
    slots: { abstract: '<span>Kurzfassung</span>', default: '<p>Die ganze Erklärung</p>' },
  })
}

describe('InfoBox', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts open, because a game nobody has collapsed is a game nobody has understood yet', () => {
    const wrapper = mountBox()

    expect(wrapper.text()).toContain('Die ganze Erklärung')
    expect(wrapper.get('[data-test="info-box-toggle"]').attributes('aria-expanded')).toBe('true')
  })

  it('collapses on toggle and keeps the abstract', async () => {
    const wrapper = mountBox()

    await wrapper.get('[data-test="info-box-toggle"]').trigger('click')

    expect(wrapper.text()).not.toContain('Die ganze Erklärung')
    expect(wrapper.text()).toContain('Kurzfassung')
    expect(wrapper.get('[data-test="info-box-toggle"]').attributes('aria-expanded')).toBe('false')
  })

  /** Understanding a game is permanent, so the collapse has to outlive the round and the reload. */
  it('remembers the collapse per storage key', async () => {
    const first = mountBox('find-pattern')
    await first.get('[data-test="info-box-toggle"]').trigger('click')

    const again = mountBox('find-pattern')
    expect(again.text()).not.toContain('Die ganze Erklärung')

    const other = mountBox('guess-hue')
    expect(other.text()).toContain('Die ganze Erklärung')
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/InfoBox.spec.ts`
Expected: FAIL — `Cannot find module '@/ui/InfoBox.vue'`.

- [ ] **Step 3: Die Komponente implementieren**

```vue
<script setup lang="ts">
/**
 * An explanation that can be put away for good: the abstract always shows, the rest folds, and the
 * fold is remembered per [storageKey].
 *
 * The key is the game's id, not the round: whoever has understood a game has understood it for every
 * round of it. The original kept the same decision server-side per user and game type; `localStorage`
 * costs no table and no request, and its one weakness — a new device unfolds again — lands exactly
 * where the explanation is welcome anyway.
 *
 * Mechanics only. Every word the reader sees comes from the slots, so nothing here knows a game.
 */
import { useLocalStorage } from '@vueuse/core'
import IconInfo from '~icons/lucide/info'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconChevronUp from '~icons/lucide/chevron-up'

const props = defineProps<{ storageKey: string }>()

const collapsed = useLocalStorage(`infobox:${props.storageKey}`, false)
</script>

<template>
  <section
    data-test="info-box"
    class="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-neutral-700"
  >
    <div class="flex items-start gap-3">
      <IconInfo class="mt-0.5 size-5 shrink-0 text-sky-600" aria-hidden="true" />
      <div class="min-w-0 flex-1 font-medium"><slot name="abstract" /></div>
      <button
        type="button"
        data-test="info-box-toggle"
        class="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center text-neutral-500"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Erklärung zeigen' : 'Erklärung ausblenden'"
        @click="collapsed = !collapsed"
      >
        <IconChevronUp v-if="!collapsed" class="size-5" />
        <IconChevronDown v-else class="size-5" />
      </button>
    </div>
    <div v-if="!collapsed" data-test="info-box-body" class="mt-3 flex flex-col gap-2">
      <slot />
    </div>
  </section>
</template>
```

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/ui/__tests__/InfoBox.spec.ts`
Expected: PASS, 3 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/ui/InfoBox.vue webapp-vue/src/ui/__tests__/InfoBox.spec.ts
git commit -m "feat(ui): an explanation that folds away for good, per game"
```

---

### Task 11: Musterungs Wire-Typen und die Auswahlregeln

**Files:**
- Create: `webapp-vue/src/games/findpattern/types.ts`
- Create: `webapp-vue/src/games/findpattern/selection.ts`
- Test: `webapp-vue/src/games/findpattern/__tests__/selection.spec.ts`
- Test: `webapp-vue/src/games/findpattern/__tests__/types.spec.ts`

**Interfaces:**
- Produces: `FindPatternPayload`, `FindPatternSolution`, `isFindPatternPayload(value: unknown): value is FindPatternPayload`, `asFindPatternSolution(value: unknown): FindPatternSolution | null`, `startIndexOf(guess: unknown): number | null`; `nextSelection(current: readonly number[], tapped: number, patternLength: number): number[]`, `isComplete(selection: readonly number[], patternLength: number): boolean`, `startIndexOfSelection(selection: readonly number[], patternLength: number): number | null`.

- [ ] **Step 1: Den fallenden Test für die Auswahl schreiben**

```ts
import { describe, expect, it } from 'vitest'
import {
  isComplete,
  nextSelection,
  startIndexOfSelection,
} from '@/games/findpattern/selection'

const LENGTH = 4

describe('nextSelection', () => {
  it('starts a selection on the first tap', () => {
    expect(nextSelection([], 17, LENGTH)).toEqual([17])
  })

  it('grows in both directions along the reading order', () => {
    expect(nextSelection([17], 18, LENGTH)).toEqual([17, 18])
    expect(nextSelection([17, 18], 16, LENGTH)).toEqual([17, 18, 16])
  })

  /** Reading like a book means index ± 1 — the row boundary is a display decision, not a wall. */
  it('treats the last cell of a row and the first of the next as neighbours', () => {
    expect(nextSelection([7], 8, LENGTH)).toEqual([7, 8])
  })

  it('clears the selection when a cell already in it is tapped', () => {
    expect(nextSelection([17, 18], 17, LENGTH)).toEqual([])
  })

  it('starts over when a cell that touches nothing is tapped', () => {
    expect(nextSelection([17, 18], 40, LENGTH)).toEqual([40])
  })

  it('starts over once the selection was already full', () => {
    expect(nextSelection([17, 18, 19, 20], 60, LENGTH)).toEqual([60])
    expect(nextSelection([17, 18, 19, 20], 21, LENGTH)).toEqual([21])
  })
})

describe('isComplete', () => {
  it('is true at exactly the pattern length', () => {
    expect(isComplete([1, 2, 3], LENGTH)).toBe(false)
    expect(isComplete([1, 2, 3, 4], LENGTH)).toBe(true)
  })
})

describe('startIndexOfSelection', () => {
  it('is the lowest index of a complete, gapless run', () => {
    expect(startIndexOfSelection([20, 18, 19, 17], LENGTH)).toBe(17)
  })

  it('is null while the selection is short', () => {
    expect(startIndexOfSelection([17, 18], LENGTH)).toBeNull()
  })

  /** Defensive: the rules above cannot produce a hole, and a submitted guess must not risk one. */
  it('is null for a run with a hole', () => {
    expect(startIndexOfSelection([17, 18, 20, 21], LENGTH)).toBeNull()
  })
})
```

- [ ] **Step 2: Den fallenden Test für das Narrowing schreiben**

```ts
import { describe, expect, it } from 'vitest'
import {
  asFindPatternSolution,
  isFindPatternPayload,
  startIndexOf,
} from '@/games/findpattern/types'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION = {
  blocks: Array.from({ length: 112 }, (_, i) => i % 4),
  pattern: [0, 1, 2, 3],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [0, 4, 8],
}

describe('isFindPatternPayload', () => {
  it('accepts the server shape', () => {
    expect(isFindPatternPayload(PAYLOAD)).toBe(true)
  })

  it('rejects anything missing or mistyped', () => {
    expect(isFindPatternPayload(null)).toBe(false)
    expect(isFindPatternPayload({ ...PAYLOAD, cols: '8' })).toBe(false)
    expect(isFindPatternPayload({ ...PAYLOAD, boardImage: undefined })).toBe(false)
  })
})

describe('asFindPatternSolution', () => {
  it('narrows the server shape', () => {
    expect(asFindPatternSolution(SOLUTION)).toEqual(SOLUTION)
  })

  it('is null for junk rather than letting NaN reach the screen', () => {
    expect(asFindPatternSolution(null)).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, palette: ['#fff'] })).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, delta: 'wide' })).toBeNull()
    expect(asFindPatternSolution({ ...SOLUTION, blocks: [1, 'x', 3] })).toBeNull()
  })
})

describe('startIndexOf', () => {
  it('reads a stored guess', () => {
    expect(startIndexOf({ startIndex: 42 })).toBe(42)
  })

  it('is null for a give-up row or junk', () => {
    expect(startIndexOf(null)).toBeNull()
    expect(startIndexOf({})).toBeNull()
    expect(startIndexOf({ startIndex: Number.NaN })).toBeNull()
    expect(startIndexOf({ startIndex: '3' })).toBeNull()
  })
})
```

- [ ] **Step 3: Tests laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern`
Expected: FAIL — beide Module fehlen.

- [ ] **Step 4: `types.ts` implementieren**

```ts
/**
 * What the server sends, narrowed by hand. `payload`, `solution` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here is what keeps `NaN` out of a
 * style attribute.
 */

export interface FindPatternPayload {
  cols: number
  rows: number
  patternLength: number
  /** `data:image/png;base64,…` — the board. No colour ever reaches the client as a value. */
  boardImage: string
  patternImage: string
}

export interface FindPatternSolution {
  /** One palette index per cell, in reading order. */
  blocks: number[]
  pattern: number[]
  palette: string[]
  delta: number
  /** Every start index that would have counted — the „Möglichkeiten“. */
  startIndices: number[]
}

export interface FindPatternGuessWire {
  startIndex: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isFindPatternPayload(value: unknown): value is FindPatternPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<FindPatternPayload>
  return (
    isFiniteNumber(candidate.cols) &&
    isFiniteNumber(candidate.rows) &&
    isFiniteNumber(candidate.patternLength) &&
    typeof candidate.boardImage === 'string' &&
    typeof candidate.patternImage === 'string'
  )
}

export function asFindPatternSolution(value: unknown): FindPatternSolution | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<FindPatternSolution>
  if (!isNumberArray(candidate.blocks) || candidate.blocks.length === 0) return null
  if (!isNumberArray(candidate.pattern) || candidate.pattern.length === 0) return null
  if (!isStringArray(candidate.palette)) return null
  if (!isNumberArray(candidate.startIndices)) return null
  if (!isFiniteNumber(candidate.delta)) return null
  // Every block index has to name a tone, or a cell would render with `undefined` as its colour.
  const tones = candidate.palette.length
  if (tones === 0) return null
  if (candidate.blocks.some((tone) => tone < 0 || tone >= tones)) return null
  if (candidate.pattern.some((tone) => tone < 0 || tone >= tones)) return null
  return {
    blocks: candidate.blocks,
    pattern: candidate.pattern,
    palette: candidate.palette,
    delta: candidate.delta,
    startIndices: candidate.startIndices,
  }
}

/** The viewer's own guess, or `null` — a give-up row has none, and neither has a junk one. */
export function startIndexOf(guess: unknown): number | null {
  if (typeof guess !== 'object' || guess === null) return null
  const value = (guess as { startIndex?: unknown }).startIndex
  return isFiniteNumber(value) ? value : null
}
```

Achtung: der Test erwartet `asFindPatternSolution({...SOLUTION, palette: ['#fff']})` als `null` — das
fällt aus der Tonprüfung heraus (`blocks` enthält 1..3, die Palette hat nur einen Ton).

- [ ] **Step 5: `selection.ts` implementieren**

```ts
/**
 * The tip's selection rules, as index arithmetic — the original's, unchanged.
 *
 * Pure and separate from the board because happy-dom computes no layout: a rule expressed in cell
 * indices is testable, the same rule expressed in pointer coordinates is not.
 *
 * There is no partial deselect and no hole: whoever taps somewhere else starts over. On a phone that
 * is the forgiving direction — a mis-tap costs a fresh start, never a wrong guess.
 */

export function nextSelection(
  current: readonly number[],
  tapped: number,
  patternLength: number,
): number[] {
  // A full selection has already been submitted; the next tap opens a new attempt.
  const base = current.length >= patternLength ? [] : current
  if (base.includes(tapped)) return []
  if (base.includes(tapped - 1) || base.includes(tapped + 1)) return [...base, tapped]
  return [tapped]
}

export function isComplete(selection: readonly number[], patternLength: number): boolean {
  return selection.length === patternLength
}

/**
 * The index the guess is submitted under: the lowest of a complete, gapless run, or `null`.
 *
 * The gap check cannot fail under [nextSelection] — every added cell touches one already there — and
 * is kept because this is the value that leaves for the server. A hole would be a guess about four
 * cells the player never picked.
 */
export function startIndexOfSelection(
  selection: readonly number[],
  patternLength: number,
): number | null {
  if (!isComplete(selection, patternLength)) return null
  const ordered = [...selection].sort((a, b) => a - b)
  for (let step = 1; step < ordered.length; step++) {
    if (ordered[step] !== ordered[step - 1]! + 1) return null
  }
  return ordered[0]!
}
```

- [ ] **Step 6: Tests laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): narrow the wire, and the tip's selection rules"
```

---

### Task 12: `marks.ts` und `PatternGrid.vue` — ein Gitter für beide Seiten

**Files:**
- Create: `webapp-vue/src/games/findpattern/marks.ts`
- Create: `webapp-vue/src/games/findpattern/PatternGrid.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/marks.spec.ts`
- Test: `webapp-vue/src/games/findpattern/__tests__/PatternGrid.spec.ts`

**Interfaces:**
- Produces: `CellOutline { index: number; colorHex: string; insetPx: number; delayMs: number }`, `OutlineSource { userId: string; startIndex: number; colorHex: string; delayMs: number }`, `stackedOutlines(sources: readonly OutlineSource[], patternLength: number, stepPx?: number): CellOutline[]`, `isNumberVisible(index: number, preLit: ReadonlySet<number>, toggled: ReadonlySet<number>): boolean`; `PatternGrid` mit Props `image`, `cols`, `rows`, `outlines`, `numbers`, `interactive` und Emit `cell: [index]`.

- [ ] **Step 1: Den fallenden Test für `marks.ts` schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { isNumberVisible, stackedOutlines } from '@/games/findpattern/marks'

const LENGTH = 4

describe('stackedOutlines', () => {
  it('draws four cells per source, from its start index', () => {
    const marks = stackedOutlines(
      [{ userId: 'a', startIndex: 10, colorHex: '#f00', delayMs: 0 }],
      LENGTH,
    )

    expect(marks.map((mark) => mark.index)).toEqual([10, 11, 12, 13])
    expect(marks.every((mark) => mark.insetPx === 0)).toBe(true)
  })

  /** The first source stays outermost — the caller puts mine first, so mine sits where it sat. */
  it('insets a later source once per cell already taken', () => {
    const marks = stackedOutlines(
      [
        { userId: 'mine', startIndex: 10, colorHex: '#f00', delayMs: 0 },
        { userId: 'other', startIndex: 12, colorHex: '#0f0', delayMs: 500 },
      ],
      LENGTH,
    )

    const other = marks.filter((mark) => mark.colorHex === '#0f0')
    expect(other.map((mark) => [mark.index, mark.insetPx])).toEqual([
      [12, 2],
      [13, 2],
      [14, 0],
      [15, 0],
    ])
  })

  it("carries every one of a source's cells on its own delay", () => {
    const marks = stackedOutlines(
      [{ userId: 'a', startIndex: 0, colorHex: '#f00', delayMs: 1900 }],
      LENGTH,
    )

    expect(marks.every((mark) => mark.delayMs === 1900)).toBe(true)
  })
})

describe('isNumberVisible', () => {
  const preLit = new Set([4, 5, 6, 7])

  it('shows a possibility without being asked', () => {
    expect(isNumberVisible(4, preLit, new Set())).toBe(true)
  })

  it('hides a possibility that was tapped', () => {
    expect(isNumberVisible(4, preLit, new Set([4]))).toBe(false)
  })

  it('shows an ordinary cell that was tapped', () => {
    expect(isNumberVisible(40, preLit, new Set([40]))).toBe(true)
  })

  it('hides an ordinary cell nobody touched', () => {
    expect(isNumberVisible(40, preLit, new Set())).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/marks.spec.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: `marks.ts` implementieren**

```ts
/**
 * What sits on top of the board image, as arithmetic: which cell, which colour, how far in.
 *
 * Pure for the same reason `selection.ts` is — happy-dom computes no layout, so an inset expressed in
 * pixels is testable while the same inset expressed as a rendered box is not.
 */

export interface OutlineSource {
  userId: string
  startIndex: number
  colorHex: string
  /** When this outline fades in — from the shared reveal choreography, never invented here. */
  delayMs: number
}

export interface CellOutline {
  index: number
  colorHex: string
  insetPx: number
  delayMs: number
}

/** How far each collision moves an outline inwards. The original's `collisionsAtIndex * 2`. */
export const OUTLINE_STEP_PX = 2

/**
 * Every source's run as outlines, insetting whatever collides with what is already there.
 *
 * The order of [sources] decides who sits outside: the caller puts the viewer's own tip first, so it
 * keeps the box it had while they were playing. The original stacked in database order, which meant
 * your own tip moved after the round.
 */
export function stackedOutlines(
  sources: readonly OutlineSource[],
  patternLength: number,
  stepPx: number = OUTLINE_STEP_PX,
): CellOutline[] {
  const taken = new Map<number, number>()
  const marks: CellOutline[] = []
  for (const source of sources) {
    for (let step = 0; step < patternLength; step++) {
      const index = source.startIndex + step
      const collisions = taken.get(index) ?? 0
      marks.push({
        index,
        colorHex: source.colorHex,
        insetPx: collisions * stepPx,
        delayMs: source.delayMs,
      })
      taken.set(index, collisions + 1)
    }
  }
  return marks
}

/**
 * Whether a cell shows its tone index. A possibility starts lit, everything else starts dark, and a
 * tap flips whichever it is — one rule, so „die Möglichkeiten“ needs no second form language beside
 * the outline and the number.
 */
export function isNumberVisible(
  index: number,
  preLit: ReadonlySet<number>,
  toggled: ReadonlySet<number>,
): boolean {
  return preLit.has(index) !== toggled.has(index)
}
```

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/marks.spec.ts`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Den fallenden Test für `PatternGrid` schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PatternGrid from '@/games/findpattern/PatternGrid.vue'

const IMAGE = 'data:image/png;base64,AAA'

function mountGrid(props: Partial<InstanceType<typeof PatternGrid>['$props']> = {}) {
  return mount(PatternGrid, {
    props: {
      image: IMAGE,
      cols: 4,
      rows: 2,
      outlines: [],
      numbers: [],
      interactive: true,
      ...props,
    },
  })
}

describe('PatternGrid', () => {
  it('lays one cell over every block of the image', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('[data-test^="pattern-cell-"]')).toHaveLength(8)
    expect(wrapper.get('img').attributes('src')).toBe(IMAGE)
  })

  it('reports the index of a tapped cell', async () => {
    const wrapper = mountGrid()

    await wrapper.get('[data-test="pattern-cell-5"]').trigger('click')

    expect(wrapper.emitted('cell')).toEqual([[5]])
  })

  it('renders an outline per mark, with its inset and its colour', () => {
    const wrapper = mountGrid({
      outlines: [{ index: 2, colorHex: '#ff0000', insetPx: 2, delayMs: 0 }],
    })

    const outline = wrapper.get('[data-test="pattern-outline-2"]')
    expect(outline.attributes('style')).toContain('rgb(255, 0, 0)')
    expect(outline.attributes('style')).toContain('2px')
  })

  it('renders a number where one was handed in', () => {
    const wrapper = mountGrid({ numbers: [{ index: 3, value: 2, ink: '#111111' }] })

    expect(wrapper.get('[data-test="pattern-number-3"]').text()).toBe('2')
    expect(wrapper.find('[data-test="pattern-number-1"]').exists()).toBe(false)
  })

  it('offers no button when it is not interactive', () => {
    const wrapper = mountGrid({ interactive: false })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
```

- [ ] **Step 6: `PatternGrid.vue` implementieren**

```vue
<script setup lang="ts">
/**
 * The board: a server-rendered image with a transparent cell grid over it.
 *
 * The image is the anti-cheat lever — no colour reaches this component as a value, and the overlay
 * addresses cells by index alone. That is also what lets board and reveal be the same picture: the
 * marks change, the ground does not, so the tip you drew while playing sits exactly where you left it
 * when the reveal arrives.
 *
 * `image-rendering: pixelated` keeps the block edges hard while the width is fluid; the grid uses the
 * same width, so the two cannot drift apart.
 */
import { computed } from 'vue'
import type { CellOutline } from './marks'

export interface PatternNumber {
  index: number
  value: number
  /** Ink that reads against this cell's tone — decided by the caller, which knows the palette. */
  ink: string
}

const props = defineProps<{
  image: string
  cols: number
  rows: number
  outlines: CellOutline[]
  numbers: PatternNumber[]
  interactive: boolean
}>()

const emit = defineEmits<{ cell: [index: number] }>()

const cells = computed(() => Array.from({ length: props.cols * props.rows }, (_, index) => index))

const outlinesByCell = computed(() => {
  const byCell = new Map<number, CellOutline[]>()
  for (const outline of props.outlines) {
    byCell.set(outline.index, [...(byCell.get(outline.index) ?? []), outline])
  }
  return byCell
})

const numbersByCell = computed(
  () => new Map(props.numbers.map((entry) => [entry.index, entry] as const)),
)

/** The guard lives here, not in the template: a non-interactive grid renders divs, and a div with a
 *  dead handler is easier to read than a conditional binding. */
function onCell(index: number): void {
  if (props.interactive) emit('cell', index)
}
</script>

<template>
  <div class="relative w-full border-2 border-black">
    <img
      :src="props.image"
      alt=""
      class="block w-full select-none"
      style="image-rendering: pixelated"
      draggable="false"
    />
    <div
      class="absolute inset-0 grid"
      :style="{ gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))` }"
    >
      <component
        :is="props.interactive ? 'button' : 'div'"
        v-for="index in cells"
        :key="index"
        :type="props.interactive ? 'button' : undefined"
        :data-test="`pattern-cell-${index}`"
        class="relative"
        :class="props.interactive ? 'cursor-pointer' : ''"
        @click="onCell(index)"
      >
        <span
          v-for="(outline, depth) in outlinesByCell.get(index) ?? []"
          :key="depth"
          :data-test="`pattern-outline-${index}`"
          class="pointer-events-none absolute transition-opacity"
          :style="{
            inset: `${outline.insetPx}px`,
            border: `2px solid ${outline.colorHex}`,
            transitionDelay: `${outline.delayMs}ms`,
          }"
        />
        <span
          v-if="numbersByCell.has(index)"
          :data-test="`pattern-number-${index}`"
          class="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[0.6rem] leading-none"
          :style="{ color: numbersByCell.get(index)!.ink }"
        >
          {{ numbersByCell.get(index)!.value }}
        </span>
      </component>
    </div>
  </div>
</template>
```

- [ ] **Step 7: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): the board as an image with an index-addressed overlay"
```

---

### Task 13: `FindPatternBoard.vue` — spielen

**Files:**
- Create: `webapp-vue/src/games/findpattern/FindPatternBoard.vue`
- Create: `webapp-vue/src/games/findpattern/PatternRules.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/FindPatternBoard.spec.ts`

**Interfaces:**
- Consumes: `PatternGrid`, `stackedOutlines`, `nextSelection`/`isComplete`/`startIndexOfSelection`, `InfoBox`, `FindPatternPayload`.
- Produces: `FindPatternBoard` mit Props `payload: FindPatternPayload`, `myColorHex: string`, `disabled: boolean` und Emit `guess: [{ startIndex: number }]`; `PatternRules` (nur Text, keine Props).

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternBoard from '@/games/findpattern/FindPatternBoard.vue'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

function mountBoard(disabled = false) {
  return mount(FindPatternBoard, {
    props: { payload: PAYLOAD, myColorHex: '#7c3aed', disabled },
  })
}

async function tap(wrapper: ReturnType<typeof mountBoard>, ...indices: number[]) {
  for (const index of indices) {
    await wrapper.get(`[data-test="pattern-cell-${index}"]`).trigger('click')
  }
}

describe('FindPatternBoard', () => {
  it('shows both server images and the rules', () => {
    const wrapper = mountBoard()

    const sources = wrapper.findAll('img').map((img) => img.attributes('src'))
    expect(sources).toContain(PAYLOAD.boardImage)
    expect(sources).toContain(PAYLOAD.patternImage)
    expect(wrapper.find('[data-test="info-box"]').exists()).toBe(true)
  })

  it("marks a growing selection in the player's own colour", async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11)

    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(2)
    expect(wrapper.get('[data-test="pattern-outline-10"]').attributes('style')).toContain(
      'rgb(124, 58, 237)',
    )
  })

  it('submits by itself as soon as four blocks are selected', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('submits the lowest index however the run was walked', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 13, 12, 11, 10)

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('starts over on a cell that touches nothing, without submitting', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 40)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(1)
  })

  it('does not react at all once the round is spent', async () => {
    const wrapper = mountBoard(true)

    await tap(wrapper, 10, 11, 12, 13)

    expect(wrapper.emitted('guess')).toBeUndefined()
    expect(wrapper.findAll('[data-test^="pattern-outline-"]')).toHaveLength(0)
  })

  it('emits one guess even if a fifth tap lands before the answer', async () => {
    const wrapper = mountBoard()

    await tap(wrapper, 10, 11, 12, 13, 14)

    expect(wrapper.emitted('guess')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/FindPatternBoard.spec.ts`
Expected: FAIL — Komponente fehlt.

- [ ] **Step 3: `PatternRules.vue` schreiben — der Text des Originals**

```vue
<script setup lang="ts">
/**
 * The original's `GameDescription` content, ported word for word because it is good: the reading
 * rule, then how a tip is given. Text only — the folding lives in `ui/InfoBox`.
 */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>
      Lies das Spielfeld wie ein Buch — von links nach rechts, Zeile für Zeile.
    </li>
    <li>Das gesuchte Muster kann nur in Leserichtung gefunden werden.</li>
    <li>Das gesuchte Muster kann über eine Zeile hinweg brechen.</li>
    <li>
      Das gesuchte Muster kann mehrfach auftauchen — es ist egal, welches du davon findest.
    </li>
  </ul>
  <p class="mt-3 font-medium">Tippabgabe:</p>
  <ol class="ms-4 list-decimal space-y-1">
    <li>
      Tippe an einer beliebigen Stelle einen Block an, der deiner Meinung nach zum gesuchten Muster
      gehört.
    </li>
    <li>Von dort aus kannst du direkte Nachbarn antippen — vorwärts wie rückwärts.</li>
    <li>Sobald du so viele Blöcke ausgewählt hast wie gesucht, wird dein Tipp abgegeben.</li>
    <li>
      Du fängst neu an, indem du einen Block antippst, der schon ausgewählt ist oder der keinen
      deiner ausgewählten berührt.
    </li>
  </ol>
</template>
```

Der `<a>` auf MDNs LTR-Glossar aus dem Original entfällt: „von links nach rechts, Zeile für Zeile“
sagt es vollständig, und ein Link aus der Spielfläche heraus ist auf einem Telefon eine Falle.

- [ ] **Step 4: `FindPatternBoard.vue` schreiben**

```vue
<script setup lang="ts">
/**
 * Playing: the board, the sought run under it, and the rules beside it.
 *
 * The selection lives here as a plain `ref` of indices and nowhere else — no derived „where the
 * pattern is“ value, not even for a hint, because a materialised answer in component state is
 * exactly what the anti-cheat spec forbids. All this component knows is which cells were tapped.
 *
 * Layout: one column on a phone, two from `md` on, with the rules docked to the right of the board.
 * The board is portrait (8 × 14), so on a wide screen the space beside it is free anyway — and the
 * rules being *next to* the game rather than under it is what keeps them readable while playing.
 */
import { computed, ref } from 'vue'
import InfoBox from '@/ui/InfoBox.vue'
import PatternGrid from './PatternGrid.vue'
import PatternRules from './PatternRules.vue'
import { stackedOutlines } from './marks'
import { isComplete, nextSelection, startIndexOfSelection } from './selection'
import type { FindPatternPayload } from './types'

const props = defineProps<{
  payload: FindPatternPayload
  /** The viewer's own avatar colour — the tip is marked in it, here and in the reveal. */
  myColorHex: string
  disabled: boolean
}>()

const emit = defineEmits<{ guess: [value: { startIndex: number }] }>()

const selected = ref<number[]>([])

/** One outline per selected cell, all at inset 0 — the reveal stacks, the board never has to. */
const outlines = computed(() =>
  stackedOutlines(
    selected.value.map((index) => ({
      userId: 'mine',
      startIndex: index,
      colorHex: props.myColorHex,
      delayMs: 0,
    })),
    1,
  ),
)

function onCell(index: number): void {
  if (props.disabled) return
  const next = nextSelection(selected.value, index, props.payload.patternLength)
  selected.value = next
  if (!isComplete(next, props.payload.patternLength)) return
  const startIndex = startIndexOfSelection(next, props.payload.patternLength)
  // `null` cannot happen under `nextSelection`; leaving the selection standing is the honest
  // fallback if it ever did — a guess is not worth inventing.
  if (startIndex !== null) emit('guess', { startIndex })
}
</script>

<template>
  <div data-test="pattern-board" class="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
    <div class="flex flex-col items-center gap-3">
      <PatternGrid
        :image="props.payload.boardImage"
        :cols="props.payload.cols"
        :rows="props.payload.rows"
        :outlines="outlines"
        :numbers="[]"
        :interactive="!props.disabled"
        @cell="onCell"
      />
      <p class="text-center text-lg">Finde das folgende Muster im Spielfeld</p>
      <!-- Same width as the board, larger blocks: the run is what has to be memorised, and four
           near-identical tones separate better on area. The server renders it that way. -->
      <img
        :src="props.payload.patternImage"
        alt="Das gesuchte Muster"
        class="block w-full border-2 border-black"
        style="image-rendering: pixelated"
        draggable="false"
      />
    </div>

    <InfoBox storage-key="find-pattern">
      <template #abstract>
        Entdecke im Spielfeld das gesuchte Farb-Muster.
      </template>
      <PatternRules />
    </InfoBox>
  </div>
</template>
```

- [ ] **Step 5: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern && pnpm lint && pnpm typecheck`
Expected: PASS. Der letzte Test („one guess even if a fifth tap lands“) hängt daran, dass der fünfte
Tap die Auswahl zurücksetzt statt erneut abzugeben — genau das tut `nextSelection`.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): the playing board, with the rules docked beside it"
```

---

### Task 14: `scoreboard.ts` — Zeilen, Reihenfolge, `mm:ss`

**Files:**
- Create: `webapp-vue/src/games/findpattern/scoreboard.ts`
- Test: `webapp-vue/src/games/findpattern/__tests__/scoreboard.spec.ts`

**Interfaces:**
- Consumes: `GameEntry` (jetzt mit `durationMs`), `FindPatternSolution`, `readableTextColor`, `tickOfRow` aus `@/games/revealChoreography`, `AwardRule`.
- Produces: `ToneChip { value: number; hex: string; ink: string }`, `ScoreRow { userId, name, colorHex, ink, chips: ToneChip[], correct: boolean, gaveUp: boolean, durationLabel: string | null, points: number | null, provisional: boolean, startIndex: number | null, tick: number }`, `toneChips(tones: readonly number[], palette: readonly string[]): ToneChip[]`, `formatDuration(ms: number | null): string | null`, `scoreRows(input: { entries: readonly GameEntry[]; solution: FindPatternSolution; awardRule: AwardRule | null; mineUserId: string | null }): ScoreRow[]`, `hasDurations(rows: readonly ScoreRow[]): boolean`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import {
  formatDuration,
  hasDurations,
  scoreRows,
  toneChips,
} from '@/games/findpattern/scoreboard'
import type { FindPatternSolution } from '@/games/findpattern/types'

const SOLUTION: FindPatternSolution = {
  // 0,1,2,3 repeating — the sought run 1,2,3,0 starts at 1, 5, 9, …
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5, 9],
}

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    ...over,
  }
}

describe('formatDuration', () => {
  it('is mm:ss, and minutes are not capped at 59', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(9_400)).toBe('00:09')
    expect(formatDuration(61_000)).toBe('01:01')
    expect(formatDuration(3_600_000)).toBe('60:00')
  })

  it('is null where the round did not score on time', () => {
    expect(formatDuration(null)).toBeNull()
  })
})

describe('toneChips', () => {
  it('pairs every tone with its colour and readable ink', () => {
    expect(toneChips([0, 3], SOLUTION.palette)).toEqual([
      { value: 0, hex: '#ffffff', ink: '#111111' },
      { value: 3, hex: '#666666', ink: '#ffffff' },
    ])
  })
})

describe('scoreRows', () => {
  it('reads each tip off the board, so a row cannot contradict its own chips', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 1 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows[0]!.chips.map((chip) => chip.value)).toEqual([1, 2, 3, 0])
    expect(rows[0]!.correct).toBe(true)
  })

  it('marks a miss as a miss', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 4 }, points: 0 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows[0]!.correct).toBe(false)
    expect(rows[0]!.chips.map((chip) => chip.value)).toEqual([0, 1, 2, 3])
  })

  it('shows a give-up row without chips', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: null, points: 0 })],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(rows[0]!.gaveUp).toBe(true)
    expect(rows[0]!.chips).toEqual([])
    expect(rows[0]!.correct).toBe(false)
  })

  it('ranks points first, then hits, then the clock', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'slow-hit', guess: { startIndex: 9 }, points: 0, durationMs: 30_000 }),
        entry({ userId: 'miss', guess: { startIndex: 4 }, points: 0, durationMs: 1_000 }),
        entry({ userId: 'winner', guess: { startIndex: 1 }, points: 3, durationMs: 12_000 }),
        entry({ userId: 'quick-hit', guess: { startIndex: 5 }, points: 0, durationMs: 4_000 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'winner',
    })

    expect(rows.map((row) => row.userId)).toEqual(['winner', 'quick-hit', 'slow-hit', 'miss'])
  })

  it('is stable across reloads when nothing separates two rows', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'b', guess: { startIndex: 5 }, points: 1 }),
        entry({ userId: 'a', guess: { startIndex: 9 }, points: 1 }),
      ],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(rows.map((row) => row.userId)).toEqual(['a', 'b'])
  })

  it('calls a closest-only score provisional while it can still be overtaken', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'a', guess: { startIndex: 5 }, points: 3 }),
        entry({ userId: 'b', guess: { startIndex: 4 }, points: 0 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(rows[0]!.provisional).toBe(true)
    expect(rows[1]!.provisional).toBe(false)
  })

  /** My own row waits for the first foreign one — the shared choreography's rule. */
  it('gives my own row the tick of the first row that is not mine', () => {
    const rows = scoreRows({
      entries: [
        entry({ userId: 'mine', guess: { startIndex: 5 }, points: 3 }),
        entry({ userId: 'other', guess: { startIndex: 4 }, points: 0 }),
      ],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'mine',
    })

    expect(rows[0]!.tick).toBe(1)
    expect(rows[1]!.tick).toBe(1)
  })
})

describe('hasDurations', () => {
  it('is false for a phase-one round, so the column can stay away', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 1 })],
      solution: SOLUTION,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: 'a',
    })

    expect(hasDurations(rows)).toBe(false)
  })

  it('is true as soon as one row carries a duration', () => {
    const rows = scoreRows({
      entries: [entry({ userId: 'a', guess: { startIndex: 5 }, points: 3, durationMs: 1_000 })],
      solution: SOLUTION,
      awardRule: 'CLOSEST_ONLY',
      mineUserId: 'a',
    })

    expect(hasDurations(rows)).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/scoreboard.spec.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

```ts
/**
 * „Auswertung“: which rows exist, in which order, and what each cell says.
 *
 * Pure, like Guess Hue's `scoreboard.ts` — this is the half a test can assert on, and the component
 * above it has nothing left to get wrong.
 */
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import { readableTextColor } from '@/ui/readableTextColor'
import { startIndexOf } from './types'
import type { FindPatternSolution } from './types'

export interface ToneChip {
  value: number
  hex: string
  ink: string
}

export interface ScoreRow {
  userId: string
  name: string
  /** The player's own colour — the row's ground, and the colour of their outline on the board. */
  colorHex: string
  ink: string
  /** The four tones they picked, or empty for a row that gave up. */
  chips: ToneChip[]
  correct: boolean
  gaveUp: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  points: number | null
  provisional: boolean
  /** Where their run starts, for the outline on the reveal board. `null` for a give-up. */
  startIndex: number | null
  tick: number
}

export function toneChips(tones: readonly number[], palette: readonly string[]): ToneChip[] {
  return tones.flatMap((value) => {
    const hex = palette[value]
    return hex === undefined ? [] : [{ value, hex, ink: readableTextColor(hex) }]
  })
}

/** `mm:ss` with minutes running past 59 — the clock measures a round, not a wall clock. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Word for word the server's own rule (`RoundPlayPoints.kt`): under „closest only“ a score above zero
 * can still be taken away, a zero is final.
 */
function isProvisional(points: number | null, awardRule: AwardRule | null): boolean {
  return awardRule === 'CLOSEST_ONLY' && points !== null && points > 0
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: FindPatternSolution
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const patternLength = input.solution.pattern.length
  const ranked = input.entries.map((entry) => {
    const startIndex = startIndexOf(entry.guess)
    const tones =
      startIndex === null
        ? []
        : input.solution.blocks.slice(startIndex, startIndex + patternLength)
    return {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      chips: toneChips(tones, input.solution.palette),
      // Read off the board rather than off `outcome`: the row's own chips sit right under the
      // solution's, so „correct“ has to be the same comparison the reader is making.
      correct: tones.length === patternLength && tones.every((tone, at) => tone === input.solution.pattern[at]),
      gaveUp: startIndex === null,
      durationLabel: formatDuration(entry.durationMs),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
      startIndex,
    }
  })

  ranked.sort(
    (a, b) =>
      (b.points ?? -1) - (a.points ?? -1) ||
      Number(b.correct) - Number(a.correct) ||
      durationOrder(a.durationLabel, b.durationLabel) ||
      a.userId.localeCompare(b.userId),
  )

  const myRank = ranked.findIndex((row) => row.userId === input.mineUserId)
  return ranked.map((row, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

export function hasDurations(rows: readonly ScoreRow[]): boolean {
  return rows.some((row) => row.durationLabel !== null)
}

/** Faster first; a row without a clock sorts after one with it rather than winning by default. */
function durationOrder(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}
```

Der Vergleich über das `mm:ss`-Label statt über die Millisekunden ist absichtlich: zwei Tipps in
derselben Sekunde sind für den Leser gleich schnell, und dann entscheidet die stabile `userId`
statt eines Unterschieds, den die Tabelle nicht zeigt. Die **Punkte** entscheidet das nicht — das tut
der Server auf Millisekunden genau.

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/scoreboard.spec.ts && pnpm typecheck`
Expected: PASS, 12 Tests.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): rank the round, and print the clock as mm:ss"
```

---

### Task 15: `FindPatternScoreboard.vue` — die Tabelle

**Files:**
- Create: `webapp-vue/src/games/findpattern/FindPatternScoreboard.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/FindPatternScoreboard.spec.ts`

**Interfaces:**
- Consumes: `ScoreRow`, `ToneChip`, `hasDurations`, `FADE_MS`/`cellDelayMs`/`headCellDelayMs`/`TIP_COLUMN` aus `@/games/revealChoreography`, `prefersReducedMotion`/`inBackground` aus `@/ui/motion`.
- Produces: `FindPatternScoreboard` mit Props `rows: ScoreRow[]`, `solutionChips: ToneChip[]`, `live: boolean`, `animate: boolean`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternScoreboard from '@/games/findpattern/FindPatternScoreboard.vue'
import type { ScoreRow } from '@/games/findpattern/scoreboard'

const CHIPS = [
  { value: 1, hex: '#cccccc', ink: '#111111' },
  { value: 2, hex: '#999999', ink: '#ffffff' },
  { value: 3, hex: '#666666', ink: '#ffffff' },
  { value: 0, hex: '#ffffff', ink: '#111111' },
]

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    chips: CHIPS,
    correct: true,
    gaveUp: false,
    durationLabel: null,
    points: 1,
    provisional: false,
    startIndex: 5,
    tick: 0,
    ...over,
  }
}

function mountBoard(rows: ScoreRow[]) {
  return mount(FindPatternScoreboard, {
    props: { rows, solutionChips: CHIPS, live: false, animate: false },
  })
}

describe('FindPatternScoreboard', () => {
  it('shows the solution and one row per player', () => {
    const wrapper = mountBoard([row({ userId: 'a' }), row({ userId: 'b', points: 0, correct: false })])

    expect(wrapper.findAll('[data-test="solution-chip"]')).toHaveLength(4)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('prints every tone index, so the palette can be read against it', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.get('[data-test="tip-a"]').text()).toBe('1230')
  })

  it('leaves the clock column out of a round that was not timed', () => {
    const wrapper = mountBoard([row({ userId: 'a' })])

    expect(wrapper.text()).not.toContain('[mm:ss]')
  })

  it('shows the clock column as soon as a row has a duration', () => {
    const wrapper = mountBoard([row({ userId: 'a', durationLabel: '00:42' })])

    expect(wrapper.text()).toContain('[mm:ss]')
    expect(wrapper.text()).toContain('00:42')
  })

  it('says so when somebody gave up instead of printing four empty chips', () => {
    const wrapper = mountBoard([row({ userId: 'a', gaveUp: true, chips: [], correct: false, points: 0 })])

    expect(wrapper.get('[data-test="tip-a"]').text()).toContain('aufgegeben')
  })

  it('never puts a fade and a pulse on one element', () => {
    const wrapper = mountBoard([row({ userId: 'a', provisional: true })])

    const both = wrapper
      .findAll('*')
      .filter((el) => el.classes('animate-pulse') && el.classes('opacity-0'))
    expect(both).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/FindPatternScoreboard.spec.ts`
Expected: FAIL — Komponente fehlt.

- [ ] **Step 3: Implementieren**

Die Vorlage ist `GuessHueScoreboard.vue`, Zelle für Zelle: dunkles Kopfband, weiße Gutter zwischen
allen Zellen, Ink-Entscheidung pro Zelle, echtes `<table>`, und die Box steht vollständig, sobald sie
montiert ist — nur die Tinte erscheint. Übernimm von dort:

- die `still`-Bedingung (`!animate || prefersReducedMotion() || inBackground() || typeof requestAnimationFrame !== 'function'`),
- die zwei `requestAnimationFrame`-Frames in `onMounted` samt `cancelAnimationFrame` in `onBeforeUnmount`,
- `fade(delayMs)` → `{ transitionDuration: FADE_MS + 'ms', transitionDelay: delayMs + 'ms' }`,
- `head(row, column)` → `fade(headCellDelayMs(row, column))` und `cell(tick, column)` → `fade(cellDelayMs(tick, column, rows.length))`,
- den „live“-Chip **verschachtelt**: die Fade-Klasse außen, `animate-pulse` auf einem Kind — beides auf einem Element widerspricht `frontend-ui.md` und lässt den Chip von der ersten Frame an blinken.

Die Spalten sind `Name`, `Tipp`, — falls `hasDurations(rows)` — `[mm:ss]`, und `Pkt`. `TIP_COLUMN`
bleibt `1`, damit die Outline auf dem Board mit ihrer Tipp-Zelle zusammen erscheint. Die Chips einer
Zeile tragen `data-test="tip-<userId>"` am umschließenden Element und pro Chip Farbe als Grund und
`chip.ink` als Schrift; die Lösungs-Chips über der Tabelle tragen `data-test="solution-chip"`.

Eine Zeile mit `gaveUp` zeigt statt der Chips „aufgegeben“ auf schwarzem Grund — die Stelle, an der
das Original „gebannt“ zeigte.

Das Skelett, an dem die Tests hängen — der Rest ist die Optik aus `GuessHueScoreboard.vue`:

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { FADE_MS, TIP_COLUMN, cellDelayMs, headCellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { hasDurations } from './scoreboard'
import type { ScoreRow, ToneChip } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  solutionChips: ToneChip[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const timed = computed(() => hasDurations(props.rows))
const columns = computed(() =>
  timed.value ? ['Name', 'Tipp', '[mm:ss]', 'Pkt'] : ['Name', 'Tipp', 'Pkt'],
)
const pointsColumn = computed(() => columns.value.length - 1)

const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'
const shown = ref(still)
let frame = 0
onMounted(() => {
  if (still) return
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

function fade(delayMs: number) {
  return { transitionDuration: `${FADE_MS}ms`, transitionDelay: `${delayMs}ms` }
}
function head(row: number, column: number) {
  return fade(headCellDelayMs(row, column))
}
function cell(tick: number, column: number) {
  return fade(cellDelayMs(tick, column, props.rows.length))
}
</script>

<template>
  <div data-test="pattern-scoreboard">
    <div class="flex items-end justify-between gap-2">
      <h2 class="text-2xl">Auswertung</h2>
      <div class="flex flex-col items-end gap-0.5">
        <span class="bg-neutral-900 px-1 text-xs text-neutral-50" :style="head(0, 0)">Lösung</span>
        <div class="flex flex-row gap-px">
          <span
            v-for="chip in props.solutionChips"
            :key="chip.value"
            data-test="solution-chip"
            class="size-6 content-center text-center font-mono text-xs"
            :style="{ backgroundColor: chip.hex, color: chip.ink, ...head(1, 0) }"
          >
            {{ chip.value }}
          </span>
        </div>
      </div>
    </div>

    <table class="mt-2 w-full border-separate border-spacing-px">
      <thead>
        <tr>
          <th
            v-for="(label, column) in columns"
            :key="label"
            class="bg-neutral-900 px-1 text-start text-xs font-normal text-neutral-50"
            :style="head(2, column)"
          >
            {{ label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in props.rows" :key="row.userId">
          <td class="px-1" :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 0) }">
            {{ row.name }}
          </td>
          <td :data-test="`tip-${row.userId}`" :style="cell(row.tick, TIP_COLUMN)">
            <div v-if="!row.gaveUp" class="flex flex-row gap-px">
              <span
                v-for="(chip, at) in row.chips"
                :key="at"
                class="size-6 content-center text-center font-mono text-xs"
                :style="{ backgroundColor: chip.hex, color: chip.ink }"
              >
                {{ chip.value }}
              </span>
            </div>
            <div v-else class="bg-neutral-900 px-1 text-center text-xs text-neutral-50">
              aufgegeben
            </div>
          </td>
          <td
            v-if="timed"
            class="px-1 text-end font-mono text-xs"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, 2) }"
          >
            {{ row.durationLabel ?? '—' }}
          </td>
          <td
            class="px-1 text-end"
            :style="{ backgroundColor: row.colorHex, color: row.ink, ...cell(row.tick, pointsColumn) }"
          >
            <!-- The fade sits outside, the pulse on the child: one element carrying both would
                 blink into view from the first frame, whatever the delay says. -->
            <span :class="row.provisional ? 'animate-pulse' : ''">{{ row.points ?? '—' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

Die `opacity` fehlt in diesem Skelett bewusst nicht — sie kommt wie im Vorbild als Klasse
(`shown ? 'opacity-100' : 'opacity-0'`) auf jede Zelle, die einen `fade`-Style trägt.

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): the scoreboard, with the clock column only where it means something"
```

---

### Task 16: `FindPatternReveal.vue` — die Auflösung

**Files:**
- Create: `webapp-vue/src/games/findpattern/FindPatternReveal.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/FindPatternReveal.spec.ts`

**Interfaces:**
- Consumes: `PatternGrid`, `FindPatternScoreboard`, `stackedOutlines`/`isNumberVisible`, `toneChips`, `SOLUTION_DELAY_MS`/`TIP_COLUMN`/`cellDelayMs`, `readableTextColor`.
- Produces: `FindPatternReveal` mit Props `payload: FindPatternPayload`, `solution: FindPatternSolution`, `rows: ScoreRow[]`, `mineUserId: string | null`, `live: boolean`, `animate: boolean`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternReveal from '@/games/findpattern/FindPatternReveal.vue'
import type { ScoreRow } from '@/games/findpattern/scoreboard'
import type { FindPatternPayload, FindPatternSolution } from '@/games/findpattern/types'

const PAYLOAD: FindPatternPayload = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION: FindPatternSolution = {
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5],
}

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    chips: [],
    correct: true,
    gaveUp: false,
    durationLabel: null,
    points: 1,
    provisional: false,
    startIndex: 5,
    tick: 0,
    ...over,
  }
}

function mountReveal(rows: ScoreRow[], mineUserId: string | null = 'mine') {
  return mount(FindPatternReveal, {
    props: { payload: PAYLOAD, solution: SOLUTION, rows, mineUserId, live: false, animate: false },
  })
}

describe('FindPatternReveal', () => {
  it('lights the tone index of every cell that belongs to a possibility', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    // startIndices 1 and 5, four cells each.
    expect(wrapper.findAll('[data-test^="pattern-number-"]')).toHaveLength(8)
    expect(wrapper.get('[data-test="pattern-number-1"]').text()).toBe('1')
    expect(wrapper.find('[data-test="pattern-number-40"]').exists()).toBe(false)
  })

  it('lets any cell be inspected and put away again', async () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    await wrapper.get('[data-test="pattern-cell-40"]').trigger('click')
    expect(wrapper.get('[data-test="pattern-number-40"]').text()).toBe('0')

    await wrapper.get('[data-test="pattern-cell-40"]').trigger('click')
    expect(wrapper.find('[data-test="pattern-number-40"]').exists()).toBe(false)
  })

  it('lets a possibility be switched off, like any other cell', async () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    await wrapper.get('[data-test="pattern-cell-1"]').trigger('click')

    expect(wrapper.find('[data-test="pattern-number-1"]').exists()).toBe(false)
  })

  it('draws my own tip outermost and the others inside it', () => {
    const wrapper = mountReveal([
      row({ userId: 'other', colorHex: '#00ff00', startIndex: 5 }),
      row({ userId: 'mine', colorHex: '#ff0000', startIndex: 5 }),
    ])

    const outlines = wrapper.findAll('[data-test="pattern-outline-5"]')
    expect(outlines).toHaveLength(2)
    expect(outlines[0]!.attributes('style')).toContain('rgb(255, 0, 0)')
    expect(outlines[0]!.attributes('style')).toContain('inset: 0px')
    expect(outlines[1]!.attributes('style')).toContain('rgb(0, 255, 0)')
    expect(outlines[1]!.attributes('style')).toContain('inset: 2px')
  })

  it('shows the palette with its indices and the round's delta', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    expect(wrapper.findAll('[data-test="palette-tone"]')).toHaveLength(4)
    expect(wrapper.get('[data-test="palette-delta"]').text()).toContain('0,14')
  })

  it('carries the scoreboard', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    expect(wrapper.find('[data-test="pattern-scoreboard"]').exists()).toBe(true)
  })

  it('does not show the search pattern image again', () => {
    const wrapper = mountReveal([row({ userId: 'mine' })])

    const sources = wrapper.findAll('img').map((img) => img.attributes('src'))
    expect(sources).not.toContain(PAYLOAD.patternImage)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/FindPatternReveal.spec.ts`
Expected: FAIL — Komponente fehlt.

- [ ] **Step 3: Implementieren**

```vue
<script setup lang="ts">
/**
 * The card after the round: the same board, now with everybody's tip on it, every possibility lit,
 * the palette beside it and the scoreboard below.
 *
 * „Die Möglichkeiten“ are not a form of their own — they are the tone-index inspection, starting
 * lit. One rule (`isNumberVisible`) covers both, so a reader who taps around never has to learn a
 * second vocabulary, and a possibility can be put away like anything else.
 *
 * My own outline sits outermost, at inset 0: it is the box I drew while playing, and the board under
 * it has not moved, so the switch from playing to reveal leaves it exactly where it was.
 */
import { computed, ref } from 'vue'
import { SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { readableTextColor } from '@/ui/readableTextColor'
import FindPatternScoreboard from './FindPatternScoreboard.vue'
import PatternGrid from './PatternGrid.vue'
import { isNumberVisible, stackedOutlines } from './marks'
import { toneChips } from './scoreboard'
import type { ScoreRow } from './scoreboard'
import type { FindPatternPayload, FindPatternSolution } from './types'
import type { PatternNumber } from './PatternGrid.vue'

const props = defineProps<{
  payload: FindPatternPayload
  solution: FindPatternSolution
  rows: ScoreRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
}>()

/** Mine first, so it takes inset 0 — see the file comment. */
const outlines = computed(() => {
  const withGuess = props.rows.filter((row) => row.startIndex !== null)
  const mine = withGuess.filter((row) => row.userId === props.mineUserId)
  const others = withGuess.filter((row) => row.userId !== props.mineUserId)
  return stackedOutlines(
    [...mine, ...others].map((row) => ({
      userId: row.userId,
      startIndex: row.startIndex!,
      colorHex: row.colorHex,
      // Mine is already on the board — it never fades in. Everyone else arrives with their row.
      delayMs:
        row.userId === props.mineUserId
          ? 0
          : cellDelayMs(row.tick, TIP_COLUMN, props.rows.length),
    })),
    props.solution.pattern.length,
  )
})

const preLit = computed(() => {
  const cells = new Set<number>()
  for (const start of props.solution.startIndices) {
    for (let step = 0; step < props.solution.pattern.length; step++) cells.add(start + step)
  }
  return cells
})

const toggled = ref(new Set<number>())

const numbers = computed<PatternNumber[]>(() => {
  const cells: PatternNumber[] = []
  for (let index = 0; index < props.solution.blocks.length; index++) {
    if (!isNumberVisible(index, preLit.value, toggled.value)) continue
    const tone = props.solution.blocks[index]!
    const hex = props.solution.palette[tone]
    if (hex === undefined) continue
    cells.push({ index, value: tone, ink: readableTextColor(hex) })
  }
  return cells
})

function onCell(index: number): void {
  const next = new Set(toggled.value)
  if (!next.delete(index)) next.add(index)
  toggled.value = next
}

const palette = computed(() =>
  toneChips(
    props.solution.palette.map((_, tone) => tone),
    props.solution.palette,
  ),
)

const deltaLabel = computed(() =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    props.solution.delta,
  ),
)

/** The possibilities land on beat 3, with the table's head — they are the solution. */
const numbersStyle = computed(() => ({
  transitionDelay: props.animate ? `${SOLUTION_DELAY_MS}ms` : '0ms',
}))
</script>

<template>
  <div data-test="pattern-reveal" class="flex flex-col gap-6">
    <div class="flex flex-row items-start gap-4">
      <div class="min-w-0 flex-1" :style="numbersStyle">
        <PatternGrid
          :image="props.payload.boardImage"
          :cols="props.payload.cols"
          :rows="props.payload.rows"
          :outlines="outlines"
          :numbers="numbers"
          :interactive="true"
          @cell="onCell"
        />
      </div>
      <!-- Beside the board, not under it: the board is portrait, so this column is free space, and
           reading a tone index off the grid means comparing it to the palette right next to it. -->
      <div class="flex w-24 shrink-0 flex-col items-center gap-2">
        <span class="text-sm text-neutral-500">Palette</span>
        <div class="flex flex-col gap-1">
          <span
            v-for="tone in palette"
            :key="tone.value"
            data-test="palette-tone"
            class="flex size-10 items-center justify-center rounded-full font-mono text-xs"
            :style="{ backgroundColor: tone.hex, color: tone.ink }"
          >
            {{ tone.value }}
          </span>
        </div>
        <span data-test="palette-delta" class="font-mono text-sm">Δ {{ deltaLabel }}</span>
      </div>
    </div>

    <FindPatternScoreboard
      :rows="props.rows"
      :solution-chips="toneChips(props.solution.pattern, props.solution.palette)"
      :live="props.live"
      :animate="props.animate"
    />
  </div>
</template>
```

Zwei Punkte, die beim Umsetzen leicht verloren gehen:

- `PatternNumber` muss aus `PatternGrid.vue` exportiert sein (`export interface` im `<script setup>`),
  sonst ist der `import type` nicht auflösbar.
- Die `numbersStyle`-Verzögerung wirkt nur, weil `PatternGrid`s Zahl-Spans eine
  `transition-opacity`-Klasse tragen. Fehlt die, erscheinen die Möglichkeiten sofort — dann ist Beat 3
  nur auf dem Papier da. Prüfe es im Labor (Task 18), nicht im Test: happy-dom rechnet keine
  Transitions.

- [ ] **Step 4: Test laufen lassen und Erfolg prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/findpattern
git commit -m "feat(findpattern): the reveal — every tip, every possibility, the palette beside it"
```

---

### Task 17: `FindPatternGame.vue` und die zwei Registries

**Files:**
- Create: `webapp-vue/src/games/findpattern/FindPatternGame.vue`
- Test: `webapp-vue/src/games/findpattern/__tests__/FindPatternGame.spec.ts`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`

**Interfaces:**
- Consumes: den Prop-Kontrakt, den `RoundCard` und die Laborseite anlegen: `payload`, `outcome`, `myGuess`, `solution`, `entries`, `mineUserId`, `awardRule`, `disabled`, `stage`, `assetUrl`; Emits `guess`, `skip`, `giveUp`.
- Produces: Registry-Eintrag `'find-pattern': FindPatternGame`, Labor-Eintrag `{ id: 'find-pattern', title: 'Musterung' }`.

- [ ] **Step 1: Den fallenden Test schreiben**

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FindPatternGame from '@/games/findpattern/FindPatternGame.vue'
import type { GameEntry } from '@/games/GameEntry'

const PAYLOAD = {
  cols: 8,
  rows: 14,
  patternLength: 4,
  boardImage: 'data:image/png;base64,AAA',
  patternImage: 'data:image/png;base64,BBB',
}

const SOLUTION = {
  blocks: Array.from({ length: 112 }, (_, index) => index % 4),
  pattern: [1, 2, 3, 0],
  palette: ['#ffffff', '#cccccc', '#999999', '#666666'],
  delta: 0.14,
  startIndices: [1, 5],
}

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { startIndex: 5 },
  outcome: { correct: true },
  points: 1,
  durationMs: 42_000,
  avatar: { bgColorHex: '#7c3aed' },
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(FindPatternGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: null,
      awardRule: 'ALL_QUALIFYING',
      disabled: false,
      ...over,
    },
  })
}

describe('FindPatternGame', () => {
  it('plays while there is no solution', () => {
    const wrapper = mountGame()

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(false)
  })

  it('marks the board in my own colour, taken from the entries', () => {
    const wrapper = mountGame({ entries: [{ ...MINE, guess: null }], mineUserId: 'mine' })

    expect(wrapper.get('[data-test="pattern-board"]').html()).toContain('#7c3aed')
  })

  it('passes a guess up unchanged', async () => {
    const wrapper = mountGame()

    for (const index of [10, 11, 12, 13]) {
      await wrapper.get(`[data-test="pattern-cell-${index}"]`).trigger('click')
    }

    expect(wrapper.emitted('guess')).toEqual([[{ startIndex: 10 }]])
  })

  it('reveals once the server sends a solution', () => {
    const wrapper = mountGame({ solution: SOLUTION, entries: [MINE], mineUserId: 'mine' })

    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(false)
  })

  it('keeps playing on a junk payload rather than rendering NaN', () => {
    const wrapper = mountGame({ payload: { cols: 'eight' } })

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="pattern-reveal"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('nicht anzeigen')
  })

  it('stays on the board when the solution is junk', () => {
    const wrapper = mountGame({ solution: { blocks: 'nope' }, entries: [MINE], mineUserId: 'mine' })

    expect(wrapper.find('[data-test="pattern-board"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag prüfen**

Run: `cd webapp-vue && pnpm test src/games/findpattern/__tests__/FindPatternGame.spec.ts`
Expected: FAIL — Komponente fehlt.

- [ ] **Step 3: Implementieren**

```vue
<script setup lang="ts">
/**
 * Musterung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — this game has one stage and one attempt, and
 * both exits are the framework's, not the game's. Declaring them keeps the component contract the
 * same shape for every game the round card and the lab render.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import FindPatternBoard from './FindPatternBoard.vue'
import FindPatternReveal from './FindPatternReveal.vue'
import { scoreRows } from './scoreboard'
import { asFindPatternSolution, isFindPatternPayload } from './types'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: [] }>()

const payload = computed(() => (isFindPatternPayload(props.payload) ? props.payload : null))
const solution = computed(() => asFindPatternSolution(props.solution))

/** Grey, so a player whose row has not arrived yet still sees their own selection. */
const myColorHex = computed(
  () =>
    props.entries.find((entry) => entry.userId === props.mineUserId)?.avatar.bgColorHex ?? '#525252',
)

const rows = computed(() =>
  solution.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        solution: solution.value,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/**
 * Whether the reveal is something that just happened here rather than something that was already
 * true on mount — the same flag Guess Hue keeps, for the same reason: a reload must not replay the
 * choreography. A `watch` without `immediate` never fires for the initial value, which is what makes
 * an instance mounting already-revealed start `false`.
 */
const hasRevealedLive = ref(false)
watch(solution, (now, before) => {
  if (before === null && now !== null) hasRevealedLive.value = true
})
</script>

<template>
  <p v-if="payload === null" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <FindPatternReveal
    v-else-if="solution"
    :payload="payload"
    :solution="solution"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :live="live"
    :animate="hasRevealedLive"
  />
  <FindPatternBoard
    v-else
    :payload="payload"
    :my-color-hex="myColorHex"
    :disabled="props.disabled"
    @guess="(value) => emit('guess', value)"
  />
</template>
```

- [ ] **Step 4: Die beiden Registries ergänzen**

`webapp-vue/src/games/registry.ts`:

```ts
import FindPatternGame from './findpattern/FindPatternGame.vue'
…
export const gameComponents: Record<string, Component> = {
  'guess-hue': GuessHueGame,
  'song-snippet': SongSnippetGame,
  'find-pattern': FindPatternGame,
}
```

`webapp-vue/src/gamelab/games.ts`:

```ts
export const labGameList: readonly LabGameEntry[] = [
  { id: 'guess-hue', title: 'Farbausmalung' },
  { id: 'song-snippet', title: 'Anspielung' },
  { id: 'find-pattern', title: 'Musterung' },
]
```

- [ ] **Step 5: Alles laufen lassen**

Run: `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS. `gamelab/__tests__/lab-index.spec.ts` zählt gegen `labGameList.length` und braucht
daher keine Anpassung — schlägt er fehl, fehlt der Komponenten-Eintrag in `registry.ts`.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games webapp-vue/src/gamelab/games.ts
git commit -m "feat(findpattern): wire Musterung into the round and the lab"
```

---

### Task 18: Abnahme im Labor — Layout, Choreographie, beide Phasen

Kein TDD-Task: hier wird angesehen, was kein Test sehen kann. happy-dom rechnet kein Layout, keine
Transitions und keine Bilder — genau das steht hier zur Prüfung. Der Beschreibungs-Block ist außerdem
eine Geschmacksfrage, und die entscheidet der Nutzer am Bild, nicht der Implementierer im Code.

**Files:**
- Modify: nur, was die Prüfung findet (voraussichtlich `FindPatternBoard.vue`, `FindPatternReveal.vue`, `PatternGrid.vue`)

- [ ] **Step 1: Backend und Frontend starten**

Beide Server über die Vorschau starten (nie über die Shell): `backend` und `frontend` aus
`.claude/launch.json`. Im Labor anmelden und `/c/<slug>/lab/find-pattern?seed=1&phase=ONE` öffnen.

- [ ] **Step 2: Phase eins prüfen, mobil (375 × 812)**

- Board füllt die Breite, Blockkanten sind hart (nicht weichgezeichnet) — sonst fehlt
  `image-rendering: pixelated` oder das Overlay liegt falsch.
- Zell-Overlay deckt sich mit den Blöcken des Bildes; ein Tap markiert genau den Block darunter.
- Muster-Bild ist genauso breit wie das Board und hat sichtbar größere Blöcke.
- Erklär-Card sitzt **unter** dem Feld, abgesetzt, einklappbar; eingeklappt bleibt die Kurzfassung.
- Vier Taps geben ab; danach steht die Auswertung.
- Bei `delta` am unteren Rand (mehrere Seeds durchprobieren): sind vier Töne überhaupt noch zu
  unterscheiden? Wenn nein, ist das eine Feststellung für die Spec, keine stille Änderung von
  `DELTA_MIN`.

- [ ] **Step 3: Phase eins prüfen, Desktop (1280 × 800)**

`?phase=ONE` mit breitem Fenster: Erklär-Card **rechts** vom Feld, Board nicht auf halbe Höhe
gestreckt, keine horizontale Scrollleiste am Body.

- [ ] **Step 4: Zwei bis drei Layout-Varianten der Erklär-Card zeigen**

Varianten bauen (eine pro Screenshot, nicht alle gleichzeitig), jeweils mobil **und** Desktop
aufnehmen, und dem Nutzer beide Ansichten je Variante zeigen. Vorschläge:

1. angedockt (gemeinsame Kante mit der Board-Karte, gleicher Radius, ein Hauch Versatz),
2. abgesetzte eigene Card mit Abstand,
3. Desktop-Variante mit schmalerer Spalte (16 rem statt 20 rem), damit das Board mehr Breite bekommt.

Der Nutzer wählt. Nicht selbst entscheiden und nicht mehrere Varianten committen.

- [ ] **Step 5: Phase zwei prüfen**

`?phase=TWO` öffnen. Das Labor zeigt kein `sealed`-Face — die Runde liegt offen, und die Uhr startet
mit dem Laden. Zu prüfen:

- Nach dem Guess steht `[mm:ss]` in der Tabelle, mit einer plausiblen Dauer.
- Mit zwei Testern (zweites Profil über den Test-Login-Picker, `Meinen Guess löschen` für den
  Neustart): der schnellere korrekte Tipp hält die Punkte, der langsamere zeigt `0`.
- In Phase eins fehlt die Spalte ganz.

- [ ] **Step 6: Die Choreographie prüfen**

Direkt nach dem Guess, ohne Reload:

- Der eigene Tipp **bleibt stehen** — kein Blinken, kein Sprung.
- Bei ~0,9 s erscheinen die Zahlen der Möglichkeiten, der Tabellenkopf und die Palette.
- Ab ~1,9 s kaskadieren die Zeilen, und jeder fremde Tipp erscheint **mit seiner Zeile**.
- Nach einem Reload läuft nichts davon erneut.
- Mit `prefers-reduced-motion` steht alles sofort vollständig da.

Erscheinen die Möglichkeiten sofort statt auf Beat 3, fehlt die `transition-opacity` an den
Zahl-Spans in `PatternGrid` (siehe Task 16).

- [ ] **Step 7: Die Zahl-Inspektion prüfen**

Beliebige Kästchen an- und abtippen; eine Möglichkeit lässt sich ausschalten. Die Zahl ist auf dem
hellsten **und** dunkelsten Ton lesbar — sonst stimmt die Ink-Entscheidung nicht.

- [ ] **Step 8: Beweis mitschicken**

Screenshots (mobil + Desktop, Phase eins + Phase zwei + Reveal) an den Nutzer. Danach die von ihm
gewählte Layout-Variante committen:

```bash
git add webapp-vue/src/games/findpattern
git commit -m "fix(findpattern): the layout the lab actually shows"
```

---

### Task 19: Wissensrückfluss

Die Anti-Cheat-Spec hat sich diesen Schritt selbst aufgegeben („Nach der Validierung am ersten Spiel
gehören in `.claude/guidelines/` — vermutlich als neue Datei `game-integrity.md“`). Musterung **ist**
dieses Spiel: es ist der Fall, für den jene Spec geschrieben wurde.

**Files:**
- Create: `.claude/guidelines/game-integrity.md`
- Modify: `.claude/guidelines/README.md` (Verzeichnis)
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/game-lab.md`
- Modify: `.claude/guidelines/frontend-state.md`
- Modify: `docs/superpowers/specs/2026-08-02-anti-cheat-design.md` (die korrigierte Festlegung)

- [ ] **Step 1: `game-integrity.md` schreiben**

Nur was am Spiel validiert wurde, jede Regel mit ihrem Beleg im Code — keine Absichtserklärungen mehr,
die stehen in der Spec:

- **Von parsebar nach perzeptuell.** Was die Lösung trägt, verlässt den Server als Bild. Beleg:
  `FindPatternImages`, Payload mit fünf Feldern und ohne Farbwert. Die dokumentierte Obergrenze
  (Pixel-Extraktion per Skript) gehört zur Regel, nicht in eine Fußnote.
- **Zwei Ströme, getrennt nach Veröffentlichung** — und die Regel schützt den Strom, nicht den Wert:
  ein *aus* einem Solution-Zug abgeleitetes Bild ist erlaubt, ein roher `nextDouble` daraus nicht.
  Beleg: `FindPatternGameType.draw`, `FindPatternGameTypeTest`s zwei Strom-Tests.
- **Feldset-Test pro Payload und pro Solution**, nicht „Antwort ist nicht drin“.
- **Der Client materialisiert die Lösung nie**, auch nicht abgeleitet: `FindPatternBoard` hält
  ausschließlich angetippte Indizes.
- **Zeitwertung ist server-autoritativ**: keine Client-Stempel, kein Drift-Abgleich, kein Bann. Die
  Uhr ist `revealed_at → guessed_at`, ein Refresh setzt sie nicht zurück, und „genau einmal
  aufdecken“ ist ein `INSERT … ON CONFLICT DO NOTHING`.
- **Bilder gehören in den Payload, solange sie klein sind** — der Asset-Endpoint ist für teure,
  große, gespeicherte Bytes. Mit der Gegenprobe: sein Vor-dem-Guess-Gate lässt genau einen Schlüssel
  durch, also zwingt ein zweites Bild dort zu einer Framework-Änderung.

- [ ] **Step 2: `game-rounds.md` nachziehen**

Zwei Stellen:

- Bei „Die Zeile des Betrachters und die der anderen sind verschiedene Typen“: die Dauer ist die
  Ausnahme, die die Regel schärft — Stempel bleiben privat, die **Dauer** ist bei einem
  zeitgewerteten Spiel Ergebnis. Bedingung ist `requiresReveal`, kein neuer Schalter.
- Bei „Stufen verallgemeinern das Framework“: der zweite Fall derselben Bauform. Framework-Zustand
  überschreibt die Distanz des Spiels — die Stufe bei einem stufigen Spiel, die Dauer bei einem
  aufzudeckenden. `PlayFlow`/`PlayService` sind die Belege.

- [ ] **Step 3: `game-lab.md` nachziehen**

Der Satz „Timing is deliberately out of scope for the lab“ stimmt nicht mehr: das Labor stempelt beim
ersten `open` und leitet daraus dieselbe Dauer ab, die eine echte Runde aus `revealed_at` gewinnt.
Das ist die Richtungsregel in Reinform — das Labor hat sich angepasst, der Vertrag nicht.

- [ ] **Step 4: `frontend-state.md` nachziehen**

Zwei Zeilen:

- Die Reveal-Choreographie ist geteilt (`games/revealChoreography.ts`), weil Bild und Tabelle **ein**
  Ereignis sind; ein Spiel bringt mit, *was* sich bewegt, nie *wann*.
- Eine Erklärung, die man weglegen kann, lebt in `localStorage` unter der Spiel-Id — Verstehen ist
  dauerhaft, und ein neues Gerät klappt wieder auf, was genau richtig ist.

- [ ] **Step 5: Die Anti-Cheat-Spec korrigieren, nicht verteidigen**

In `2026-08-02-anti-cheat-design.md`, Abschnitt „Find Pattern“: eine datierte Korrektur wie die vom
2026-08-07 oben im Dokument. „Das Gitter *muss* als Daten kommen (Interaktion, Animation)“ ist am
Spiel widerlegt — beide Bilder kommen aus dem Server, weil die Tippmarkierung in Spielerfarbe die
Blockfarbe im Client nicht mehr braucht. Auf die Musterung-Spec verlinken.

- [ ] **Step 6: Voller Testlauf**

Run: `cd core && ./mvnw test`
Run: `cd webapp-vue && pnpm lint && pnpm typecheck && pnpm test`
Expected: beides grün.

- [ ] **Step 7: Commit und PR**

```bash
git add .claude/guidelines docs/superpowers/specs/2026-08-02-anti-cheat-design.md
git commit -m "docs(guidelines): game integrity, validated at the game it was written for"
gh pr create --base develop --title "Musterung: port find-pattern" --body "$(cat <<'BODY'
Ports the third mini-game. The board and the search pattern leave the server as PNGs inside the
payload — the outline marker replaced the original's hover shading, so the client needs no colour
before the reveal. That corrects the anti-cheat spec's plan of shipping the grid as data; the
correction is recorded there and in the new `game-integrity.md`.

Time scoring arrives with this game, as four changes that belong to the framework rather than to
Musterung: `deviation` becomes the reveal-to-guess duration for a game that requires a deliberate
reveal, `durationMs` is published on the play DTOs under exactly that condition, the sealed face
names what the click costs, and the lab starts a clock on the first open so the column can be
reviewed. Guess Hue and Anspielung are untouched by all four.

The reveal's beats moved out of `guesshue/reveal.ts` into `games/revealChoreography.ts` — shared
because a marker and its table row are one event.

No migration, no new dependency.
BODY
)"
```

Basis ist **`develop`**, nie `main`.

## Self-Review

**Spec-Deckung** — jeder Abschnitt der Spec hat einen Task:

| Spec-Abschnitt | Task |
|---|---|
| Die Regeln (Maße, Tippabgabe) | 1, 11, 13 |
| Phasen-Tabelle, `timed` | 4, 5, 6 |
| Beide Bilder kommen aus dem Server | 3, 4 |
| Der Zug, Stromtrennung, Clamp weg, delta | 1, 4 |
| Palette (chroma-js-treu) | 2 |
| Bilder (Maße, Muster boardbreit) | 3 |
| Payload/Solution/Outcome/Guess | 4 |
| Zeit: vier Eingriffe | 5, 6, 7, 8 |
| Ein Gitter, zwei Nutzer | 12 |
| Board | 13 |
| Beschreibung als angedockte Card | 10, 13, 18 |
| Reveal (Outlines, Möglichkeiten, Zahl, Palette) | 12, 16 |
| Scoreboard | 14, 15 |
| Choreographie hochgezogen | 9, 16 |
| Labor | 7, 17, 18 |
| Tests | in jedem Task |
| Bewusst verschoben | —, absichtlich ohne Task |

**Eine Präzisierung gegenüber der ersten Spec-Fassung**, dort inzwischen nachgetragen:
`FindPatternParams` friert die **fertige** `palette` ein, nicht den Referenzpunkt, aus dem sie
entsteht — so bleiben `present()` und `solution()` Feldzugriffe, und eine spätere Änderung der
Palettenmathematik färbt keine laufende Runde um.
