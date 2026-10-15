# Platzierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Spiel „Platzierung“ (`place-patch`) als sechstes Rundenspiel: ein farbiger, ausgefranster Ausschnitt eines Pool-Fotos muss im Graubild desselben Fotos aufs Feld genau platziert werden.

**Architecture:** Zuerst ziehen Bildauswahl, Seitenverhältnis-Klassen und Zuschnitt aus `deduster` in die exportierte API von `imagepool` (Entstauber stellt um, Verhalten unverändert). Dann bekommt der Spielvertrag `GameType.assetStage`, damit ein einstufiges Spiel zwei Bilder hinter einem Aufdecken halten kann. Ein neues Modulith-Modul `placepatch` friert das Foto ein und leitet Graubild und Ausschnitt ab; der Adapter `PlacePatchGameType` in `game.internal` trägt Params, Ausgänge und Urteil. Im Frontend ein neues Spielverzeichnis `games/placepatch/` nach dem Vorbild von Musterung.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher + mockk + Testcontainers · Java2D/ImageIO · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-10-15-platzierung-design.md`](../specs/2026-10-15-platzierung-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Referenz:** Branch `claude/find-patch-game-spike` (Stand `b6b2b50`), Seite `/c/[slug]/spike/ausschnitt`, Code unter `webapp-vue/src/spike/findpatch/`. Die Fransenmaske und die Rahmen-Platzierung dort sind die Vorlage für Task 3 und 7.

**Zwei Abweichungen von der Spec, bewusst:**

1. **`playableIds` ist eine Erweiterungsfunktion auf `ImagePoolQuery`, keine Default-Methode im Interface.** `LabServiceTest` und `PlayServiceDedusterTest` ersetzen `ImagePoolQuery` per `@MockkBean`; eine Default-Methode wäre dort ungestubbt und würfe. Die Erweiterung ruft `candidateIds`, das die Tests schon stubben. Der Aufruf `pool.playableIds(id)` sieht genauso aus.
2. **Die Klassen in `placepatch` heißen `PlacePatchImageStore`, `PlacePatchRoundImage`, `PlacePatchRoundImageRepository`** — nicht `RoundImageStore` usw. wie in `deduster`. Spring benennt Beans nach dem einfachen Klassennamen; zwei `roundImageStore`/`roundImageRepository` brechen den Boot.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, deutsche Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`: Betreff imperativ, groß, ohne Punkt, ≤ 50 Zeichen; Leerzeile; Body umbrochen bei 72, erklärt *was* und *warum*. **Kein** `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit. Branch: `claude/place-patch`.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — `.claude/guidelines/kotlin.md`.
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldBeNull`, …), mockk, Spring-Kontext-Tests mit `@Import(TestcontainersConfiguration::class)`. Frontend: Vitest + `vi`, nie mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung.
- **Keine redundanten Inline-Kommentare.** Kein Grabstein-Kommentar für Entferntes. Neue Kommentare nur, wo sie beim Lesen *dieser* Zeile einen Fehler verhindern — dann kurz, *was* und *warum*.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` **in** der Klasse, immer Lambda-Nachrichten.
- **Namen:** Spiel-Id `place-patch`, Anzeigename `Platzierung`, Modul/Schema `placepatch`, Klassen `PlacePatch*`. Die Bühne heißt im Code `scene`, **nie** `stage`.
- **Ströme:** Bild aus `random.scene`, `fraySeed` aus `random.presentation`, `x`/`y` aus `random.solution` (erst `x`, dann `y`).
- **Feste Zahlen (aus der Spec, wörtlich):**
  - Seitenverhältnis-Schwellen: Verhältnis ≥ `1.1547` → 4 : 3; ≤ `0.8660` → 3 : 4; dazwischen 1 : 1.
  - `COLS = 40`, `SIZE = 10`, `MAX_CELL_PX = 30` → Raster 40 × 30 / 40 × 40 / 40 × 53.
  - JPEG-Qualität `0.82`.
  - Fransen: Tiefe `0.15` der Ausschnittkante; Grenze `t · (0,35 + 0,65 · n)`; Oktaven Abstand `t` und `t/4`, Gewichte `0,65`/`0,35`; Glättung `3s² − 2s³`; weiche Kante `t/4`.
  - Asset-Schlüssel: `0` = Brett (JPEG, einkanalig grau), `1` = Ausschnitt (PNG mit Alpha). Kein `98`, kein `99`.
  - Tipp-Schwelle `TAP_SLOP_PX = 8`.
- **Wörtliche Texte:**
  - Kurztext InfoBox: `Finde die Stelle, an die der Ausschnitt gehört — aufs Feld genau.`
  - Frage unter dem Brett: `Wo gehört dieser Ausschnitt hin?`
  - Abgabeknopf: `Tipp bestätigen — gedrückt halten`
  - Bildfehler: `Das Bild ließ sich nicht laden.`
  - Ohne Darstellung: `Diese Runde lässt sich hier nicht anzeigen.`
  - Ranglisten-Zellen: `Treffer` / `daneben` / `aufgegeben`; Spaltenkopf `Treffer`; Caption `Alle Tipps der Runde, nach Punkten sortiert`.
- **Keine Farbe vor dem Tipp:** Kein Bild wird angefragt, solange die Runde versiegelt ist — die Bild-URLs reichen erst mit dem Payload zum Brett. Keine Lösung in Komponenten-State vor der Auflösung.
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`.
- **Formatierung:** vor `pnpm lint` die geänderten Frontend-Dateien mit `pnpm exec prettier --write <Dateien>` formatieren; die Code-Blöcke im Plan sind inhaltlich verbindlich, nicht in ihren Zeilenumbrüchen.
- **Nicht im Browser-Pane prüfbar:** Halten und die Auflösungs-Takte laufen über `requestAnimationFrame`, und der Pane meldet sich immer als versteckt. Die Handprobe gehört aufs Handy, im Labor.

## Review Focus

Was die Spec impliziert, aber kein Task von sich aus testet — jede Zeile ist einem Task als Test zugeordnet:

1. **Ein winziges Pool-Foto** (z. B. 30 × 20 px) darf die Runde nicht sprengen: die Zelle bleibt mindestens 1 px, das Brett entsteht. → Task 3 (`cellPx`) und Task 4 (`freeze`).
2. **Ein Bild, das nicht lädt** (Foto zwischen Ziehung und Ankündigung gelöscht → kein eingefrorenes Bild → 404), zeigt einen Satz statt einer leeren Fläche. → Task 9 (Brett: `error`-Ereignis).
3. **Ein Tipp außerhalb des Bretts** aus einer alten oder kaputten Zeile (`{x: 99, y: 3}` bei 40 Spalten) zeichnet keinen Rahmen neben das Bild und zählt als ohne Tipp. → Task 7 (`cellOf` mit Layout) und Task 8 (`scoreRows`).
4. **Ein abgebrochener Zug** (`pointercancel`, etwa wenn der Browser die Geste zum Scrollen übernimmt) lässt den Rahmen, wo er war, und gibt nichts ab. → Task 9.
5. **Neu geladen nach dem Tipp** zeigt den abgegebenen Rahmen, unverschiebbar. → Task 9 (`submitted`).

## File Structure

**Backend, neu:**

| Datei | Aufgabe |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/AspectRatio.kt` | Seitenverhältnis-Klasse eines Fotos |
| `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImageFit.kt` | Zuschnitt, Skalierung, JPEG/PNG |
| `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/PlayableImages.kt` | `ImagePoolQuery.playableIds` |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchLayout.kt` | Raster, Ausschnittgröße, Zellpixel |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/FrayMask.kt` | die Fransen |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImages.kt` | Einfrieren, Brett, Ausschnitt |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImageStore.kt` | Lesen/Schreiben der Rundenbilder |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/internal/PlacePatchRoundImage.kt` | Entität + Byte-Projektion |
| `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/internal/PlacePatchRoundImageRepository.kt` | Repository |
| `core/src/main/resources/db/migration/placepatch/V1__create_round_images.sql` | Schema + Tabelle |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlacePatchGameType.kt` | der Adapter |

**Backend, geändert:** `deduster/{DedusterGrid, DedusterImages, DedusterPool}.kt`, `imagepool/ImagePoolQuery.kt` (KDoc), `game/GameType.kt`, `game/GameCatalog.kt`, `game/internal/PlayService.kt`, `gamelab/internal/LabService.kt`; Tests `game/RoundAssetGateTest.kt`, `gamelab/LabServiceTest.kt`.

**Frontend, neu (`webapp-vue/src/games/placepatch/`):** `types.ts`, `stamp.ts`, `outlines.ts`, `scoreboard.ts`, `PlacePatchRules.vue`, `PlacePatchBriefing.vue`, `PlacePatchBoard.vue`, `PlacePatchScoreboard.vue`, `PlacePatchReveal.vue`, `PlacePatchGame.vue`, je mit Test unter `__tests__/`; dazu `webapp-vue/src/games/durations.ts` (hochgezogen).

**Frontend, geändert:** `games/findpattern/scoreboard.ts`, `games/findpattern/__tests__/scoreboard.spec.ts`, `games/spotobject/tips.ts`, `games/registry.ts`, `gamelab/games.ts`.

**Doku:** `.claude/guidelines/game-rounds.md`, Bild-Pool-Spec, Entstauber-Spec.

Reihenfolge: Pool-API (1) → Vertrag (2) → Modul `placepatch` (3–5) → Adapter (6) → Frontend rein (7–8) → Brett (9) → Auflösung (10) → Spiel + Registrierung (11) → Doku (12). Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber. Bis Task 6 gibt es das Spiel im Backend nicht; bis Task 11 rendert das Frontend es nicht.

Prüfbefehle, die jeder Task am Ende braucht:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

**Achtung nach Task 5 (neues Modul):** Spring Modulith liest `target/classes/META-INF/spring-modulith/application-modules.json`; nach einem neuen Modul ist sie veraltet. Deshalb dort `./mvnw clean test` — siehe `.claude/guidelines/modules-and-migrations.md`. Dasselbe, wenn ein voller Lauf mit Klassen gelöschter Quellen rot wird.

---

### Task 1: `imagepool` exportiert Bildauswahl, Seitenverhältnis und Zuschnitt

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/AspectRatio.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImageFit.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/PlayableImages.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolQuery.kt` (KDoc)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterGrid.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterImages.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterPool.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/AspectRatioTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageFitTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/PlayableImagesTest.kt`

**Interfaces:**
- Produces: `enum class AspectRatio(val width: Int, val height: Int) { LANDSCAPE, PORTRAIT, SQUARE }` mit `AspectRatio.of(width: Int, height: Int): AspectRatio`; `object ImageFit { fun centreCrop(source: BufferedImage, ratioWidth: Int, ratioHeight: Int): BufferedImage; fun scaled(source: BufferedImage, width: Int, height: Int): BufferedImage; fun fitted(source: BufferedImage, ratioWidth: Int, ratioHeight: Int, longEdge: Int): BufferedImage; fun jpeg(image: BufferedImage, quality: Float): ByteArray; fun png(image: BufferedImage): ByteArray }`; `fun ImagePoolQuery.playableIds(communityId: UUID): List<UUID>` — alles im Paket `org.unividuell.countdown.core.imagepool`.
- Entstauber behält `DedusterGrid.of`, `DedusterGrid.ofLayout`, `DedusterGrid.ratioWidth/ratioHeight`, `DedusterImages.render(source, grid, longEdge, quality)`, `DedusterPool.candidates(communityId)` — Signaturen unverändert. **Die bestehenden Tests unter `core/src/test/.../deduster/` werden nicht angefasst und müssen grün bleiben.**

- [ ] **Step 1: Die fallenden Tests schreiben**

`AspectRatioTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class AspectRatioTest {

    @Test
    fun `the thresholds are the geometric means of the three shapes`() {
        AspectRatio.of(width = 11547, height = 10000) shouldBe AspectRatio.LANDSCAPE
        AspectRatio.of(width = 11546, height = 10000) shouldBe AspectRatio.SQUARE
        AspectRatio.of(width = 8661, height = 10000) shouldBe AspectRatio.SQUARE
        AspectRatio.of(width = 8660, height = 10000) shouldBe AspectRatio.PORTRAIT
    }

    @Test
    fun `a phone photo lands on its orientation`() {
        AspectRatio.of(width = 4000, height = 3000) shouldBe AspectRatio.LANDSCAPE
        AspectRatio.of(width = 3000, height = 4000) shouldBe AspectRatio.PORTRAIT
        AspectRatio.of(width = 1080, height = 1080) shouldBe AspectRatio.SQUARE
    }

    @Test
    fun `each shape names its ratio`() {
        (AspectRatio.LANDSCAPE.width to AspectRatio.LANDSCAPE.height) shouldBe (4 to 3)
        (AspectRatio.PORTRAIT.width to AspectRatio.PORTRAIT.height) shouldBe (3 to 4)
        (AspectRatio.SQUARE.width to AspectRatio.SQUARE.height) shouldBe (1 to 1)
    }
}
```

`ImageFitTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

class ImageFitTest {

    /** Three vertical bands: red | green | blue, so a centre crop is visible in the result. */
    private fun bands(width: Int, height: Int): BufferedImage {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply {
            color = Color.RED; fillRect(0, 0, width / 3, height)
            color = Color.GREEN; fillRect(width / 3, 0, width / 3, height)
            color = Color.BLUE; fillRect(2 * width / 3, 0, width - 2 * width / 3, height)
            dispose()
        }
        return img
    }

    private fun decoded(bytes: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(bytes))

    @Test
    fun `a centre crop takes the middle at exactly the given ratio`() {
        val crop = ImageFit.centreCrop(source = bands(width = 2400, height = 600), ratioWidth = 4, ratioHeight = 3)

        crop.width shouldBe 800
        crop.height shouldBe 600
        val centre = Color(crop.getRGB(400, 300))
        (centre.green > centre.red && centre.green > centre.blue) shouldBe true
    }

    @Test
    fun `a centre crop hits an exact ratio that is no named shape`() {
        val crop = ImageFit.centreCrop(source = bands(width = 1200, height = 1600), ratioWidth = 40, ratioHeight = 53)

        crop.width shouldBe 1200
        crop.height shouldBe 1590
    }

    @Test
    fun `scaled lands on exactly the size asked for`() {
        val out = ImageFit.scaled(source = bands(width = 999, height = 501), width = 400, height = 300)

        out.width shouldBe 400
        out.height shouldBe 300
    }

    @Test
    fun `fitted scales down to the long edge and never up`() {
        val large = ImageFit.fitted(source = bands(width = 3000, height = 4000), ratioWidth = 3, ratioHeight = 4, longEdge = 1600)
        val small = ImageFit.fitted(source = bands(width = 300, height = 300), ratioWidth = 1, ratioHeight = 1, longEdge = 1600)

        (large.width to large.height) shouldBe (1200 to 1600)
        (small.width to small.height) shouldBe (300 to 300)
    }

    @Test
    fun `jpeg and png decode to the same size`() {
        val image = bands(width = 120, height = 90)

        decoded(ImageFit.jpeg(image = image, quality = 0.82f)).width shouldBe 120
        decoded(ImageFit.png(image)).height shouldBe 90
    }

    @Test
    fun `png keeps the alpha channel`() {
        val image = BufferedImage(2, 1, BufferedImage.TYPE_INT_ARGB)
        image.setRGB(0, 0, 0x00FF0000)
        image.setRGB(1, 0, 0xFF00FF00.toInt())

        val back = decoded(ImageFit.png(image))

        (back.getRGB(0, 0) ushr 24) shouldBe 0
        (back.getRGB(1, 0) ushr 24) shouldBe 255
    }
}
```

`PlayableImagesTest.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.collections.shouldBeEmpty
import io.kotest.matchers.collections.shouldContainExactly
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import java.util.UUID

class PlayableImagesTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val own = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val global = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val pool = mockk<ImagePoolQuery>()

    @Test
    fun `a community plays its own images, exclusively`() {
        every { pool.candidateIds(community) } returns listOf(own)
        every { pool.candidateIds(null) } returns listOf(global)

        pool.playableIds(community) shouldContainExactly listOf(own)
    }

    @Test
    fun `the global images are only the fallback`() {
        every { pool.candidateIds(community) } returns emptyList()
        every { pool.candidateIds(null) } returns listOf(global)

        pool.playableIds(community) shouldContainExactly listOf(global)
    }

    @Test
    fun `no images anywhere is no images`() {
        every { pool.candidateIds(any()) } returns emptyList()

        pool.playableIds(community).shouldBeEmpty()
    }
}
```

- [ ] **Step 2: Die Tests laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='AspectRatioTest,ImageFitTest,PlayableImagesTest'`
Expected: Kompilierfehler — `AspectRatio`, `ImageFit`, `playableIds` sind unbekannt.

- [ ] **Step 3: Die drei Exporte schreiben**

`AspectRatio.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

/**
 * The three shapes a pool photo is played in. The pool is fed by phone cameras, so a photo is
 * cropped to the nearest shape rather than shown however it came.
 */
enum class AspectRatio(val width: Int, val height: Int) {
    LANDSCAPE(width = 4, height = 3),
    PORTRAIT(width = 3, height = 4),
    SQUARE(width = 1, height = 1),
    ;

    companion object {
        /** √(4/3) and √(3/4): the geometric means of neighbouring shapes — every photo gets the crop that cuts least. */
        private const val LANDSCAPE_FROM = 1.1547
        private const val PORTRAIT_UP_TO = 0.8660

        fun of(width: Int, height: Int): AspectRatio {
            val ratio = width.toDouble() / height
            return when {
                ratio >= LANDSCAPE_FROM -> LANDSCAPE
                ratio <= PORTRAIT_UP_TO -> PORTRAIT
                else -> SQUARE
            }
        }
    }
}
```

`ImageFit.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.roundToInt

/** Cropping, scaling and encoding a pool photo for play — image knowledge, shared by every image game. */
object ImageFit {

    /** The middle of [source] at exactly [ratioWidth] : [ratioHeight], as large as fits. A view, not a copy. */
    fun centreCrop(source: BufferedImage, ratioWidth: Int, ratioHeight: Int): BufferedImage {
        val wide = source.width.toLong() * ratioHeight > source.height.toLong() * ratioWidth
        val width = if (wide) (source.height.toLong() * ratioWidth / ratioHeight).toInt() else source.width
        val height = if (wide) source.height else (source.width.toLong() * ratioHeight / ratioWidth).toInt()
        return source.getSubimage((source.width - width) / 2, (source.height - height) / 2, width, height)
    }

    /** [source] drawn into exactly [width] × [height], bilinear. */
    fun scaled(source: BufferedImage, width: Int, height: Int): BufferedImage {
        val target = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = target.createGraphics()
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
            graphics.drawImage(source, 0, 0, width, height, null)
        } finally {
            graphics.dispose()
        }
        return target
    }

    /** Centre crop to the ratio, then down — never up — until the long edge is at most [longEdge]. */
    fun fitted(source: BufferedImage, ratioWidth: Int, ratioHeight: Int, longEdge: Int): BufferedImage {
        val crop = centreCrop(source = source, ratioWidth = ratioWidth, ratioHeight = ratioHeight)
        val scale = minOf(a = 1.0, b = longEdge.toDouble() / max(a = crop.width, b = crop.height))
        return scaled(
            source = crop,
            width = max(a = 1, b = (crop.width * scale).roundToInt()),
            height = max(a = 1, b = (crop.height * scale).roundToInt()),
        )
    }

    fun jpeg(image: BufferedImage, quality: Float): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val out = ByteArrayOutputStream()
        try {
            ImageIO.createImageOutputStream(out).use { stream ->
                writer.output = stream
                val param = writer.defaultWriteParam.apply {
                    compressionMode = ImageWriteParam.MODE_EXPLICIT
                    compressionQuality = quality
                }
                writer.write(null, IIOImage(image, null, null), param)
            }
        } finally {
            writer.dispose()
        }
        return out.toByteArray()
    }

    fun png(image: BufferedImage): ByteArray {
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, "png", out)) { "no PNG writer for ${image.type}" }
        return out.toByteArray()
    }
}
```

`PlayableImages.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import java.util.UUID

/**
 * The images a community plays with: its own, and the global ones only when it has none — how
 * every game picks. An extension, not an interface method: tests that mock [ImagePoolQuery] keep
 * working with `candidateIds` stubbed alone.
 */
fun ImagePoolQuery.playableIds(communityId: UUID): List<UUID> =
    candidateIds(communityId).ifEmpty { candidateIds(null) }
```

In `ImagePoolQuery.kt` den Halbsatz im KDoc ersetzen — alt:

```kotlin
 * The pool as other modules see it: which images there are, and what one looks like. Read-only,
 * and without a word of game knowledge — which pool a game prefers is the game's rule.
```

neu:

```kotlin
 * The pool as other modules see it: which images there are, and what one looks like. Read-only,
 * and without a word of game knowledge — which images a community plays is [playableIds].
```

- [ ] **Step 4: Die neuen Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='AspectRatioTest,ImageFitTest,PlayableImagesTest'`
Expected: PASS.

- [ ] **Step 5: Entstauber umstellen**

`DedusterGrid.kt` — vollständig ersetzen:

```kotlin
package org.unividuell.countdown.core.deduster

import org.unividuell.countdown.core.imagepool.AspectRatio

/**
 * The grid a round is played on and the ratio its photo is cropped to. The tile count is fixed —
 * 48 or 49 — because average reaction times are only comparable across rounds of the same length;
 * the grid follows the photo's shape instead, since the pool is fed by phone cameras.
 */
enum class DedusterGrid(val cols: Int, val rows: Int, val aspect: AspectRatio) {
    LANDSCAPE(cols = 8, rows = 6, aspect = AspectRatio.LANDSCAPE),
    PORTRAIT(cols = 6, rows = 8, aspect = AspectRatio.PORTRAIT),
    SQUARE(cols = 7, rows = 7, aspect = AspectRatio.SQUARE),
    ;

    val ratioWidth: Int get() = aspect.width
    val ratioHeight: Int get() = aspect.height
    val tiles: Int get() = cols * rows

    companion object {
        fun of(width: Int, height: Int): DedusterGrid {
            val aspect = AspectRatio.of(width = width, height = height)
            return entries.single { it.aspect == aspect }
        }

        /** The grid a round's frozen `cols`/`rows` were drawn as. */
        fun ofLayout(cols: Int, rows: Int): DedusterGrid = entries.single { it.cols == cols && it.rows == rows }
    }
}
```

`DedusterImages.kt` — `companion object` ersetzen (die Klasse und `playImage` bleiben):

```kotlin
    companion object {
        /** Centre crop to [grid]'s ratio, then down (never up) to [longEdge], as a JPEG at [quality]. */
        fun render(source: BufferedImage, grid: DedusterGrid, longEdge: Int, quality: Float): ByteArray =
            ImageFit.jpeg(
                image = ImageFit.fitted(
                    source = source, ratioWidth = grid.ratioWidth, ratioHeight = grid.ratioHeight, longEdge = longEdge,
                ),
                quality = quality,
            )
    }
```

Die nun unbenutzten Imports (`RenderingHints`, `ByteArrayOutputStream`, `IIOImage`, `ImageIO`, `ImageWriteParam`, `max`, `roundToInt`) entfernen; `import org.unividuell.countdown.core.imagepool.ImageFit` ergänzen.

`DedusterPool.kt` — `candidates` und die Klassen-KDoc:

```kotlin
/** The game's view of the image pool: which images a round may draw, and the grid each one gets. */
@Component
class DedusterPool(private val pool: ImagePoolQuery) {

    fun candidates(communityId: UUID): List<UUID> = pool.playableIds(communityId)
```

mit `import org.unividuell.countdown.core.imagepool.playableIds`. `gridOf` bleibt.

- [ ] **Step 6: Entstaubers Tests, Modularität und den Rest laufen lassen**

Run: `cd core && ./mvnw test -Dtest='Deduster*,RoundImageStoreTest,ModularityTests,AspectRatioTest,ImageFitTest,PlayableImagesTest'`
Expected: PASS — ohne dass eine Testdatei unter `deduster/` geändert wurde.

Dann der volle Lauf: `cd core && ./mvnw test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/imagepool core/src/main/kotlin/org/unividuell/countdown/core/deduster core/src/test/kotlin/org/unividuell/countdown/core/imagepool
git commit -F - <<'EOF'
Share pool selection and cropping across image games

A second image game is coming, and three things Entstauber keeps to
itself would otherwise exist twice: which images a community plays
(its own, else the global ones), the shape class a photo is cropped
to, and the crop/scale/encode itself. None of them is a game's rule,
so they move into imagepool's exported API.

playableIds is an extension rather than an interface method: tests
mock ImagePoolQuery and stub candidateIds alone.

Entstauber switches over; its tests are unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `GameType.assetStage` — zwei Bilder hinter einem Aufdecken

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt` (`GameTypeHandle`)
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt:234`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt` (`asset`, Zweig `else ->`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetGateTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabAssetStageTest.kt` (neu)

**Interfaces:**
- Produces: `GameType.assetStage(params: P, key: Int): Int` mit Vorgabe `key`; `GameTypeHandle.assetStage(params: JsonNode, key: Int): Int`.
- `PlayService.asset` und `LabService.asset` prüfen `assetStage(params, key) in 0..stage` statt `key in 0..stage`. `SCENE_ASSET_KEY` und `SOLUTION_ASSET_KEY` bleiben vor dieser Prüfung, wie sie sind.

- [ ] **Step 1: Den fallenden Test für die echte Runde schreiben**

In `RoundAssetGateTest.kt`, in `class GatedGame` eine zweite Bean neben `gatedGame()`:

```kotlin
        /** One stage, two images: both open with the reveal, a key mapped above stage 0 does not. */
        @Bean
        fun pairedGame(): GameType<GatedParams> = object : GameType<GatedParams> {
            override val id = "paired-fake"
            override val displayName = "Doppelbild"
            override val paramsType = GatedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = GatedParams(answer = "42")
            override fun present(params: GatedParams) = GatedPayload(stages = 1)
            override fun judge(params: GatedParams, guess: JsonNode) =
                Judgement(qualifies = false, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: GatedParams) = false
            override fun scoresOnDuration(params: GatedParams) = false
            override fun assetStage(params: GatedParams, key: Int) = if (key == 1) 0 else key
            override fun asset(params: GatedParams, roundGameId: UUID, key: Int): RoundAsset? =
                if (key in 0..2) RoundAsset(mediaType = "image/png", bytes = byteArrayOf(key.toByte())) else null
        }
```

Den Helfer `announceGated` um den Spieltyp erweitern (Signatur und die eine Stelle im Rumpf):

```kotlin
    /** Announces the current round as [gameType] with answer "42". */
    private fun announceGated(community: Community, gameType: String = "gated-fake"): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundNumber = currentRoundNumberOf(community)
        store.announce(
            edition = edition, roundNumber = roundNumber,
            gameType = gameType, params = mapper.readTree("""{"answer":"42"}"""),
            award = Award(rule = AwardRule.ALL_QUALIFYING, points = 1), announcedAt = clock.instant(),
        )
        return roundNumber
    }
```

Und der Test:

```kotlin
    @Test
    fun `a single-stage game's second image opens with the reveal, a key mapped above it does not`() {
        val (community, viewer) = aCommunity("Asset Gate Paired")
        val roundNumber = announceGated(community = community, gameType = "paired-fake")
        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, key = 1,
        ).bytes shouldBe byteArrayOf(1)
        shouldThrow<AssetForbiddenException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = 2,
            )
        }
    }
```

- [ ] **Step 2: Den fallenden Test für das Labor schreiben**

`core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabAssetStageTest.kt`:

```kotlin
package org.unividuell.countdown.core.gamelab

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MemberIdentityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException
import org.unividuell.countdown.core.gamelab.internal.LabService
import tools.jackson.databind.JsonNode
import java.util.UUID

/** The lab's asset gate asks the game which stage a key belongs to, exactly as `PlayService.asset` does. */
@Import(TestcontainersConfiguration::class, LabAssetStageTest.PairedGame::class)
@SpringBootTest
class LabAssetStageTest(@Autowired val service: LabService) {

    @TestConfiguration
    class PairedGame {
        data class PairedParams(val answer: String)
        data class PairedPayload(val images: Int) : GamePayload

        @Bean
        fun pairedGame(): GameType<PairedParams> = object : GameType<PairedParams> {
            override val id = "paired-fake"
            override val displayName = "Doppelbild"
            override val paramsType = PairedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = PairedParams(answer = "42")
            override fun present(params: PairedParams) = PairedPayload(images = 2)
            override fun judge(params: PairedParams, guess: JsonNode) =
                Judgement(qualifies = false, deviation = 0.0, outcome = null)
            override fun requiresReveal(params: PairedParams) = false
            override fun scoresOnDuration(params: PairedParams) = false
            override fun assetStage(params: PairedParams, key: Int) = if (key == 1) 0 else key
            override fun produceAssets(params: PairedParams) = (0..2).associateWith {
                RoundAsset(mediaType = "image/png", bytes = byteArrayOf(it.toByte()))
            }
        }
    }

    @MockkBean lateinit var communities: CommunityQuery
    @MockkBean lateinit var memberships: MembershipQuery
    @MockkBean lateinit var identities: MemberIdentityQuery

    private val communityId = UUID.randomUUID()
    private val slug = "paired"
    private val tester = UUID.randomUUID()

    @Test
    fun `a single-stage game's second image opens with the first, a key mapped above stays shut`() {
        every { communities.findBySlug(slug) } returns
            Community(id = communityId, name = "Paired", slug = slug, createdBy = UUID.randomUUID())
        every { memberships.isActiveMember(communityId = communityId, userId = tester) } returns true
        every { identities.of(communityId = any(), userIds = any<Collection<UUID>>()) } returns emptyMap()

        service.open(
            slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE, userId = tester, isSuperAdmin = false,
        )

        service.asset(
            slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE,
            userId = tester, isSuperAdmin = false, key = 1,
        ).bytes shouldBe byteArrayOf(1)
        shouldThrow<LabAssetForbiddenException> {
            service.asset(
                slug = slug, gameId = "paired-fake", seed = 7, phase = Phase.ONE,
                userId = tester, isSuperAdmin = false, key = 2,
            )
        }
    }
}
```

- [ ] **Step 3: Die Tests laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='RoundAssetGateTest,LabAssetStageTest'`
Expected: Kompilierfehler — `assetStage` überschreibt nichts.

- [ ] **Step 4: Vertrag, Handle und die zwei Tore**

In `GameType.kt`, direkt nach `fun stages(params: P): Int = 1`:

```kotlin
    /**
     * Which stage releases asset [key] before the guess. The default is the key itself —
     * Anspielung's ladder, one clip per stage. A single-stage game with two images maps both to 0.
     * A stopgap until the asset model is cleaned up as a whole (unividuell/countdown#101).
     */
    fun assetStage(params: P, key: Int): Int = key
```

In `GameCatalog.kt`, `GameTypeHandle`, nach `stages`:

```kotlin
    /** Which stage releases asset [key], from a stored `params` blob. */
    fun assetStage(params: JsonNode, key: Int): Int = type.assetStage(params = paramsOf(params), key = key)
```

In `PlayService.asset` die Zeile

```kotlin
        val allowed = if (key == SOLUTION_ASSET_KEY) play.guessedAt != null else key in 0..play.stage
```

ersetzen durch

```kotlin
        val allowed = if (key == SOLUTION_ASSET_KEY) {
            play.guessedAt != null
        } else {
            announced.handle.assetStage(params = announced.roundGame.params, key = key) in 0..play.stage
        }
```

In `LabService.asset` im `when (key)` den Zweig

```kotlin
            else -> key in 0..stage
```

ersetzen durch

```kotlin
            else -> handle.assetStage(params = playing.params, key = key) in 0..stage
```

- [ ] **Step 5: Die Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='RoundAssetGateTest,LabAssetStageTest,LabStagedFlowTest,PlayServiceStagedTest'`
Expected: PASS — die bestehenden Stufen-Tests (Anspielung) unverändert grün.

Dann `cd core && ./mvnw test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetGateTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabAssetStageTest.kt
git commit -F - <<'EOF'
Let a game say which stage releases an asset

Before the guess the gate opens key in 0..stage, so a key is a stage
and a single-stage game can hold exactly one image behind its reveal.
Platzierung needs two, the board and the patch.

GameType.assetStage(params, key) defaults to the key itself, so every
existing game keeps its gate; a game with two images maps both to 0.
PlayService and the lab ask the same question. A stopgap until the
asset model is cleaned up as a whole (#101).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `placepatch` — Raster und Fransenmaske

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchLayout.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/FrayMask.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchLayoutTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/placepatch/FrayMaskTest.kt`

**Interfaces:**
- Consumes: `AspectRatio` (Task 1); `org.unividuell.countdown.core.rng.SeededRandom` (`fromSeed(seed: Int)`, `nextDouble()`).
- Produces: `data class PlacePatchLayout(val cols: Int, val rows: Int, val size: Int)` mit `fun cellPx(cropWidth: Int): Int` und `companion { const val COLS = 40; const val SIZE = 10; const val MAX_CELL_PX = 30; fun of(aspect: AspectRatio, cols: Int = COLS, size: Int = SIZE): PlacePatchLayout }`; `object FrayMask { const val DEPTH = 0.15; fun alpha(width: Int, height: Int, depth: Double, seed: Int): FloatArray }` — Zeilenweise, Index `y * width + x`, Werte in `[0, 1]`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`PlacePatchLayoutTest.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.AspectRatio

class PlacePatchLayoutTest {

    @Test
    fun `the rows follow the photo's shape at 40 columns`() {
        PlacePatchLayout.of(aspect = AspectRatio.LANDSCAPE) shouldBe PlacePatchLayout(cols = 40, rows = 30, size = 10)
        PlacePatchLayout.of(aspect = AspectRatio.SQUARE) shouldBe PlacePatchLayout(cols = 40, rows = 40, size = 10)
        PlacePatchLayout.of(aspect = AspectRatio.PORTRAIT) shouldBe PlacePatchLayout(cols = 40, rows = 53, size = 10)
    }

    @Test
    fun `another grid is two constants away`() {
        PlacePatchLayout.of(aspect = AspectRatio.LANDSCAPE, cols = 20, size = 5) shouldBe
            PlacePatchLayout(cols = 20, rows = 15, size = 5)
    }

    @Test
    fun `a cell is whole, square, at most 30 px, and never zero`() {
        val layout = PlacePatchLayout(cols = 40, rows = 30, size = 10)

        layout.cellPx(cropWidth = 2000) shouldBe 30
        layout.cellPx(cropWidth = 1200) shouldBe 30
        layout.cellPx(cropWidth = 400) shouldBe 10
        layout.cellPx(cropWidth = 30) shouldBe 1
    }
}
```

`FrayMaskTest.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.collections.shouldHaveAtLeastSize
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test

class FrayMaskTest {

    private val side = 100
    private val depth = 15.0

    private fun edgeDistance(x: Int, y: Int) = minOf(x, y, side - 1 - x, side - 1 - y) + 0.5

    @Test
    fun `the outer band is always transparent`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        for (y in 0 until side) for (x in 0 until side) {
            if (edgeDistance(x = x, y = y) <= 0.35 * depth) alpha[y * side + x] shouldBe 0f
        }
    }

    @Test
    fun `beyond the depth and its soft edge the patch is opaque`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        for (y in 0 until side) for (x in 0 until side) {
            if (edgeDistance(x = x, y = y) >= depth + depth / 4) alpha[y * side + x] shouldBe 1f
        }
    }

    @Test
    fun `the boundary wanders - the edge is no straight line`() {
        val alpha = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)

        // Along the top border: how deep does the first half-opaque pixel sit in each column?
        val depths = (20 until 80).map { x -> (0 until side).first { y -> alpha[y * side + x] >= 0.5f } }

        depths.toSet() shouldHaveAtLeastSize 3
    }

    @Test
    fun `the same seed frays the same way, another seed differently`() {
        val a = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)
        val b = FrayMask.alpha(width = side, height = side, depth = depth, seed = 7)
        val c = FrayMask.alpha(width = side, height = side, depth = depth, seed = 8)

        a.toList() shouldBe b.toList()
        a.toList() shouldNotBe c.toList()
    }

    @Test
    fun `no depth is no fraying`() {
        FrayMask.alpha(width = 4, height = 3, depth = 0.0, seed = 7).toSet() shouldBe setOf(1f)
    }
}
```

- [ ] **Step 2: Die Tests laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchLayoutTest,FrayMaskTest'`
Expected: Kompilierfehler — `PlacePatchLayout`, `FrayMask` sind unbekannt.

- [ ] **Step 3: `PlacePatchLayout` und `FrayMask` schreiben**

`PlacePatchLayout.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import org.unividuell.countdown.core.imagepool.AspectRatio
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The board a round is played on: [cols] × [rows] square cells, the patch [size] × [size] of them.
 * e.g. a 4:3 photo at 40 columns → 40 × 30 cells, the patch 10 × 10.
 */
data class PlacePatchLayout(val cols: Int, val rows: Int, val size: Int) {

    /** Pixels per cell for a crop [cropWidth] wide: whole, at most [MAX_CELL_PX], never zero. */
    fun cellPx(cropWidth: Int): Int = max(a = 1, b = min(a = MAX_CELL_PX, b = cropWidth / cols))

    companion object {
        /**
         * Kept flexible: a round freezes its own cols, rows and size, and everything after the draw
         * reads them from there — changing these reaches new rounds only.
         */
        const val COLS = 40
        const val SIZE = 10
        const val MAX_CELL_PX = 30

        fun of(aspect: AspectRatio, cols: Int = COLS, size: Int = SIZE) = PlacePatchLayout(
            cols = cols,
            rows = (cols.toDouble() * aspect.height / aspect.width).roundToInt(),
            size = size,
        )
    }
}
```

`FrayMask.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import org.unividuell.countdown.core.rng.SeededRandom
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

/**
 * The alpha that frays a patch's border: transparent at the edge, opaque inside, the boundary
 * wandering between 35 % and 100 % of the depth — so no crisp edge pins the patch to a cell.
 * Ported from the spike's `frayMask` (branch `claude/find-patch-game-spike`).
 * e.g. a 300 px patch at depth 45: the outermost 16–45 px fade, differently every few px.
 */
object FrayMask {
    /** Share of the patch side that frays. */
    const val DEPTH = 0.15

    fun alpha(width: Int, height: Int, depth: Double, seed: Int): FloatArray {
        if (depth <= 0.0) return FloatArray(width * height) { 1f }
        val random = SeededRandom.fromSeed(seed)
        val coarse = ValueNoise(width = width, height = height, spacing = max(a = 2.0, b = depth), random = random)
        val fine = ValueNoise(width = width, height = height, spacing = max(a = 1.0, b = depth / 4), random = random)
        val soft = max(a = 1.0, b = depth / 4)
        return FloatArray(width * height) { i ->
            val x = i % width
            val y = i / width
            val edge = minOf(x, y, width - 1 - x, height - 1 - y) + 0.5
            val n = 0.65 * coarse.at(x = x, y = y) + 0.35 * fine.at(x = x, y = y)
            ((edge - depth * (0.35 + 0.65 * n)) / soft).coerceIn(minimumValue = 0.0, maximumValue = 1.0).toFloat()
        }
    }
}

/** A smooth random field in [0, 1]: lattice values [spacing] px apart, eased between. */
private class ValueNoise(width: Int, height: Int, private val spacing: Double, random: SeededRandom) {
    private val cols = ceil(width / spacing).toInt() + 2
    private val values = DoubleArray(cols * (ceil(height / spacing).toInt() + 2)) { random.nextDouble() }

    fun at(x: Int, y: Int): Double {
        val gx = x / spacing
        val gy = y / spacing
        val x0 = floor(gx).toInt()
        val y0 = floor(gy).toInt()
        val tx = ease(gx - x0)
        val ty = ease(gy - y0)
        val top = lerp(a = lattice(cx = x0, cy = y0), b = lattice(cx = x0 + 1, cy = y0), t = tx)
        val bottom = lerp(a = lattice(cx = x0, cy = y0 + 1), b = lattice(cx = x0 + 1, cy = y0 + 1), t = tx)
        return lerp(a = top, b = bottom, t = ty)
    }

    private fun lattice(cx: Int, cy: Int) = values[cy * cols + cx]

    private fun ease(t: Double) = t * t * (3 - 2 * t)

    private fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t
}
```

- [ ] **Step 4: Die Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchLayoutTest,FrayMaskTest,ModularityTests'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/placepatch core/src/test/kotlin/org/unividuell/countdown/core/placepatch
git commit -F - <<'EOF'
Lay out Platzierung's board and fray its patch

The board is 40 columns of square cells, its rows following the photo's
shape (30, 40 or 53); the patch is 10 x 10 cells. The constants are
read only at the draw, so a later grid reaches new rounds only.

The fray mask is the spike's, ported: the patch fades out towards its
border, the boundary wandering between 35 and 100 % of a depth of 15 %
of its side, on value noise seeded per round.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `placepatch` — Foto einfrieren, Brett und Ausschnitt ableiten

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImages.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImagesTest.kt`

**Interfaces:**
- Consumes: `ImagePoolQuery.displayed(id, minShortEdge)`, `ImageFit` (Task 1), `PlacePatchLayout`, `FrayMask` (Task 3).
- Produces: `@Component class PlacePatchImages(pool: ImagePoolQuery) { fun frozen(imageId: UUID, layout: PlacePatchLayout): ByteArray? }` mit `companion object { fun freeze(source: BufferedImage, layout: PlacePatchLayout): ByteArray; fun board(frozen: ByteArray): ByteArray; fun patch(frozen: ByteArray, layout: PlacePatchLayout, x: Int, y: Int, fraySeed: Int): ByteArray }`. `freeze` und `board` liefern JPEG, `patch` PNG mit Alpha.

- [ ] **Step 1: Die fallenden Tests schreiben**

`PlacePatchImagesTest.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.ints.shouldBeGreaterThanOrEqual
import io.kotest.matchers.ints.shouldBeLessThanOrEqual
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.math.abs

class PlacePatchImagesTest {

    private val landscape = PlacePatchLayout(cols = 40, rows = 30, size = 10)

    private fun solid(width: Int, height: Int, color: Color): BufferedImage {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { this.color = color; fillRect(0, 0, width, height); dispose() }
        return img
    }

    private fun decoded(bytes: ByteArray): BufferedImage = ImageIO.read(ByteArrayInputStream(bytes))

    private fun channels(rgb: Int) = Triple((rgb shr 16) and 0xFF, (rgb shr 8) and 0xFF, rgb and 0xFF)

    @Test
    fun `a frozen photo is the layout's cells, at most 30 px each`() {
        val wide = decoded(PlacePatchImages.freeze(source = solid(width = 2000, height = 1500, color = Color.BLUE), layout = landscape))
        val portrait = decoded(
            PlacePatchImages.freeze(
                source = solid(width = 3000, height = 4000, color = Color.BLUE),
                layout = PlacePatchLayout(cols = 40, rows = 53, size = 10),
            ),
        )

        (wide.width to wide.height) shouldBe (1200 to 900)
        (portrait.width to portrait.height) shouldBe (1200 to 1590)
    }

    @Test
    fun `a small photo is not blown up, a tiny one still yields a board`() {
        val small = decoded(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.BLUE), layout = landscape))
        val tiny = decoded(PlacePatchImages.freeze(source = solid(width = 30, height = 20, color = Color.BLUE), layout = landscape))

        (small.width to small.height) shouldBe (400 to 300)
        (tiny.width to tiny.height) shouldBe (40 to 30)
    }

    @Test
    fun `frozen asks the pool for enough pixels and says null when the image is gone`() {
        val gone = UUID.randomUUID()
        val pool = mockk<ImagePoolQuery> {
            every { displayed(id = gone, minShortEdge = 900) } returns null
        }

        PlacePatchImages(pool).frozen(imageId = gone, layout = landscape).shouldBeNull()
    }

    @Test
    fun `the board is grey, and equally light colours become the same grey`() {
        // OKLab lightness of pure red is 0.628, which is the grey (136, 136, 136).
        val photo = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)
        photo.createGraphics().apply {
            color = Color(255, 0, 0); fillRect(0, 0, 200, 300)
            color = Color(136, 136, 136); fillRect(200, 0, 200, 300)
            dispose()
        }

        val board = decoded(PlacePatchImages.board(PlacePatchImages.freeze(source = photo, layout = landscape)))
        val (r, g, b) = channels(board.getRGB(100, 150))
        val (grey, _, _) = channels(board.getRGB(300, 150))

        (r == g && g == b) shouldBe true
        abs(r - grey) shouldBeLessThanOrEqual 4
    }

    @Test
    fun `white stays white and black stays black`() {
        val white = decoded(
            PlacePatchImages.board(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.WHITE), layout = landscape)),
        )
        val black = decoded(
            PlacePatchImages.board(PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.BLACK), layout = landscape)),
        )

        channels(white.getRGB(200, 150)).first shouldBe 255
        channels(black.getRGB(200, 150)).first shouldBe 0
    }

    @Test
    fun `the patch is its cells in colour, opaque inside, transparent at the edge`() {
        val frozen = PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color(0, 0, 255)), layout = landscape)

        val patch = decoded(PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 5, y = 5, fraySeed = 11))
        val centre = patch.getRGB(50, 50)

        (patch.width to patch.height) shouldBe (100 to 100)
        (centre ushr 24) shouldBe 255
        channels(centre).third shouldBeGreaterThanOrEqual 240
        (patch.getRGB(0, 0) ushr 24) shouldBe 0
    }

    @Test
    fun `the patch is the same for the same round and frays differently for another seed`() {
        val frozen = PlacePatchImages.freeze(source = solid(width = 400, height = 300, color = Color.GREEN), layout = landscape)
        fun alphas(seed: Int) = decoded(PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = seed))
            .let { img -> (0 until img.height).flatMap { y -> (0 until img.width).map { x -> img.getRGB(x, y) ushr 24 } } }

        PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = 11) shouldBe
            PlacePatchImages.patch(frozen = frozen, layout = landscape, x = 2, y = 3, fraySeed = 11)
        alphas(seed = 11) shouldNotBe alphas(seed = 12)
    }
}
```

- [ ] **Step 2: Die Tests laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchImagesTest'`
Expected: Kompilierfehler — `PlacePatchImages` ist unbekannt.

- [ ] **Step 3: `PlacePatchImages` schreiben**

```kotlin
package org.unividuell.countdown.core.placepatch

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.imagepool.ImageFit
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO
import kotlin.math.cbrt
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * A round's photo frozen for play, and the two pictures the player is shown — both derived from
 * it on every request, a pure function of the frozen bytes and the round's params.
 */
@Component
class PlacePatchImages(private val pool: ImagePoolQuery) {

    /** The pool photo cropped and scaled for [layout]; `null` when the pool image is gone. */
    fun frozen(imageId: UUID, layout: PlacePatchLayout): ByteArray? =
        pool.displayed(id = imageId, minShortEdge = min(a = layout.cols, b = layout.rows) * PlacePatchLayout.MAX_CELL_PX)
            ?.let { freeze(source = it, layout = layout) }

    companion object {
        private const val QUALITY = 0.82f

        /** sRGB byte → linear light, once. */
        private val LINEAR = DoubleArray(256) {
            val c = it / 255.0
            if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }

        /** Centre crop to exactly cols : rows, scaled to whole square cells. */
        fun freeze(source: BufferedImage, layout: PlacePatchLayout): ByteArray {
            val crop = ImageFit.centreCrop(source = source, ratioWidth = layout.cols, ratioHeight = layout.rows)
            val cell = layout.cellPx(cropWidth = crop.width)
            return ImageFit.jpeg(
                image = ImageFit.scaled(source = crop, width = layout.cols * cell, height = layout.rows * cell),
                quality = QUALITY,
            )
        }

        /** The board: the frozen photo in neutral grey of the same OKLab lightness, single-channel. */
        fun board(frozen: ByteArray): ByteArray {
            val photo = decode(frozen)
            val grey = BufferedImage(photo.width, photo.height, BufferedImage.TYPE_BYTE_GRAY)
            val raster = grey.raster
            for (y in 0 until photo.height) {
                for (x in 0 until photo.width) raster.setSample(x, y, 0, greyOf(photo.getRGB(x, y)))
            }
            return ImageFit.jpeg(image = grey, quality = QUALITY)
        }

        /** The patch: `layout.size` cells from ([x], [y]), in colour, its border frayed by [fraySeed]. */
        fun patch(frozen: ByteArray, layout: PlacePatchLayout, x: Int, y: Int, fraySeed: Int): ByteArray {
            val photo = decode(frozen)
            val cell = photo.width / layout.cols
            val side = layout.size * cell
            val alpha = FrayMask.alpha(width = side, height = side, depth = FrayMask.DEPTH * side, seed = fraySeed)
            val out = BufferedImage(side, side, BufferedImage.TYPE_INT_ARGB)
            for (py in 0 until side) {
                for (px in 0 until side) {
                    val rgb = photo.getRGB(x * cell + px, y * cell + py) and 0xFFFFFF
                    out.setRGB(px, py, ((alpha[py * side + px] * 255).roundToInt() shl 24) or rgb)
                }
            }
            return ImageFit.png(out)
        }

        private fun decode(bytes: ByteArray): BufferedImage =
            checkNotNull(ImageIO.read(ByteArrayInputStream(bytes))) { "frozen photo does not decode" }

        /**
         * The grey of the same OKLab lightness: two colours the eye calls equally light become one
         * grey, which is what makes the patch's colour the information. Linear Y = L³ for a grey.
         */
        private fun greyOf(rgb: Int): Int {
            val r = LINEAR[(rgb shr 16) and 0xFF]
            val g = LINEAR[(rgb shr 8) and 0xFF]
            val b = LINEAR[rgb and 0xFF]
            val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
            val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
            val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
            val lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
            val y = lightness.coerceIn(minimumValue = 0.0, maximumValue = 1.0).pow(3)
            val encoded = if (y <= 0.0031308) 12.92 * y else 1.055 * y.pow(1 / 2.4) - 0.055
            return (255 * encoded).roundToInt().coerceIn(minimumValue = 0, maximumValue = 255)
        }
    }
}
```

- [ ] **Step 4: Die Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchImagesTest,ModularityTests'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImages.kt core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImagesTest.kt
git commit -F - <<'EOF'
Derive Platzierung's board and patch from one photo

The round keeps one picture: the pool photo cropped to exactly
cols : rows and scaled to whole square cells of at most 30 px. Board
and patch are derived from it on every request, so they need no
storage of their own.

The board is grey of the same OKLab lightness, single-channel JPEG:
two colours the eye calls equally light become one grey, and only the
patch carries colour. The patch is a PNG whose alpha is the fray mask.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `placepatch` — Tabelle und Store

**Files:**
- Create: `core/src/main/resources/db/migration/placepatch/V1__create_round_images.sql`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/internal/PlacePatchRoundImage.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/internal/PlacePatchRoundImageRepository.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImageStore.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImageStoreTest.kt`

**Interfaces:**
- Produces: `class FrozenPhoto(val mediaType: String, val bytes: ByteArray)`; `@Component class PlacePatchImageStore { fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray); fun find(roundGameId: UUID): FrozenPhoto?; fun release(roundGameIds: List<UUID>): Int }` — beide im Paket `org.unividuell.countdown.core.placepatch`.

- [ ] **Step 1: Den fallenden Test schreiben**

`PlacePatchImageStoreTest.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlacePatchImageStoreTest(@Autowired val store: PlacePatchImageStore) {

    @Test
    fun `bytes go in and come out`() {
        val round = UUID.randomUUID()
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(1, 2))

        val found = store.find(round).shouldNotBeNull()
        found.mediaType shouldBe "image/jpeg"
        found.bytes shouldBe byteArrayOf(1, 2)
    }

    @Test
    fun `the first writer wins - the announce race runs the hook twice`() {
        val round = UUID.randomUUID()
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(1))
        store.store(roundGameId = round, mediaType = "image/jpeg", bytes = byteArrayOf(2))

        store.find(round).shouldNotBeNull().bytes shouldBe byteArrayOf(1)
    }

    @Test
    fun `release deletes the given rounds and nothing else`() {
        val gone = UUID.randomUUID()
        val kept = UUID.randomUUID()
        listOf(gone, kept).forEach { store.store(roundGameId = it, mediaType = "image/jpeg", bytes = byteArrayOf(0)) }

        store.release(listOf(gone)) shouldBe 1
        store.find(gone).shouldBeNull()
        store.find(kept).shouldNotBeNull()
    }
}
```

- [ ] **Step 2: Den Test laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchImageStoreTest'`
Expected: Kompilierfehler — `PlacePatchImageStore` ist unbekannt.

- [ ] **Step 3: Migration, Entität, Repository, Store**

`V1__create_round_images.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS placepatch;

CREATE TABLE placepatch.round_images (
    -- Soft reference into game.round_games, deliberately no foreign key — the same reason as
    -- deduster.round_images: the code arrow points game -> placepatch, so this schema migrates
    -- first, and a cross-schema FK against that arrow cannot be created on a fresh database.
    round_game_id UUID        PRIMARY KEY,
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`internal/PlacePatchRoundImage.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/** Plain class: ByteArray equality is identity. Written only through the repository's insert. */
@Table(schema = "placepatch", name = "round_images")
class PlacePatchRoundImage(
    @Id
    val roundGameId: UUID,
    val mediaType: String,
    val bytes: ByteArray,
    val createdAt: Instant? = null,
)

/** Two columns, no id: see `deduster`'s byte projection. */
class PlacePatchRoundImageBytes(val mediaType: String, val bytes: ByteArray)
```

`internal/PlacePatchRoundImageRepository.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface PlacePatchRoundImageRepository : CrudRepository<PlacePatchRoundImage, UUID> {

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO placepatch.round_images (round_game_id, media_type, bytes)
        VALUES (:roundGameId, :mediaType, :bytes)
        ON CONFLICT (round_game_id) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, mediaType: String, bytes: ByteArray): Int

    @Query("SELECT media_type, bytes FROM placepatch.round_images WHERE round_game_id = :roundGameId")
    fun findBytes(roundGameId: UUID): PlacePatchRoundImageBytes?

    @Modifying
    @Query("DELETE FROM placepatch.round_images WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
```

`PlacePatchImageStore.kt`:

```kotlin
package org.unividuell.countdown.core.placepatch

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.placepatch.internal.PlacePatchRoundImageRepository
import java.util.UUID

/** A round's frozen photo. Plain class: ByteArray equality is identity. */
class FrozenPhoto(val mediaType: String, val bytes: ByteArray)

/**
 * Written once at announcement, read on every board or patch request, kept as long as the round is
 * shown: the history renders past rounds, and both pictures come from this one photo.
 */
@Component
class PlacePatchImageStore(private val repository: PlacePatchRoundImageRepository) {

    @Transactional
    fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID): FrozenPhoto? =
        repository.findBytes(roundGameId)?.let { FrozenPhoto(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
```

- [ ] **Step 4: Sauber bauen und testen — neues Modul**

Run: `cd core && ./mvnw clean test -Dtest='PlacePatchImageStoreTest,ModularityTests'`
Expected: PASS. (`clean`, weil `application-modules.json` das Modul sonst nicht kennt und seine Migration nicht läuft.)

- [ ] **Step 5: Commit**

```bash
git add core/src/main/resources/db/migration/placepatch core/src/main/kotlin/org/unividuell/countdown/core/placepatch core/src/test/kotlin/org/unividuell/countdown/core/placepatch/PlacePatchImageStoreTest.kt
git commit -F - <<'EOF'
Store Platzierung's frozen photo per round

One row per round in placepatch.round_images, written at announcement
with ON CONFLICT DO NOTHING because both callers of an announce race
run the hook. The round keeps its own copy, so deleting the pool image
later changes nothing.

The classes carry the PlacePatch prefix: Spring names beans after the
simple class name, and deduster already has a RoundImageStore.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Der Adapter `PlacePatchGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlacePatchGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlacePatchGameTypeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServicePlacePatchTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`

**Interfaces:**
- Consumes: `ImagePoolQuery`, `playableIds`, `AspectRatio` (Task 1); `assetStage` (Task 2); `PlacePatchLayout` (Task 3); `PlacePatchImages` (Task 4); `PlacePatchImageStore`, `FrozenPhoto` (Task 5).
- Produces (Wire-Vertrag fürs Frontend): Game-Id `place-patch`; Bühne `{ cols, rows }`; Payload `{ cols, rows, size }`; Lösung `{ x, y }`; Outcome `{ correct }`; Tipp `{ x, y }`; Assets `0` = Brett (`image/jpeg`), `1` = Ausschnitt (`image/png`), beide frei mit dem Aufdecken.

- [ ] **Step 1: Die fallenden Unit-Tests schreiben**

`PlacePatchGameTypeTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.ints.shouldBeGreaterThan
import io.kotest.matchers.ints.shouldBeInRange
import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.game.internal.PlacePatchGameType
import org.unividuell.countdown.core.game.internal.PlacePatchOutcome
import org.unividuell.countdown.core.game.internal.PlacePatchParams
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import org.unividuell.countdown.core.placepatch.FrozenPhoto
import org.unividuell.countdown.core.placepatch.PlacePatchImageStore
import org.unividuell.countdown.core.placepatch.PlacePatchImages
import org.unividuell.countdown.core.placepatch.PlacePatchLayout
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.awt.image.BufferedImage
import java.util.UUID

class PlacePatchGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val imageA = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val imageB = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val roundGameId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000f1")

    private val mapper = JsonMapper.builder().build()
    private val pool = mockk<ImagePoolQuery> {
        every { candidateIds(community) } returns listOf(imageA, imageB)
        every { candidateIds(null) } returns emptyList()
        every { displaySize(any()) } returns ImageSize(width = 400, height = 300)
    }
    private val images = mockk<PlacePatchImages>()
    private val store = mockk<PlacePatchImageStore>(relaxed = true)
    private val game = PlacePatchGameType(pool = pool, images = images, store = store, mapper = mapper)

    private val frozen = PlacePatchImages.freeze(
        source = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB),
        layout = PlacePatchLayout(cols = 40, rows = 30, size = 10),
    )

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(previous: List<PlacePatchParams> = emptyList(), phase: Phase = Phase.ONE) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    private fun guess(json: String) = mapper.readTree(json)

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "place-patch"
        game.displayName shouldBe "Platzierung"
    }

    @Test
    fun `a drawn round lays out the photo's grid and hides the patch inside it`() {
        val params = draw()

        (params.cols to params.rows) shouldBe (40 to 30)
        params.size shouldBe 10
        params.x shouldBeInRange 0..30
        params.y shouldBeInRange 0..20
        params.imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `an image this edition already had is not drawn again, a used-up pool counts in full`() {
        val earlier = draw().copy(imageId = imageA)
        repeat(20) { seed ->
            draw(random = random(scene = seed), context = context(previous = listOf(earlier))).imageId shouldBe imageB
        }

        val used = listOf(draw().copy(imageId = imageA), draw().copy(imageId = imageB))
        draw(context = context(previous = used)).imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `the image follows the scene seed only`() {
        draw(random = random(solution = 9, presentation = 9, scene = 3)).imageId shouldBe draw(random = random(scene = 3)).imageId
        (1..40).map { draw(random = random(scene = it)).imageId }.toSet() shouldBe setOf(imageA, imageB)
    }

    @Test
    fun `the fray follows the presentation seed only`() {
        draw(random = random(solution = 9, scene = 9, presentation = 2)).fraySeed shouldBe draw(random = random(presentation = 2)).fraySeed
        (1..20).map { draw(random = random(presentation = it)).fraySeed }.toSet().size shouldBeGreaterThan 1
    }

    @Test
    fun `the position follows the solution seed only`() {
        val a = draw(random = random(solution = 1))
        val b = draw(random = random(solution = 1, presentation = 77, scene = 3))

        (b.x to b.y) shouldBe (a.x to a.y)
        (1..20).map { draw(random = random(solution = it)).let { p -> p.x to p.y } }.toSet().size shouldBeGreaterThan 1
    }

    @Test
    fun `phase two is timed - one deliberate reveal, scored on the clock`() {
        val one = draw(context = context(phase = Phase.ONE))
        val two = draw(context = context(phase = Phase.TWO))

        one.timed shouldBe false
        game.requiresReveal(one) shouldBe false
        game.scoresOnDuration(one) shouldBe false
        two.timed shouldBe true
        game.requiresReveal(two) shouldBe true
        game.scoresOnDuration(two) shouldBe true
    }

    @Test
    fun `scene, payload, solution and outcome carry exactly their fields`() {
        val params = draw()

        fields(game.scene(params)) shouldBe setOf("cols", "rows")
        fields(game.present(params)) shouldBe setOf("cols", "rows", "size")
        fields(game.solution(params)) shouldBe setOf("x", "y")
        fields(game.judge(params = params, guess = guess("""{"x":0,"y":0}""")).outcome) shouldBe setOf("correct")
    }

    @Test
    fun `only the exact cell is a hit`() {
        val params = draw().copy(x = 7, y = 4)

        game.judge(params = params, guess = guess("""{"x":7,"y":4}""")).let {
            it.qualifies shouldBe true
            it.deviation shouldBe 0.0
            it.outcome shouldBe PlacePatchOutcome(correct = true)
        }
        listOf(6 to 4, 8 to 4, 7 to 3, 7 to 5).forEach { (x, y) ->
            game.judge(params = params, guess = guess("""{"x":$x,"y":$y}""")).qualifies shouldBe false
        }
    }

    @Test
    fun `the corners of the board are valid guesses`() {
        val params = draw()

        game.judge(params = params, guess = guess("""{"x":0,"y":0}""")).outcome.shouldNotBeNull()
        game.judge(params = params, guess = guess("""{"x":30,"y":20}""")).outcome.shouldNotBeNull()
    }

    @Test
    fun `a malformed or out-of-board guess is refused before anything is written`() {
        val params = draw()
        listOf(
            """{"x":-1,"y":0}""",
            """{"x":31,"y":0}""",
            """{"x":0,"y":21}""",
            """{"y":0}""",
            """{"x":1.5,"y":0}""",
            """{"x":"3","y":0}""",
            """{"x":9999999999,"y":0}""",
        ).forEach { json ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = guess(json)) }
        }
    }

    @Test
    fun `it is available while the community or the global pool has an image`() {
        game.isAvailable(context()) shouldBe true

        every { pool.candidateIds(any()) } returns emptyList()
        game.isAvailable(context()) shouldBe false
    }

    @Test
    fun `board and patch both open with the reveal, every other key keeps its own stage`() {
        val params = draw()

        game.assetStage(params = params, key = 0) shouldBe 0
        game.assetStage(params = params, key = 1) shouldBe 0
        game.assetStage(params = params, key = 2) shouldBe 2
    }

    @Test
    fun `the photo is frozen once, and a second call freezes nothing`() {
        val params = draw()
        every { images.frozen(imageId = params.imageId, layout = any()) } returns frozen
        every { store.find(roundGameId) } returns null

        game.materialised(params = params, roundGameId = roundGameId)

        verify(exactly = 1) { store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = frozen) }

        every { store.find(roundGameId) } returns FrozenPhoto(mediaType = "image/jpeg", bytes = frozen)
        game.materialised(params = params, roundGameId = roundGameId)
        verify(exactly = 1) { images.frozen(imageId = any(), layout = any()) }
    }

    @Test
    fun `a vanished pool image yields no assets rather than a broken round`() {
        every { images.frozen(imageId = any(), layout = any()) } returns null

        game.produceAssets(draw()).shouldBeEmpty()
    }

    @Test
    fun `the board is a JPEG and the patch a PNG, both from the stored photo`() {
        every { store.find(roundGameId) } returns FrozenPhoto(mediaType = "image/jpeg", bytes = frozen)
        val params = draw()

        game.asset(params = params, roundGameId = roundGameId, key = 0).shouldNotBeNull().mediaType shouldBe "image/jpeg"
        game.asset(params = params, roundGameId = roundGameId, key = 1).shouldNotBeNull().mediaType shouldBe "image/png"
        game.asset(params = params, roundGameId = roundGameId, key = SOLUTION_ASSET_KEY).shouldBeNull()
        game.asset(params = params, roundGameId = roundGameId, key = SCENE_ASSET_KEY).shouldBeNull()
    }

    @Test
    fun `the lab gets both pictures at once`() {
        every { images.frozen(imageId = any(), layout = any()) } returns frozen

        game.produceAssets(draw()).keys shouldBe setOf(0, 1)
    }

    @Test
    fun `the history keeps the photo, archiving deletes it`() {
        game.releaseStageAssets(listOf(roundGameId))
        verify(exactly = 0) { store.release(any()) }

        game.releaseAssets(listOf(roundGameId))
        verify(exactly = 1) { store.release(listOf(roundGameId)) }
    }
}
```

- [ ] **Step 2: Die Tests laufen lassen und scheitern sehen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchGameTypeTest'`
Expected: Kompilierfehler — `PlacePatchGameType` ist unbekannt.

- [ ] **Step 3: Den Adapter schreiben**

`PlacePatchGameType.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameScene
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.imagepool.AspectRatio
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.playableIds
import org.unividuell.countdown.core.placepatch.PlacePatchImageStore
import org.unividuell.countdown.core.placepatch.PlacePatchImages
import org.unividuell.countdown.core.placepatch.PlacePatchLayout
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * The frozen round. [x]/[y] — the patch's top-left cell — are the answer and never leave the server
 * as numbers before the guess. [imageId] is a soft reference into the pool and, once the round is
 * announced, only provenance: the round keeps its own copy of the photo.
 *
 * [timed] is how the phase reaches [PlacePatchGameType.requiresReveal], as in Musterung.
 */
data class PlacePatchParams(
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val size: Int,
    val x: Int,
    val y: Int,
    val fraySeed: Int,
    val timed: Boolean,
)

/** What the cover lies over: the board's shape, nothing drawn. */
data class PlacePatchScene(val cols: Int, val rows: Int) : GameScene

/** What the player needs to lay out the board. Both pictures come through the round's asset endpoint. */
data class PlacePatchPayload(val cols: Int, val rows: Int, val size: Int) : GamePayload

data class PlacePatchSolution(val x: Int, val y: Int) : GameSolution

/** Hit or not — the whole verdict. */
data class PlacePatchOutcome(val correct: Boolean) : GameOutcome

/**
 * Platzierung as an announceable game; `placepatch` knows nothing about it.
 *
 * The draws are split by publication: the image from the scene stream (its grid is in the scene),
 * the fray seed from the presentation stream (it shows with the patch), the position from the
 * solution stream, x before y.
 */
@Component
class PlacePatchGameType(
    private val pool: ImagePoolQuery,
    private val images: PlacePatchImages,
    private val store: PlacePatchImageStore,
    private val mapper: ObjectMapper,
) : GameType<PlacePatchParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "place-patch"
    override val displayName = "Platzierung"
    override val paramsType = PlacePatchParams::class.java

    override fun isAvailable(context: RoundContext) = pool.playableIds(context.communityId).isNotEmpty()

    override fun draw(random: GameRandom, context: RoundContext): PlacePatchParams {
        val candidates = pool.playableIds(context.communityId)
        val used = context.previousParams.map { mapper.treeToValue(it, PlacePatchParams::class.java).imageId }.toSet()
        // A pool of three images must not starve: once each has had its round, all count again.
        val imageId = random.scene.pick(candidates.filterNot { it in used }.ifEmpty { candidates })
        val shown = checkNotNull(pool.displaySize(imageId)) { "image $imageId vanished between listing and measuring" }
        val layout = PlacePatchLayout.of(aspect = AspectRatio.of(width = shown.width, height = shown.height))
        return PlacePatchParams(
            imageId = imageId,
            cols = layout.cols,
            rows = layout.rows,
            size = layout.size,
            x = random.solution.nextIntBetween(min = 0, maxInclusive = layout.cols - layout.size),
            y = random.solution.nextIntBetween(min = 0, maxInclusive = layout.rows - layout.size),
            fraySeed = random.presentation.nextInt(Int.MAX_VALUE),
            timed = context.phase == Phase.TWO,
        )
    }

    override fun scene(params: PlacePatchParams) = PlacePatchScene(cols = params.cols, rows = params.rows)

    override fun present(params: PlacePatchParams) =
        PlacePatchPayload(cols = params.cols, rows = params.rows, size = params.size)

    /** Phase two only, as in Musterung: there the reveal starts the clock, exactly once. */
    override fun requiresReveal(params: PlacePatchParams) = params.timed

    override fun scoresOnDuration(params: PlacePatchParams) = params.timed

    override fun judge(params: PlacePatchParams, guess: JsonNode): Judgement {
        val x = cellOf(guess = guess, field = "x", max = params.cols - params.size)
        val y = cellOf(guess = guess, field = "y", max = params.rows - params.size)
        val correct = x == params.x && y == params.y
        // Hit or miss has no distance. For a timed round the framework replaces this with the duration.
        return Judgement(qualifies = correct, deviation = 0.0, outcome = PlacePatchOutcome(correct = correct))
    }

    override fun solution(params: PlacePatchParams) = PlacePatchSolution(x = params.x, y = params.y)

    override fun assetStage(params: PlacePatchParams, key: Int) =
        if (key == BOARD_KEY || key == PATCH_KEY) 0 else key

    override fun produceAssets(params: PlacePatchParams): Map<Int, RoundAsset> {
        val frozen = images.frozen(imageId = params.imageId, layout = layoutOf(params)) ?: run {
            logger.warn { "place-patch image ${params.imageId} is gone; the round has no photo" }
            return emptyMap()
        }
        return mapOf(BOARD_KEY to board(frozen), PATCH_KEY to patch(params = params, frozen = frozen))
    }

    /** Idempotent: the race's second caller finds the row and freezes nothing a second time. */
    override fun materialised(params: PlacePatchParams, roundGameId: UUID) {
        if (store.find(roundGameId) != null) return
        val frozen = images.frozen(imageId = params.imageId, layout = layoutOf(params)) ?: run {
            logger.warn { "place-patch image ${params.imageId} is gone; round $roundGameId has no photo" }
            return
        }
        store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = frozen)
    }

    override fun asset(params: PlacePatchParams, roundGameId: UUID, key: Int): RoundAsset? {
        if (key != BOARD_KEY && key != PATCH_KEY) return null
        val frozen = store.find(roundGameId)?.bytes ?: return null
        return if (key == BOARD_KEY) board(frozen) else patch(params = params, frozen = frozen)
    }

    // releaseStageAssets stays the no-op default: the history shows past rounds, both pictures included.

    override fun releaseAssets(roundGameIds: List<UUID>) {
        store.release(roundGameIds)
    }

    private fun layoutOf(params: PlacePatchParams) =
        PlacePatchLayout(cols = params.cols, rows = params.rows, size = params.size)

    private fun board(frozen: ByteArray) = RoundAsset(mediaType = "image/jpeg", bytes = PlacePatchImages.board(frozen))

    private fun patch(params: PlacePatchParams, frozen: ByteArray) = RoundAsset(
        mediaType = "image/png",
        bytes = PlacePatchImages.patch(
            frozen = frozen, layout = layoutOf(params), x = params.x, y = params.y, fraySeed = params.fraySeed,
        ),
    )

    private fun cellOf(guess: JsonNode, field: String, max: Int): Int {
        val value = guess.get(field)
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            ?.takeIf { it.isIntegralNumber && it.canConvertToInt() }
            ?.asInt()
            ?: throw InvalidGuessException("guess must carry an integral '$field' in int range")
        if (value !in 0..max) throw InvalidGuessException("$field must lie in [0, $max], was $value")
        return value
    }

    companion object {
        const val BOARD_KEY = 0
        const val PATCH_KEY = 1
    }
}
```

- [ ] **Step 4: Die Unit-Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='PlacePatchGameTypeTest'`
Expected: PASS.

- [ ] **Step 5: Den fallenden Durchstich durch `PlayService` schreiben**

`PlayServicePlacePatchTest.kt` (Vorlage: `PlayServiceDedusterTest`):

```kotlin
package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.Community
import org.unividuell.countdown.core.community.CommunityMember
import org.unividuell.countdown.core.community.MemberStatus
import org.unividuell.countdown.core.community.internal.CommunityEditionRepository
import org.unividuell.countdown.core.community.internal.CommunityMemberRepository
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.countdown.CountdownEngine
import org.unividuell.countdown.core.game.internal.AssetForbiddenException
import org.unividuell.countdown.core.game.internal.NotRevealedException
import org.unividuell.countdown.core.game.internal.PlacePatchParams
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import tools.jackson.databind.ObjectMapper
import java.awt.Color
import java.awt.image.BufferedImage
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServicePlacePatchTest(
    @Autowired val play: PlayService,
    @Autowired val catalog: GameCatalog,
    @Autowired val communities: CommunityService,
    @Autowired val editions: CommunityEditionRepository,
    @Autowired val store: RoundGameStore,
    @Autowired val plays: RoundPlayRepository,
    @Autowired val members: CommunityMemberRepository,
    @Autowired val engine: CountdownEngine,
    @Autowired val clock: Clock,
    @Autowired val users: UserRepository,
    @Autowired val mapper: ObjectMapper,
) {
    @MockkBean lateinit var pool: ImagePoolQuery

    private val image = UUID.fromString("0190f1b2-0000-7000-8000-0000000071ac")

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(subject = System.nanoTime().toString(), githubLogin = login)).id)

    private fun aMember(community: Community, login: String): UUID {
        val user = aUser(login)
        members.save(CommunityMember(communityId = requireNotNull(community.id), userId = user, status = MemberStatus.ACTIVE))
        return user
    }

    private fun aCommunity(): Community {
        val community = communities.create(creatorUserId = aUser("owner"), rawName = "Platzierung Flow")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        return community
    }

    private fun roundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(), startsAt = requireNotNull(edition.startsAt), zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** One real, timed Platzierung round, announced and materialised with its photo. */
    private fun announced(community: Community): Pair<Int, PlacePatchParams> {
        val photo = BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)
        photo.createGraphics().apply { color = Color.ORANGE; fillRect(0, 0, 200, 300); dispose() }
        every { pool.candidateIds(any()) } returns listOf(image)
        every { pool.displaySize(image) } returns ImageSize(width = 400, height = 300)
        every { pool.displayed(id = image, minShortEdge = any()) } returns photo

        val handle = catalog.handle("place-patch").shouldNotBeNull()
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val number = roundNumberOf(community)
        val params = handle.draw(
            random = GameRandom.fromSeed(4711),
            context = RoundContext(communityId = requireNotNull(community.id), roundNumber = number, phase = Phase.TWO),
        )
        val round = store.announce(
            edition = edition, roundNumber = number, gameType = "place-patch", params = params,
            award = Award(rule = AwardRule.CLOSEST_ONLY, points = 3), announcedAt = clock.instant(),
        )
        handle.materialised(params = params, roundGameId = requireNotNull(round.id))
        return number to mapper.treeToValue(params, PlacePatchParams::class.java)
    }

    @Test
    fun `board and patch open with the one reveal, and only then`() {
        val community = aCommunity()
        val player = aMember(community = community, login = "player")
        val (number, _) = announced(community)

        shouldThrow<NotRevealedException> {
            play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 0)
        }

        val revealed = play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)
        mapper.valueToTree<tools.jackson.databind.JsonNode>(revealed.scene).propertyNames().toSet() shouldBe
            setOf("cols", "rows")

        play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 0)
            .mediaType shouldBe "image/jpeg"
        play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 1)
            .mediaType shouldBe "image/png"
        shouldThrow<AssetForbiddenException> {
            play.asset(slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = 2)
        }
    }

    @Test
    fun `the exact cell qualifies, one off does not, and the duration is published`() {
        val community = aCommunity()
        val hitter = aMember(community = community, login = "hitter")
        val misser = aMember(community = community, login = "misser")
        val (number, params) = announced(community)
        val offX = if (params.x == 0) 1 else params.x - 1

        play.reveal(slug = community.slug, userId = hitter, isSuperAdmin = false)
        val hit = play.guess(
            slug = community.slug, userId = hitter, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"x":${params.x},"y":${params.y}}"""),
        )
        play.reveal(slug = community.slug, userId = misser, isSuperAdmin = false)
        play.guess(
            slug = community.slug, userId = misser, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"x":$offX,"y":${params.y}}"""),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val roundGameId = requireNotNull(store.find(edition = edition, roundNumber = number)?.id)
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = hitter).shouldNotBeNull().qualifies shouldBe true
        plays.findByRoundGameIdAndUserId(roundGameId = roundGameId, userId = misser).shouldNotBeNull().qualifies shouldBe false
        hit.me.shouldNotBeNull().durationMs.shouldNotBeNull()
    }
}
```

- [ ] **Step 6: Das Labor kennt das Spiel**

In `LabServiceTest.kt`, in `aValidGuessFor` vor dem `else`-Zweig:

```kotlin
        "place-patch" -> mapper.readTree("""{"x":0,"y":0}""")
```

Und ein Test (Import `org.unividuell.countdown.core.gamelab.internal.LabAssetForbiddenException` ergänzen):

```kotlin
    @Test
    fun `place-patch serves its board and its patch from one stage`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "place-patch", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        service.asset(
            slug = community.slug, gameId = "place-patch", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, key = 0,
        ).mediaType shouldBe "image/jpeg"
        service.asset(
            slug = community.slug, gameId = "place-patch", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, key = 1,
        ).mediaType shouldBe "image/png"
        shouldThrow<LabAssetForbiddenException> {
            service.asset(
                slug = community.slug, gameId = "place-patch", seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false, key = 2,
            )
        }
    }
```

- [ ] **Step 7: Alles laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS — darunter `PlacePatchGameTypeTest`, `PlayServicePlacePatchTest`, `LabServiceTest` (auch die Schleife über alle Spiele), `LabPointsParityTest`, `ModularityTests`.

- [ ] **Step 8: Commit**

```bash
git add core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlacePatchGameType.kt core/src/test/kotlin/org/unividuell/countdown/core/game/PlacePatchGameTypeTest.kt core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServicePlacePatchTest.kt core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt
git commit -F - <<'EOF'
Announce Platzierung as a round game

A colour patch of a pool photo has to be placed on the grey photo,
exactly: only the patch's own top-left cell is a hit. Phase one pays
every hit, phase two needs the one reveal and pays the fastest hit -
Musterung's rules, through requiresReveal = scoresOnDuration = timed.

The image is drawn from the scene stream (its grid is in the scene),
the fray seed from the presentation stream, the position from the
solution stream. Board and patch are assets 0 and 1, both released by
the reveal through assetStage; there is no solution asset, the colour
original never leaves the server.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Frontend — Typen und Rahmen-Platzierung

**Files:**
- Create: `webapp-vue/src/games/placepatch/types.ts`
- Create: `webapp-vue/src/games/placepatch/stamp.ts`
- Test: `webapp-vue/src/games/placepatch/__tests__/types.spec.ts`
- Test: `webapp-vue/src/games/placepatch/__tests__/stamp.spec.ts`

**Interfaces:**
- Produces (`types.ts`): `BOARD_ASSET_KEY = 0`, `PATCH_ASSET_KEY = 1`; `interface PlacePatchPayload { cols; rows; size }`, `interface PlacePatchScene { cols; rows }`, `interface PlacePatchSolution { x; y }`, `interface Cell { x; y }`; `asPlacePatchPayload(value: unknown): PlacePatchPayload | null`, `asPlacePatchScene(value: unknown): PlacePatchScene | null`, `asPlacePatchSolution(value: unknown, layout: PlacePatchPayload | null): PlacePatchSolution | null`, `cellOf(guess: unknown, layout: PlacePatchPayload | null): Cell | null`.
- Produces (`stamp.ts`): `TAP_SLOP_PX = 8`; `interface Board { cols; rows; size; cellPx }`, `interface Point { x; y }` (CSS-px ab der linken oberen Brettecke), `interface Gesture { start: Point; from: Point; dragging: boolean }`; `centredAt(board, point): Cell`, `clamp(board, cell): Cell`, `press(board, stamp: Cell | null, point): Gesture`, `drag(board, gesture, point): { gesture: Gesture; stamp: Cell | null }`, `release(board, gesture, point, current: Cell | null): Cell | null`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`__tests__/types.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  asPlacePatchPayload,
  asPlacePatchScene,
  asPlacePatchSolution,
  cellOf,
} from '@/games/placepatch/types'

const LAYOUT = { cols: 40, rows: 30, size: 10 }

describe('placepatch types', () => {
  it('takes a payload of three whole numbers with the patch inside the board', () => {
    expect(asPlacePatchPayload(LAYOUT)).toEqual(LAYOUT)
    expect(asPlacePatchPayload({ cols: 40, rows: 30 })).toBeNull()
    expect(asPlacePatchPayload({ cols: 40, rows: 30, size: 41 })).toBeNull()
    expect(asPlacePatchPayload({ cols: 40.5, rows: 30, size: 10 })).toBeNull()
    expect(asPlacePatchPayload(null)).toBeNull()
  })

  it('takes a scene of two whole numbers', () => {
    expect(asPlacePatchScene({ cols: 40, rows: 53 })).toEqual({ cols: 40, rows: 53 })
    expect(asPlacePatchScene({ cols: 40, rows: Number.NaN })).toBeNull()
  })

  it('takes a solution only where a patch fits', () => {
    expect(asPlacePatchSolution({ x: 7, y: 4 }, LAYOUT)).toEqual({ x: 7, y: 4 })
    expect(asPlacePatchSolution({ x: 31, y: 4 }, LAYOUT)).toBeNull()
    expect(asPlacePatchSolution({ x: 7, y: 4 }, null)).toBeNull()
  })

  it('reads a guess as a cell on the board, and nothing else', () => {
    expect(cellOf({ x: 0, y: 20 }, LAYOUT)).toEqual({ x: 0, y: 20 })
    expect(cellOf({ x: 99, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: -1, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: 1.5, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf({ x: Number.NaN, y: 3 }, LAYOUT)).toBeNull()
    expect(cellOf(null, LAYOUT)).toBeNull()
    expect(cellOf({ x: 1, y: 3 }, null)).toBeNull()
  })
})
```

`__tests__/stamp.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TAP_SLOP_PX, centredAt, clamp, drag, press, release } from '@/games/placepatch/stamp'

// 40 × 30 cells of 10 px, a 10 × 10 stamp.
const BOARD = { cols: 40, rows: 30, size: 10, cellPx: 10 }

describe('stamp', () => {
  it('centres an even stamp on the nearest crossing, an odd one on the cell', () => {
    expect(centredAt(BOARD, { x: 123, y: 87 })).toEqual({ x: 7, y: 4 })
    expect(centredAt({ ...BOARD, size: 3 }, { x: 57, y: 57 })).toEqual({ x: 4, y: 4 })
  })

  it('keeps the stamp inside the board on all four sides', () => {
    expect(clamp(BOARD, { x: -3, y: -1 })).toEqual({ x: 0, y: 0 })
    expect(clamp(BOARD, { x: 35, y: 25 })).toEqual({ x: 30, y: 20 })
  })

  it('treats a lift within the slop as a tap and centres the stamp there', () => {
    const gesture = press(BOARD, null, { x: 123, y: 87 })
    const moved = drag(BOARD, gesture, { x: 123 + TAP_SLOP_PX - 1, y: 87 })

    expect(moved.stamp).toBeNull()
    expect(release(BOARD, moved.gesture, { x: 124, y: 88 }, null)).toEqual({ x: 7, y: 4 })
  })

  it('moves an existing stamp by the finger’s travel, wherever the finger is', () => {
    const gesture = press(BOARD, { x: 5, y: 5 }, { x: 300, y: 200 })

    const first = drag(BOARD, gesture, { x: 334, y: 200 })
    expect(first.stamp).toEqual({ x: 8, y: 5 })

    const second = drag(BOARD, first.gesture, { x: 339, y: 221 })
    expect(second.stamp).toEqual({ x: 9, y: 7 })
    expect(release(BOARD, second.gesture, { x: 339, y: 221 }, second.stamp)).toEqual({ x: 9, y: 7 })
  })

  it('does not stick on slow moves - travel counts from the start, not per step', () => {
    let gesture = press(BOARD, { x: 5, y: 5 }, { x: 0, y: 0 })
    let stamp = null
    for (let px = 2; px <= 16; px += 2) {
      const next = drag(BOARD, gesture, { x: px, y: 0 })
      gesture = next.gesture
      stamp = next.stamp ?? stamp
    }

    expect(stamp).toEqual({ x: 7, y: 5 })
  })

  it('starts a drag without a stamp from one centred under the finger', () => {
    const gesture = press(BOARD, null, { x: 100, y: 100 })

    expect(drag(BOARD, gesture, { x: 140, y: 100 }).stamp).toEqual({ x: 9, y: 5 })
  })

  it('stays a drag once it was one, even back inside the slop', () => {
    const gesture = press(BOARD, { x: 5, y: 5 }, { x: 0, y: 0 })
    const away = drag(BOARD, gesture, { x: 30, y: 0 })
    const back = drag(BOARD, away.gesture, { x: 2, y: 0 })

    expect(back.stamp).toEqual({ x: 5, y: 5 })
    expect(release(BOARD, back.gesture, { x: 2, y: 0 }, back.stamp)).toEqual({ x: 5, y: 5 })
  })

  it('never drags the stamp off the board', () => {
    const gesture = press(BOARD, { x: 28, y: 18 }, { x: 0, y: 0 })

    expect(drag(BOARD, gesture, { x: 200, y: 200 }).stamp).toEqual({ x: 30, y: 20 })
  })
})
```

- [ ] **Step 2: Die Tests laufen lassen und scheitern sehen**

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/types.spec.ts src/games/placepatch/__tests__/stamp.spec.ts`
Expected: FAIL — die Module fehlen.

- [ ] **Step 3: `types.ts` und `stamp.ts` schreiben**

`types.ts`:

```ts
/**
 * What the server sends, narrowed by hand. `payload`, `solution` and every stored guess arrive as
 * `unknown` by contract, and a stale round may be junk — narrowing here is what keeps `NaN` and a
 * box beside the board out of the picture.
 */

/** The server's `PlacePatchGameType.BOARD_KEY` / `PATCH_KEY` — both released by the reveal. */
export const BOARD_ASSET_KEY = 0
export const PATCH_ASSET_KEY = 1

export interface PlacePatchPayload {
  cols: number
  rows: number
  size: number
}

/** The board's shape under the cover — the server's `PlacePatchScene`. */
export interface PlacePatchScene {
  cols: number
  rows: number
}

export interface PlacePatchSolution {
  x: number
  y: number
}

/** The top-left cell of a patch or a stamp. */
export interface Cell {
  x: number
  y: number
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function asPlacePatchPayload(value: unknown): PlacePatchPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const { cols, rows, size } = value as Partial<PlacePatchPayload>
  if (!isWhole(cols) || !isWhole(rows) || !isWhole(size)) return null
  if (size < 1 || size > cols || size > rows) return null
  return { cols, rows, size }
}

export function asPlacePatchScene(value: unknown): PlacePatchScene | null {
  if (typeof value !== 'object' || value === null) return null
  const { cols, rows } = value as Partial<PlacePatchScene>
  if (!isWhole(cols) || !isWhole(rows) || cols < 1 || rows < 1) return null
  return { cols, rows }
}

/** A cell where a whole patch fits on [layout], or `null` — a give-up has none, nor has junk. */
export function cellOf(value: unknown, layout: PlacePatchPayload | null): Cell | null {
  if (layout === null || typeof value !== 'object' || value === null) return null
  const { x, y } = value as Partial<Cell>
  if (!isWhole(x) || !isWhole(y)) return null
  if (x < 0 || y < 0 || x > layout.cols - layout.size || y > layout.rows - layout.size) return null
  return { x, y }
}

export function asPlacePatchSolution(
  value: unknown,
  layout: PlacePatchPayload | null,
): PlacePatchSolution | null {
  return cellOf(value, layout)
}
```

`stamp.ts`:

```ts
/**
 * Placing the stamp, as arithmetic — happy-dom computes no layout, so this is the half a test can
 * drive. The board hands in pointer positions in CSS px from its top-left corner and gets cells
 * back.
 *
 * A tap puts the stamp under the finger; a drag moves it by the finger's travel, so the finger can
 * stay beside the stamp and not hide it. e.g. a stamp at (5, 5) with 10 px cells, dragged 34 px
 * right → (8, 5); the travel counts from where the drag began, so slow moves never stick.
 */
import type { Cell } from './types'

/** Travel below this is a tap — a finger never lifts exactly where it landed. */
export const TAP_SLOP_PX = 8

export interface Board {
  cols: number
  rows: number
  size: number
  /** CSS px per cell, as the board is drawn right now. */
  cellPx: number
}

export interface Point {
  x: number
  y: number
}

export interface Gesture {
  /** Where the pointer went down. */
  start: Point
  /** The stamp's top-left when the gesture began, in cells. */
  from: Point
  /** Past [TAP_SLOP_PX] once — and a drag from then on. */
  dragging: boolean
}

export function clamp(board: Board, cell: Cell): Cell {
  return {
    x: Math.min(board.cols - board.size, Math.max(0, cell.x)),
    y: Math.min(board.rows - board.size, Math.max(0, cell.y)),
  }
}

/** Odd sizes centre on the cell under the point, even ones on the nearest crossing. */
export function centredAt(board: Board, point: Point): Cell {
  return clamp(board, {
    x: Math.floor(point.x / board.cellPx - (board.size - 1) / 2),
    y: Math.floor(point.y / board.cellPx - (board.size - 1) / 2),
  })
}

export function press(board: Board, stamp: Cell | null, point: Point): Gesture {
  return { start: point, from: stamp ?? centredAt(board, point), dragging: false }
}

/** The stamp while the pointer moves — `null` as long as this is still a tap. */
export function drag(
  board: Board,
  gesture: Gesture,
  point: Point,
): { gesture: Gesture; stamp: Cell | null } {
  const dx = point.x - gesture.start.x
  const dy = point.y - gesture.start.y
  if (!gesture.dragging && Math.hypot(dx, dy) < TAP_SLOP_PX) return { gesture, stamp: null }
  return {
    gesture: { ...gesture, dragging: true },
    stamp: clamp(board, {
      x: Math.round(gesture.from.x + dx / board.cellPx),
      y: Math.round(gesture.from.y + dy / board.cellPx),
    }),
  }
}

/** Where the stamp ends up: under the finger for a tap, where the drag left it otherwise. */
export function release(
  board: Board,
  gesture: Gesture,
  point: Point,
  current: Cell | null,
): Cell | null {
  return gesture.dragging ? current : centredAt(board, point)
}
```

- [ ] **Step 4: Die Tests laufen lassen**

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/types.spec.ts src/games/placepatch/__tests__/stamp.spec.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/placepatch
git commit -F - <<'EOF'
Narrow Platzierung's wire types and place its stamp

The payload, the scene, the solution and every stored guess arrive as
unknown; a cell is only taken where a whole patch fits on the board,
so a stale or junk guess cannot draw a box beside the picture.

The stamp logic is pure: a tap centres the stamp under the finger, a
drag moves it by the finger's travel so the finger can stay beside it.
Travel counts from where the drag began, so slow moves never stick.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Frontend — Dauer hochziehen, Rahmen stapeln, Rangliste

**Files:**
- Create: `webapp-vue/src/games/durations.ts`
- Create: `webapp-vue/src/games/__tests__/durations.spec.ts`
- Modify: `webapp-vue/src/games/findpattern/scoreboard.ts`
- Modify: `webapp-vue/src/games/findpattern/__tests__/scoreboard.spec.ts`
- Modify: `webapp-vue/src/games/spotobject/tips.ts`
- Create: `webapp-vue/src/games/placepatch/outlines.ts`
- Create: `webapp-vue/src/games/placepatch/scoreboard.ts`
- Test: `webapp-vue/src/games/placepatch/__tests__/outlines.spec.ts`
- Test: `webapp-vue/src/games/placepatch/__tests__/scoreboard.spec.ts`

**Interfaces:**
- Produces (`durations.ts`): `formatDuration(ms: number | null): string | null`, `durationOrder(a: number | null, b: number | null): number`.
- Produces (`outlines.ts`): `OUTLINE_STEP_PX = 2`; `interface OutlineSource { userId; cell: Cell; colorHex; delayMs }`, `interface Outline { userId; cell: Cell; colorHex; insetPx; delayMs }`, `stackedOutlines(sources, stepPx?): Outline[]`.
- Produces (`scoreboard.ts`): `interface ScoreRow extends ScoreboardRow { correct: boolean; gaveUp: boolean; durationLabel: string | null; cell: Cell | null }`; `scoreRows(input: { entries; solution: PlacePatchSolution; layout: PlacePatchPayload; awardRule; mineUserId }): ScoreRow[]`; `hasDurations(rows): boolean`.

- [ ] **Step 1: Die Dauer hochziehen — Test zuerst**

`webapp-vue/src/games/__tests__/durations.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { durationOrder, formatDuration } from '@/games/durations'

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

describe('durationOrder', () => {
  it('puts the faster first and a missing clock last', () => {
    expect(durationOrder(1_000, 2_000)).toBeLessThan(0)
    expect(durationOrder(null, 2_000)).toBeGreaterThan(0)
    expect(durationOrder(2_000, null)).toBeLessThan(0)
    expect(durationOrder(null, null)).toBe(0)
  })
})
```

In `findpattern/__tests__/scoreboard.spec.ts` den Block `describe('formatDuration', …)` (die zwei `it` mit `00:00`/`null`) **löschen** und den Import auf

```ts
import { hasDurations, scoreRows, toneChips } from '@/games/findpattern/scoreboard'
```

ändern.

Run: `cd webapp-vue && pnpm vitest run src/games/__tests__/durations.spec.ts`
Expected: FAIL — `@/games/durations` fehlt.

- [ ] **Step 2: `durations.ts` schreiben und beide Nutzer umstellen**

`webapp-vue/src/games/durations.ts`:

```ts
/** `mm:ss` with minutes running past 59 — the clock measures a round, not a wall clock. */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Faster first, by the millisecond the server measured — never by comparing the `mm:ss` label as
 * text, which inverts past two-digit minutes (`"100:00"` sorts before `"60:00"`). A row without a
 * clock sorts after one with it rather than winning by default.
 */
export function durationOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}
```

In `findpattern/scoreboard.ts`: die Funktionen `formatDuration` und `durationOrder` samt ihrer KDoc-Kommentare entfernen und `import { durationOrder, formatDuration } from '@/games/durations'` ergänzen. In `spotobject/tips.ts` dasselbe für die privaten Kopien `formatDuration` und `durationOrder`.

Run: `cd webapp-vue && pnpm vitest run src/games/__tests__/durations.spec.ts src/games/findpattern src/games/spotobject`
Expected: PASS.

- [ ] **Step 3: Die fallenden Tests für Rahmen und Rangliste schreiben**

`placepatch/__tests__/outlines.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { stackedOutlines } from '@/games/placepatch/outlines'

describe('stackedOutlines', () => {
  it('puts the first source outside and insets every collision on the same cell', () => {
    const outlines = stackedOutlines([
      { userId: 'mine', cell: { x: 7, y: 4 }, colorHex: '#7c3aed', delayMs: 0 },
      { userId: 'fry', cell: { x: 7, y: 4 }, colorHex: '#16a34a', delayMs: 500 },
      { userId: 'amy', cell: { x: 3, y: 4 }, colorHex: '#dc2626', delayMs: 600 },
    ])

    expect(outlines.map((o) => [o.userId, o.insetPx])).toEqual([
      ['mine', 0],
      ['fry', 2],
      ['amy', 0],
    ])
    expect(outlines[1]?.delayMs).toBe(500)
  })
})
```

`placepatch/__tests__/scoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { hasDurations, scoreRows } from '@/games/placepatch/scoreboard'

const LAYOUT = { cols: 40, rows: 30, size: 10 }
const SOLUTION = { x: 7, y: 4 }

function entry(over: Partial<GameEntry> & { userId: string }): GameEntry {
  return {
    username: over.userId,
    stage: 0,
    guess: null,
    outcome: null,
    points: 0,
    durationMs: null,
    avatar: { bgColorHex: '#7c3aed' },
    votes: [],
    struck: false,
    adminOverride: null,
    ...over,
  }
}

function rows(entries: GameEntry[], mineUserId: string | null = null) {
  return scoreRows({ entries, solution: SOLUTION, layout: LAYOUT, awardRule: 'CLOSEST_ONLY', mineUserId })
}

describe('placepatch scoreRows', () => {
  it('reads a hit off the cell, not off the outcome', () => {
    const [hit, miss] = rows([
      entry({ userId: 'a', guess: { x: 7, y: 4 }, points: 3 }),
      entry({ userId: 'b', guess: { x: 8, y: 4 }, points: 0 }),
    ])

    expect(hit).toMatchObject({ userId: 'a', correct: true, gaveUp: false, cell: { x: 7, y: 4 } })
    expect(miss).toMatchObject({ userId: 'b', correct: false, gaveUp: false })
  })

  it('treats a give-up and a guess off the board alike: no tip', () => {
    const result = rows([
      entry({ userId: 'gave-up', guess: null }),
      entry({ userId: 'junk', guess: { x: 99, y: 3 } }),
    ])

    expect(result.every((row) => row.gaveUp && row.cell === null && !row.correct)).toBe(true)
  })

  it('ranks by points, then hits, then the faster clock, then the user id', () => {
    const result = rows([
      entry({ userId: 'slow-hit', guess: { x: 7, y: 4 }, points: 0, durationMs: 50_000 }),
      entry({ userId: 'miss', guess: { x: 1, y: 1 }, points: 0, durationMs: 10_000 }),
      entry({ userId: 'winner', guess: { x: 7, y: 4 }, points: 3, durationMs: 20_000 }),
      entry({ userId: 'fast-hit', guess: { x: 7, y: 4 }, points: 0, durationMs: 30_000 }),
    ])

    expect(result.map((row) => row.userId)).toEqual(['winner', 'fast-hit', 'slow-hit', 'miss'])
    expect(result[0]?.durationLabel).toBe('00:20')
  })

  it('knows whether the round was timed', () => {
    expect(hasDurations(rows([entry({ userId: 'a', durationMs: 1_000 })]))).toBe(true)
    expect(hasDurations(rows([entry({ userId: 'a' })]))).toBe(false)
  })
})
```

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/outlines.spec.ts src/games/placepatch/__tests__/scoreboard.spec.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 4: `outlines.ts` und `scoreboard.ts` schreiben**

`placepatch/outlines.ts`:

```ts
/**
 * Every tip on the board as one box. A tip on the same cell as an earlier one moves
 * [OUTLINE_STEP_PX] inwards per collision, so both stay visible — Musterung's rule.
 *
 * The order of the sources decides who sits outside: the caller puts the viewer's own tip first, so
 * it keeps the box it had while they were playing.
 */
import type { Cell } from './types'

export interface OutlineSource {
  userId: string
  cell: Cell
  colorHex: string
  /** When this box fades in — from the shared reveal choreography, never invented here. */
  delayMs: number
}

export interface Outline extends OutlineSource {
  insetPx: number
}

export const OUTLINE_STEP_PX = 2

export function stackedOutlines(
  sources: readonly OutlineSource[],
  stepPx: number = OUTLINE_STEP_PX,
): Outline[] {
  const taken = new Map<string, number>()
  return sources.map((source) => {
    const key = `${source.cell.x},${source.cell.y}`
    const collisions = taken.get(key) ?? 0
    taken.set(key, collisions + 1)
    return { ...source, insetPx: collisions * stepPx }
  })
}
```

`placepatch/scoreboard.ts`:

```ts
/**
 * „Auswertung“: which rows exist, in which order, and what each cell says. Pure, like Musterung's
 * `scoreboard.ts` — this is the half a test can assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import { durationOrder, formatDuration } from '@/games/durations'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { cellOf } from './types'
import type { Cell, PlacePatchPayload, PlacePatchSolution } from './types'

export interface ScoreRow extends ScoreboardRow {
  correct: boolean
  /** No tip on the board: gave up, or a stored guess that does not fit it. */
  gaveUp: boolean
  /** `mm:ss`, or `null` for a round that did not score on time. */
  durationLabel: string | null
  /** Where their stamp lay, for the box on the reveal board. */
  cell: Cell | null
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  solution: PlacePatchSolution
  layout: PlacePatchPayload
  awardRule: AwardRule | null
  mineUserId: string | null
}): ScoreRow[] {
  const ranked = input.entries.map((entry) => {
    const cell = cellOf(entry.guess, input.layout)
    return {
      durationMs: entry.durationMs,
      row: {
        userId: entry.userId,
        name: entry.username,
        colorHex: entry.avatar.bgColorHex,
        ink: readableTextColor(entry.avatar.bgColorHex),
        // Read off the board rather than off `outcome`: the box sits on the picture, so „correct“
        // has to be the comparison the reader is making.
        correct: cell !== null && cell.x === input.solution.x && cell.y === input.solution.y,
        gaveUp: cell === null,
        durationLabel: formatDuration(entry.durationMs),
        points: entry.points,
        provisional: isProvisional(entry.points, input.awardRule),
        cell,
      },
    }
  })

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      Number(b.row.correct) - Number(a.row.correct) ||
      durationOrder(a.durationMs, b.durationMs) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  const myRank = ranked.findIndex((item) => item.row.userId === input.mineUserId)
  return ranked.map(({ row }, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

export function hasDurations(rows: readonly ScoreRow[]): boolean {
  return rows.some((row) => row.durationLabel !== null)
}
```

- [ ] **Step 5: Die Tests laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games
git commit -F - <<'EOF'
Rank Platzierung's tips and share the duration helpers

Musterung and Weltanschauung each carried their own mm:ss formatter
and duration order; Platzierung would have been the third copy. Both
move to games/durations.ts, and both games import them.

Platzierung's rows read a hit off the stamp's cell, not off the
outcome, and rank like Musterung's: points, hits, the faster clock,
the user id. Tips on the same cell inset 2 px per collision, the
viewer's own outermost.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Frontend — Regeln, Erklärung, Brett

**Files:**
- Create: `webapp-vue/src/games/placepatch/PlacePatchRules.vue`
- Create: `webapp-vue/src/games/placepatch/PlacePatchBriefing.vue`
- Create: `webapp-vue/src/games/placepatch/PlacePatchBoard.vue`
- Test: `webapp-vue/src/games/placepatch/__tests__/PlacePatchBoard.spec.ts`

**Interfaces:**
- Consumes: `stamp.ts`, `types.ts` (Task 7); `HoldButton` (`ready`, `disabled`, `label`, `color`, emit `confirm`); `RevealCover` (`state`, `busy`, emit `start`); `InfoBox`, `AwardBox`.
- Produces: `PlacePatchBoard` mit Props `{ payload: PlacePatchPayload | null; scene: PlacePatchScene | null; sealed: boolean; boardSrc: string | null; patchSrc: string | null; myColorHex: string; disabled: boolean; submitted: Cell | null; awardRule: AwardRule | null; awardPoints: number | null }`, Emits `guess: [Cell]`, `reveal: []`. `data-test`s: `place-patch-board`, `place-patch-field`, `place-patch-stamp`, `place-patch-patch`, `place-patch-image-error`.

- [ ] **Step 1: Den fallenden Test schreiben**

`__tests__/PlacePatchBoard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacePatchBoard from '@/games/placepatch/PlacePatchBoard.vue'
import RevealCover from '@/ui/RevealCover.vue'
import { DEFAULT_HOLD_MS } from '@/ui/useHoldProgress'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

function mountBoard(over: Record<string, unknown> = {}) {
  return mount(PlacePatchBoard, {
    props: {
      payload: PAYLOAD,
      scene: null,
      sealed: false,
      boardSrc: '/assets/0',
      patchSrc: '/assets/1',
      myColorHex: '#7c3aed',
      disabled: false,
      submitted: null,
      awardRule: null,
      awardPoints: null,
      ...over,
    },
  })
}

/** happy-dom lays nothing out: the field claims 400 × 300 px, so a cell is 10 px. */
function sized(wrapper: ReturnType<typeof mountBoard>) {
  const field = wrapper.get('[data-test="place-patch-field"]')
  vi.spyOn(field.element, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  return field
}

describe('PlacePatchBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    // Reduced motion, so the hold button skips its entrance — as in GuessHueBoard.spec.
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shows the grey board, the patch below it at board scale, and the rules', () => {
    const wrapper = mountBoard()

    expect(wrapper.findAll('img').map((img) => img.attributes('src'))).toEqual(['/assets/0', '/assets/1'])
    expect(wrapper.get('[data-test="place-patch-patch"]').attributes('style')).toContain('width: 25%')
    expect(wrapper.text()).toContain('Wo gehört dieser Ausschnitt hin?')
    expect(wrapper.find('[data-test="info-box"]').exists()).toBe(true)
  })

  it('puts the stamp under the finger on a tap and submits it on hold', async () => {
    const wrapper = mountBoard()
    const field = sized(wrapper)

    await field.trigger('pointerdown', { clientX: 123, clientY: 87, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 124, clientY: 87, pointerId: 1 })

    const stamp = wrapper.get('[data-test="place-patch-stamp"]').attributes('style')
    expect(stamp).toContain('left: 17.5%')
    expect(stamp).toContain('top: 13.3333')

    await wrapper.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
    vi.advanceTimersByTime(DEFAULT_HOLD_MS + 100)

    expect(wrapper.emitted('guess')).toEqual([[{ x: 7, y: 4 }]])
  })

  it('moves the stamp by the drag and keeps it where a cancelled gesture left it', async () => {
    const wrapper = mountBoard()
    const field = sized(wrapper)
    await field.trigger('pointerdown', { clientX: 123, clientY: 87, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 123, clientY: 87, pointerId: 1 })

    await field.trigger('pointerdown', { clientX: 300, clientY: 250, pointerId: 2 })
    await field.trigger('pointermove', { clientX: 334, clientY: 250, pointerId: 2 })
    await field.trigger('pointercancel', { pointerId: 2 })

    expect(wrapper.get('[data-test="place-patch-stamp"]').attributes('style')).toContain('left: 25%')
    expect(wrapper.emitted('guess')).toBeUndefined()
  })

  it('cannot submit without a stamp', () => {
    expect(mountBoard().get('[data-test="hold-button"]').attributes('disabled')).toBeDefined()
  })

  it('shows a submitted tip after a reload and does not move it', async () => {
    const wrapper = mountBoard({ submitted: { x: 3, y: 2 }, disabled: true })
    const field = sized(wrapper)

    await field.trigger('pointerdown', { clientX: 300, clientY: 250, pointerId: 1 })
    await field.trigger('pointerup', { clientX: 300, clientY: 250, pointerId: 1 })

    expect(wrapper.get('[data-test="place-patch-stamp"]').attributes('style')).toContain('left: 7.5%')
  })

  it('says so when a picture does not load', async () => {
    const wrapper = mountBoard()

    await wrapper.get('img').trigger('error')

    expect(wrapper.get('[data-test="place-patch-image-error"]').text()).toBe('Das Bild ließ sich nicht laden.')
  })

  it('requests no picture while sealed, and offers the cover instead of the button', () => {
    const wrapper = mountBoard({
      payload: null,
      scene: { cols: 40, rows: 30 },
      sealed: true,
      boardSrc: null,
      patchSrc: null,
    })

    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.findComponent(RevealCover).exists()).toBe(true)
    expect(wrapper.find('[data-test="hold-button"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Den Test laufen lassen und scheitern sehen**

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/PlacePatchBoard.spec.ts`
Expected: FAIL — die Komponente fehlt.

- [ ] **Step 3: Regeln, Erklärung, Brett schreiben**

`PlacePatchRules.vue`:

```vue
<script setup lang="ts">
/** How Platzierung is played. Text only — the folding lives in `ui/InfoBox`. */
</script>

<template>
  <ul class="ms-4 list-disc space-y-1">
    <li>Das Spielfeld zeigt ein Foto in Graustufen, der Ausschnitt darunter ein Stück davon in Farbe.</li>
    <li>
      Tippe ins Spielfeld, um den Rahmen dort abzulegen. Ziehst du, wandert er mit deiner Bewegung —
      dein Finger muss dafür nicht auf ihm liegen.
    </li>
    <li>Es zählt nur der exakte Treffer: Liegt der Rahmen auch nur ein Feld daneben, ist es keiner.</li>
    <li>Abgegeben wird, indem du den Knopf gedrückt hältst.</li>
  </ul>
</template>
```

`PlacePatchBriefing.vue`:

```vue
<script setup lang="ts">
/** What the player needs before the board appears: how it is played, and what the round pays. */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'
import PlacePatchRules from './PlacePatchRules.vue'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="place-patch">
      <template #abstract> Finde die Stelle, an die der Ausschnitt gehört — aufs Feld genau. </template>
      <PlacePatchRules />
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="place-patch"
    >
      <template #qualifies>Du musst den Ausschnitt aufs Feld genau platzieren.</template>
      <template #closest>
        Der exakte Treffer — und von allen, die ihn haben, die kürzeste Zeit.
      </template>
    </AwardBox>
  </div>
</template>
```

`PlacePatchBoard.vue`:

```vue
<script setup lang="ts">
/**
 * Playing: the grey board with the stamp on it, the patch below, the hold that submits.
 *
 * The answer is nowhere in here — the server sent pictures and three numbers. All this component
 * holds is where the player put the stamp.
 *
 * Capped at 22rem like Musterung's board: a desktop player's view must not be more informative
 * than a phone player's.
 */
import { computed, ref, useTemplateRef } from 'vue'
import type { AwardRule } from '@/api/types'
import HoldButton from '@/ui/HoldButton.vue'
import RevealCover from '@/ui/RevealCover.vue'
import PlacePatchBriefing from './PlacePatchBriefing.vue'
import { drag, press, release } from './stamp'
import type { Board, Gesture, Point } from './stamp'
import type { Cell, PlacePatchPayload, PlacePatchScene } from './types'

const props = withDefaults(
  defineProps<{
    payload: PlacePatchPayload | null
    /** The board's shape under the cover, while `payload` is still withheld. */
    scene?: PlacePatchScene | null
    sealed?: boolean
    /** `null` until the reveal: a sealed board must not ask for a picture it may not have. */
    boardSrc: string | null
    patchSrc: string | null
    /** The viewer's own avatar colour — the stamp is drawn in it, here and in the reveal. */
    myColorHex: string
    disabled: boolean
    /** A guess already submitted — what a reload shows, never something a tap moves. */
    submitted?: Cell | null
    awardRule: AwardRule | null
    awardPoints: number | null
  }>(),
  { scene: null, sealed: false, submitted: null },
)

const emit = defineEmits<{ guess: [value: Cell]; reveal: [] }>()

const layout = computed(() => props.payload ?? props.scene)
const field = useTemplateRef<HTMLDivElement>('field')

const stamp = ref<Cell | null>(null)
const shown = computed(() => props.submitted ?? stamp.value)
const imageFailed = ref(false)
let gesture: Gesture | null = null

const playable = computed(() => props.payload !== null && !props.disabled && !props.sealed && props.submitted === null)

function boardNow(): Board | null {
  const rect = field.value?.getBoundingClientRect()
  if (!props.payload || !rect || rect.width === 0) return null
  return { ...props.payload, cellPx: rect.width / props.payload.cols }
}

function pointOf(event: PointerEvent): Point {
  const rect = field.value!.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onDown(event: PointerEvent): void {
  const board = boardNow()
  if (!playable.value || board === null) return
  field.value?.setPointerCapture?.(event.pointerId)
  gesture = press(board, stamp.value, pointOf(event))
}

function onMove(event: PointerEvent): void {
  const board = boardNow()
  if (gesture === null || board === null) return
  const next = drag(board, gesture, pointOf(event))
  gesture = next.gesture
  if (next.stamp !== null) stamp.value = next.stamp
}

function onUp(event: PointerEvent): void {
  const board = boardNow()
  if (gesture === null || board === null) return
  stamp.value = release(board, gesture, pointOf(event), stamp.value)
  gesture = null
}

/** The browser took the gesture over — scrolling, say. The stamp stays where it was. */
function onCancel(): void {
  gesture = null
}

function submit(): void {
  if (stamp.value !== null) emit('guess', { ...stamp.value })
}

const stampStyle = computed(() => {
  const cell = shown.value
  const board = props.payload
  if (cell === null || board === null) return null
  return {
    left: `${(100 * cell.x) / board.cols}%`,
    top: `${(100 * cell.y) / board.rows}%`,
    width: `${(100 * board.size) / board.cols}%`,
    height: `${(100 * board.size) / board.rows}%`,
    boxShadow: `inset 0 0 0 3px ${props.myColorHex}`,
    backgroundColor: `${props.myColorHex}4d`,
  }
})

/** The patch as wide as it is on the board: size of cols, of the same column width. */
const patchWidth = computed(() =>
  props.payload ? `${(100 * props.payload.size) / props.payload.cols}%` : '0%',
)
</script>

<template>
  <div data-test="place-patch-board" class="flex flex-col gap-6">
    <!-- The outer box cancels RoundSurface's padding and pays it back, so the cover spans the card
         edge to edge, as in Musterung. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 p-4">
      <div
        class="mx-auto flex w-full max-w-[22rem] flex-col items-center gap-3"
        :inert="props.sealed || undefined"
      >
        <div
          ref="field"
          data-test="place-patch-field"
          class="relative w-full touch-none select-none overflow-hidden bg-neutral-200"
          :style="{ aspectRatio: `${layout.cols} / ${layout.rows}` }"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onCancel"
        >
          <img
            v-if="props.boardSrc"
            :src="props.boardSrc"
            alt="Das Spielfeld in Graustufen"
            class="absolute inset-0 size-full"
            draggable="false"
            @error="imageFailed = true"
          />
          <div
            v-if="stampStyle"
            data-test="place-patch-stamp"
            class="pointer-events-none absolute"
            :style="stampStyle"
          />
        </div>
        <p
          v-if="imageFailed"
          data-test="place-patch-image-error"
          class="text-center text-sm text-red-700"
        >Das Bild ließ sich nicht laden.</p>
        <p class="text-center text-lg">Wo gehört dieser Ausschnitt hin?</p>
        <img
          v-if="props.patchSrc"
          data-test="place-patch-patch"
          :src="props.patchSrc"
          alt="Der gesuchte Ausschnitt"
          :style="{ width: patchWidth }"
          draggable="false"
          @error="imageFailed = true"
        />
        <HoldButton
          v-if="!props.sealed"
          :ready="true"
          :disabled="!playable || stamp === null"
          :color="props.myColorHex"
          label="Tipp bestätigen — gedrückt halten"
          @confirm="submit"
        />
      </div>
      <RevealCover
        v-if="props.sealed"
        state="ready"
        :busy="props.disabled"
        @start="emit('reveal')"
      />
    </div>

    <PlacePatchBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
```

- [ ] **Step 4: Den Test laufen lassen**

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch && pnpm lint && pnpm typecheck`
Expected: PASS. Schlägt `left: 17.5%` an der Formatierung von happy-dom fehl (etwa `17.5%` vs. `17.500%`), die Assertion auf `toMatch(/left: 17\.5%/)` umstellen — der Wert bleibt derselbe.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/placepatch
git commit -F - <<'EOF'
Build Platzierung's board

The grey board with the stamp in the player's colour, the patch below
it at board scale - exactly as large as the stamp - and the hold that
submits. A tap centres the stamp, a drag moves it by the finger's
travel; a cancelled gesture leaves it where it was.

While sealed the board asks for no picture: the URLs reach it only
with the payload, after the reveal. A picture that fails to load says
so instead of leaving a grey field.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Frontend — Auflösung und Rangliste

**Files:**
- Create: `webapp-vue/src/games/placepatch/PlacePatchScoreboard.vue`
- Create: `webapp-vue/src/games/placepatch/PlacePatchReveal.vue`
- Test: `webapp-vue/src/games/placepatch/__tests__/PlacePatchScoreboard.spec.ts`
- Test: `webapp-vue/src/games/placepatch/__tests__/PlacePatchReveal.spec.ts`

**Interfaces:**
- Consumes: `scoreRows`/`ScoreRow`/`hasDurations` (Task 8), `stackedOutlines` (Task 8), `RevealScoreboard` (`rows`, `columns`, `caption`, `live`, `animate`; Slots `cell-<key>`), `revealChoreography` (`FADE_MS`, `SOLUTION_DELAY_MS`, `TIP_COLUMN`, `cellDelayMs`), `useRevealArming`.
- Produces: `PlacePatchReveal` mit Props `{ payload: PlacePatchPayload; solution: PlacePatchSolution; rows: ScoreRow[]; mineUserId: string | null; live: boolean; animate: boolean; boardSrc: string; patchSrc: string }`. `data-test`s: `place-patch-reveal`, `place-patch-solution`, `place-patch-outline-<userId>`, `hit-<userId>`.

- [ ] **Step 1: Die fallenden Tests schreiben**

`__tests__/PlacePatchScoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacePatchScoreboard from '@/games/placepatch/PlacePatchScoreboard.vue'
import type { ScoreRow } from '@/games/placepatch/scoreboard'

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    gaveUp: false,
    durationLabel: null,
    cell: { x: 1, y: 1 },
    ...over,
  }
}

describe('PlacePatchScoreboard', () => {
  it('says hit, miss or gave up per row', () => {
    const wrapper = mount(PlacePatchScoreboard, {
      props: {
        rows: [row({ userId: 'a', correct: true }), row({ userId: 'b' }), row({ userId: 'c', gaveUp: true, cell: null })],
        live: false,
        animate: false,
      },
    })

    expect(wrapper.get('[data-test="hit-a"]').text()).toBe('Treffer')
    expect(wrapper.get('[data-test="hit-b"]').text()).toBe('daneben')
    expect(wrapper.get('[data-test="hit-c"]').text()).toBe('aufgegeben')
  })

  it('shows the clock only for a timed round', () => {
    const timed = mount(PlacePatchScoreboard, {
      props: { rows: [row({ userId: 'a', durationLabel: '00:42' })], live: true, animate: false },
    })
    const untimed = mount(PlacePatchScoreboard, {
      props: { rows: [row({ userId: 'a' })], live: false, animate: false },
    })

    expect(timed.text()).toContain('[mm:ss]')
    expect(timed.text()).toContain('00:42')
    expect(untimed.text()).not.toContain('[mm:ss]')
  })
})
```

`__tests__/PlacePatchReveal.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import type { ScoreRow } from '@/games/placepatch/scoreboard'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

function row(over: Partial<ScoreRow> & { userId: string }): ScoreRow {
  return {
    name: over.userId,
    colorHex: '#7c3aed',
    ink: '#ffffff',
    points: 0,
    provisional: false,
    tick: 0,
    correct: false,
    gaveUp: false,
    durationLabel: null,
    cell: null,
    ...over,
  }
}

function mountReveal(rows: ScoreRow[]) {
  return mount(PlacePatchReveal, {
    props: {
      payload: PAYLOAD,
      solution: { x: 7, y: 4 },
      rows,
      mineUserId: 'mine',
      live: false,
      animate: false,
      boardSrc: '/assets/0',
      patchSrc: '/assets/1',
    },
  })
}

describe('PlacePatchReveal', () => {
  it('sets the coloured patch into its place on the grey board', () => {
    const wrapper = mountReveal([])

    const solution = wrapper.get('[data-test="place-patch-solution"]')
    expect(solution.attributes('style')).toMatch(/left: 17\.5%/)
    expect(solution.get('img').attributes('src')).toBe('/assets/1')
  })

  it('stacks the tips, mine outermost', () => {
    const wrapper = mountReveal([
      row({ userId: 'fry', cell: { x: 7, y: 4 }, colorHex: '#16a34a' }),
      row({ userId: 'mine', cell: { x: 7, y: 4 } }),
      row({ userId: 'gave-up', gaveUp: true }),
    ])

    expect(wrapper.get('[data-test="place-patch-outline-mine"]').attributes('data-inset')).toBe('0')
    expect(wrapper.get('[data-test="place-patch-outline-fry"]').attributes('data-inset')).toBe('2')
    expect(wrapper.find('[data-test="place-patch-outline-gave-up"]').exists()).toBe(false)
  })
})
```

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/PlacePatchScoreboard.spec.ts src/games/placepatch/__tests__/PlacePatchReveal.spec.ts`
Expected: FAIL — die Komponenten fehlen.

- [ ] **Step 2: `PlacePatchScoreboard.vue` schreiben**

```vue
<script setup lang="ts">
/** „Auswertung“ for Platzierung: the shared table, with a hit column and — when timed — the clock. */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import { hasDurations } from './scoreboard'
import type { ScoreRow } from './scoreboard'

const props = defineProps<{
  rows: ScoreRow[]
  /** True while the round's rule is `CLOSEST_ONLY` — then a score can still be overtaken. */
  live: boolean
  /** False when this card was already the reveal on arrival: a reload shows the finished table. */
  animate: boolean
}>()

const columns = computed<ScoreboardColumn<ScoreRow>[]>(() => [
  { key: 'hit', label: 'Treffer', width: '6rem' },
  ...(hasDurations(props.rows)
    ? [{ key: 'clock', label: '[mm:ss]', width: '3.5rem', align: 'end' as const }]
    : []),
])
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Tipps der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #cell-hit="{ row }">
      <span :data-test="`hit-${row.userId}`" class="text-xs">{{
        row.gaveUp ? 'aufgegeben' : row.correct ? 'Treffer' : 'daneben'
      }}</span>
    </template>

    <template #cell-clock="{ row }">
      <span class="font-mono text-xs">{{ row.durationLabel ?? '—' }}</span>
    </template>
  </RevealScoreboard>
</template>
```

- [ ] **Step 3: `PlacePatchReveal.vue` schreiben**

```vue
<script setup lang="ts">
/**
 * The card after the round: the same board, the coloured patch sewn back into its place, every tip
 * on top and the scoreboard below — Musterung's beats from `revealChoreography`.
 *
 * My own box sits outermost and has no fade: it is the stamp from playing, on a board that has not
 * moved, so the switch to the reveal leaves it exactly where it was.
 */
import { computed } from 'vue'
import { FADE_MS, SOLUTION_DELAY_MS, TIP_COLUMN, cellDelayMs } from '@/games/revealChoreography'
import { inBackground, prefersReducedMotion } from '@/ui/motion'
import { useRevealArming } from '@/ui/useRevealArming'
import PlacePatchScoreboard from './PlacePatchScoreboard.vue'
import { stackedOutlines } from './outlines'
import type { Outline } from './outlines'
import type { ScoreRow } from './scoreboard'
import type { Cell, PlacePatchPayload, PlacePatchSolution } from './types'

const props = defineProps<{
  payload: PlacePatchPayload
  solution: PlacePatchSolution
  rows: ScoreRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
  boardSrc: string
  patchSrc: string
}>()

/** A reload, reduced motion, a background tab: just be there. */
const still =
  !props.animate ||
  prefersReducedMotion() ||
  inBackground() ||
  typeof requestAnimationFrame !== 'function'

const { shown } = useRevealArming(still)

function hasCell(row: ScoreRow): row is ScoreRow & { cell: Cell } {
  return row.cell !== null
}

const outlines = computed(() => {
  const withTip = props.rows.filter(hasCell)
  const mine = withTip.filter((row) => row.userId === props.mineUserId)
  const others = withTip.filter((row) => row.userId !== props.mineUserId)
  return stackedOutlines(
    [...mine, ...others].map((row) => ({
      userId: row.userId,
      cell: row.cell,
      colorHex: row.colorHex,
      delayMs:
        still || row.userId === props.mineUserId
          ? 0
          : cellDelayMs(row.tick, TIP_COLUMN, props.rows.length),
    })),
  )
})

/** In percent of the board, so box and picture scale as one; [insetPx] moves the box inwards. */
function box(cell: Cell, insetPx = 0) {
  const offset = (percent: number) =>
    insetPx === 0 ? `${percent}%` : `calc(${percent}% + ${insetPx}px)`
  const extent = (percent: number) =>
    insetPx === 0 ? `${percent}%` : `calc(${percent}% - ${2 * insetPx}px)`
  return {
    left: offset((100 * cell.x) / props.payload.cols),
    top: offset((100 * cell.y) / props.payload.rows),
    width: extent((100 * props.payload.size) / props.payload.cols),
    height: extent((100 * props.payload.size) / props.payload.rows),
  }
}

const solutionStyle = computed(() => ({
  ...box(props.solution),
  transitionDuration: `${FADE_MS}ms`,
  transitionDelay: `${SOLUTION_DELAY_MS}ms`,
}))

function outlineStyle(outline: Outline) {
  return {
    ...box(outline.cell, outline.insetPx),
    boxShadow: `inset 0 0 0 3px ${outline.colorHex}`,
    opacity: still || outline.delayMs === 0 || shown.value ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease-out ${outline.delayMs}ms`,
  }
}
</script>

<template>
  <div data-test="place-patch-reveal" class="flex flex-col gap-6">
    <!-- Capped like the board, so the picture does not jump when the view switches. -->
    <div class="mx-auto w-full max-w-[22rem]">
      <div
        class="relative w-full overflow-hidden"
        :style="{ aspectRatio: `${props.payload.cols} / ${props.payload.rows}` }"
      >
        <img
          :src="props.boardSrc"
          alt="Das Spielfeld in Graustufen"
          class="absolute inset-0 size-full"
          draggable="false"
        />
        <div
          data-test="place-patch-solution"
          class="pointer-events-none absolute transition-opacity"
          :class="shown ? 'opacity-100' : 'opacity-0'"
          :style="solutionStyle"
        >
          <img :src="props.patchSrc" alt="Der Ausschnitt an seinem Platz" class="size-full" draggable="false" />
          <div class="absolute inset-0 shadow-[inset_0_0_0_2px_white]" />
        </div>
        <div
          v-for="outline in outlines"
          :key="outline.userId"
          :data-test="`place-patch-outline-${outline.userId}`"
          :data-inset="outline.insetPx"
          class="pointer-events-none absolute"
          :style="outlineStyle(outline)"
        />
      </div>
    </div>

    <PlacePatchScoreboard :rows="props.rows" :live="props.live" :animate="props.animate" />
  </div>
</template>
```

- [ ] **Step 4: Die Tests laufen lassen**

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/placepatch
git commit -F - <<'EOF'
Reveal Platzierung by sewing the patch back in

At the solution beat the coloured patch fades into its place on the
grey board, framed white - the solution belongs to nobody. The other
players' boxes follow with their table rows on the shared cascade; my
own box stays outermost and does not fade, it is the stamp from
playing.

The table says hit, miss or gave up per row, with the clock column
only in a timed round.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Frontend — Spiel, Registrierung, Labor

**Files:**
- Create: `webapp-vue/src/games/placepatch/PlacePatchGame.vue`
- Test: `webapp-vue/src/games/placepatch/__tests__/PlacePatchGame.spec.ts`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`

**Interfaces:**
- Consumes: `PlacePatchBoard` (Task 9), `PlacePatchReveal` (Task 10), `scoreRows` (Task 8), `types.ts` (Task 7).
- Produces: `PlacePatchGame` mit dem Komponenten-Vertrag aller Spiele (`payload`, `outcome`, `myGuess`, `solution`, `entries`, `mineUserId`, `awardRule`, `awardPoints`, `disabled`, `stage?`, `assetUrl?`, `closed?`, `sealed?`, `scene?`; Emits `guess`, `skip`, `giveUp`, `reveal`); Registry-Eintrag `'place-patch'`; Labor-Eintrag `{ id: 'place-patch', title: 'Platzierung' }`.

- [ ] **Step 1: Den fallenden Test schreiben**

`__tests__/PlacePatchGame.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GameEntry } from '@/games/GameEntry'
import PlacePatchBoard from '@/games/placepatch/PlacePatchBoard.vue'
import PlacePatchGame from '@/games/placepatch/PlacePatchGame.vue'
import PlacePatchReveal from '@/games/placepatch/PlacePatchReveal.vue'
import { gameComponents } from '@/games/registry'
import { labGameList } from '@/gamelab/games'

const PAYLOAD = { cols: 40, rows: 30, size: 10 }

const MINE: GameEntry = {
  userId: 'mine',
  username: 'Leela',
  stage: 0,
  guess: { x: 7, y: 4 },
  outcome: { correct: true },
  points: 1,
  durationMs: null,
  avatar: { bgColorHex: '#7c3aed' },
  votes: [],
  struck: false,
  adminOverride: null,
}

function mountGame(over: Record<string, unknown> = {}) {
  return mount(PlacePatchGame, {
    props: {
      payload: PAYLOAD,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: 'mine',
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      assetUrl: (key: number) => `/assets/${key}`,
      ...over,
    },
  })
}

describe('PlacePatchGame', () => {
  it('plays on the board with both pictures once the payload is there', () => {
    const board = mountGame().getComponent(PlacePatchBoard)

    expect(board.props('boardSrc')).toBe('/assets/0')
    expect(board.props('patchSrc')).toBe('/assets/1')
  })

  it('hands the sealed board no picture at all', () => {
    const board = mountGame({ payload: null, sealed: true, scene: { cols: 40, rows: 30 } }).getComponent(PlacePatchBoard)

    expect(board.props('boardSrc')).toBeNull()
    expect(board.props('patchSrc')).toBeNull()
  })

  it('shows the submitted tip after a reload', () => {
    const board = mountGame({ myGuess: { x: 7, y: 4 }, disabled: true }).getComponent(PlacePatchBoard)

    expect(board.props('submitted')).toEqual({ x: 7, y: 4 })
  })

  it('turns into the reveal once the solution is there', () => {
    const wrapper = mountGame({ solution: { x: 7, y: 4 }, entries: [MINE], myGuess: { x: 7, y: 4 } })

    expect(wrapper.findComponent(PlacePatchReveal).exists()).toBe(true)
  })

  it('says it cannot render a round without asset URLs', () => {
    expect(mountGame({ assetUrl: undefined }).text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
  })

  it('is in the registry and in the lab', () => {
    expect(gameComponents['place-patch']).toBe(PlacePatchGame)
    expect(labGameList).toContainEqual({ id: 'place-patch', title: 'Platzierung' })
  })
})
```

Run: `cd webapp-vue && pnpm vitest run src/games/placepatch/__tests__/PlacePatchGame.spec.ts`
Expected: FAIL — die Komponente fehlt.

- [ ] **Step 2: `PlacePatchGame.vue` schreiben**

```vue
<script setup lang="ts">
/**
 * Platzierung: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are the
 * framework's. Declaring them keeps the contract the same shape for every game.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import PlacePatchBoard from './PlacePatchBoard.vue'
import PlacePatchReveal from './PlacePatchReveal.vue'
import { scoreRows } from './scoreboard'
import {
  BOARD_ASSET_KEY,
  PATCH_ASSET_KEY,
  asPlacePatchPayload,
  asPlacePatchScene,
  asPlacePatchSolution,
  cellOf,
} from './types'

const props = defineProps<{
  payload: unknown
  outcome: unknown
  myGuess: unknown
  solution: unknown
  entries: GameEntry[]
  mineUserId: string | null
  awardRule: AwardRule | null
  awardPoints: number | null
  disabled: boolean
  stage?: number
  assetUrl?: (key: number) => string
  closed?: boolean
  /** Sealed: mounted under the cover before the reveal, `payload` still `null`. */
  sealed?: boolean
  /** The board's shape while sealed. */
  scene?: unknown
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }>()

const payload = computed(() => asPlacePatchPayload(props.payload))
const scene = computed(() => (props.sealed ? asPlacePatchScene(props.scene) : null))
const solution = computed(() => asPlacePatchSolution(props.solution, payload.value))

/** Only with the payload: a sealed round's pictures are forbidden, and asking would 403. */
const boardSrc = computed(() => (payload.value ? (props.assetUrl?.(BOARD_ASSET_KEY) ?? null) : null))
const patchSrc = computed(() => (payload.value ? (props.assetUrl?.(PATCH_ASSET_KEY) ?? null) : null))

/** Grey, so a player whose row has not arrived yet still sees their own stamp. */
const myColorHex = computed(
  () =>
    props.entries.find((entry) => entry.userId === props.mineUserId)?.avatar.bgColorHex ??
    '#525252',
)

const rows = computed(() =>
  solution.value === null || payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        solution: solution.value,
        layout: payload.value,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** A reload must not replay the choreography — Musterung's flag, for the same reason. */
const hasRevealedLive = ref(false)
watch(solution, (now, before) => {
  if (before === null && now !== null) hasRevealedLive.value = true
})
</script>

<template>
  <p
    v-if="props.assetUrl === undefined || (payload === null && scene === null)"
    class="text-sm text-neutral-600"
  >
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <div v-else class="grid">
    <Transition
      enter-active-class="transition-opacity duration-500 delay-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300 motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <PlacePatchReveal
        v-if="solution && payload && boardSrc && patchSrc"
        class="[grid-area:1/1]"
        :payload="payload"
        :solution="solution"
        :rows="rows"
        :mine-user-id="props.mineUserId"
        :live="live"
        :animate="hasRevealedLive"
        :board-src="boardSrc"
        :patch-src="patchSrc"
      />
      <PlacePatchBoard
        v-else
        class="[grid-area:1/1]"
        :payload="payload"
        :scene="scene"
        :sealed="props.sealed === true"
        :board-src="boardSrc"
        :patch-src="patchSrc"
        :my-color-hex="myColorHex"
        :disabled="props.disabled"
        :submitted="cellOf(props.myGuess, payload)"
        :award-rule="props.awardRule"
        :award-points="props.awardPoints"
        @guess="(value) => emit('guess', value)"
        @reveal="emit('reveal')"
      />
    </Transition>
  </div>
</template>
```

- [ ] **Step 3: Registrieren**

`games/registry.ts`: Import `import PlacePatchGame from './placepatch/PlacePatchGame.vue'` ergänzen und in `gameComponents` nach `deduster: DedusterGame,`:

```ts
  'place-patch': PlacePatchGame,
```

`gamelab/games.ts`, in `labGameList` nach dem Entstauber-Eintrag:

```ts
  { id: 'place-patch', title: 'Platzierung' },
```

- [ ] **Step 4: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Im Labor ansehen**

Backend und Frontend über `.claude/launch.json` starten (`preview_start` mit `backend`, dann `frontend`; vorher prüfen, aus welchem Checkout sie laufen). Als Test-User mit Bild-Pool anmelden und `/c/<slug>/lab/place-patch?seed=1&phase=1` öffnen:
- Brett und Ausschnitt erscheinen, der Ausschnitt ist so breit wie der Rahmen.
- Tippen setzt den Rahmen, Abgabe per Halten ergibt Treffer/kein Treffer.
- Phase 2: Hülle, Aufdecken, danach erst die Bilder (Netzwerk-Log: keine Anfrage auf `/assets/0` oder `/assets/1` vor dem Aufdecken).

Choreographie und Halten sind dort nicht prüfbar (der Pane meldet sich versteckt); das bleibt der Handprobe vorbehalten.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/placepatch webapp-vue/src/games/registry.ts webapp-vue/src/gamelab/games.ts
git commit -F - <<'EOF'
Render Platzierung in rounds and in the lab

The game component narrows what arrives as unknown and switches
between board and reveal like Musterung's. The picture URLs reach the
board only with the payload, so a sealed round never asks for an
asset it may not have yet.

Registered for real rounds and listed in the lab, where dragging and
the reveal beats get their tuning on a phone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Doku nachziehen und Gesamtlauf

**Files:**
- Modify: `.claude/guidelines/game-rounds.md` (Abschnitt „Assets before the reveal“)
- Modify: `docs/superpowers/specs/2026-09-14-entstauber-design.md:125-127`
- Modify: `docs/superpowers/specs/2026-09-07-community-image-pool-design.md:43-44`

- [ ] **Step 1: `game-rounds.md`**

Im Abschnitt `## Assets before the reveal` nach dem bestehenden Absatz anfügen:

```markdown
Which stage releases any other key is `GameType.assetStage(params, key)` — the key itself by
default, Anspielung's ladder. A single-stage game with several pictures behind one reveal maps
them all to 0 (Platzierung: board and patch); both gates, `PlayService.asset` and the lab's, ask
the same question. A stopgap until the asset model is cleaned up as a whole
(unividuell/countdown#101) — do not grow it into a second visibility concept meanwhile.
```

- [ ] **Step 2: Entstauber-Spec**

Den Absatz

```markdown
Die **Vorrangregel lebt im Spiel, nicht im Pool**: `candidateIds(community) ifEmpty
{ candidateIds(null) }`. Der Pool lernt kein Spielwissen; das hat er sich in seiner eigenen Spec
verbeten.
```

ersetzen durch

```markdown
Die Vorrangregel — `candidateIds(community) ifEmpty { candidateIds(null) }` — lag hier zuerst im
Spiel. Mit dem zweiten Bildspiel ist sie als `ImagePoolQuery.playableIds` nach `imagepool` gezogen,
zusammen mit den Seitenverhältnis-Klassen und dem Zuschnitt: so werden Bilder ausgewählt, für jedes
Spiel — siehe [Platzierung](2026-10-15-platzierung-design.md).
```

- [ ] **Step 3: Bild-Pool-Spec**

Den Satz

```markdown
weiß, was es braucht. Die erste exportierte Schnittstelle ist `ImagePoolQuery` mit `candidateIds`,
`displaySize`, `displayed`.
```

ersetzen durch

```markdown
weiß, was es braucht. Die erste exportierte Schnittstelle ist `ImagePoolQuery` mit `candidateIds`,
`displaySize`, `displayed`; mit dem zweiten Bildspiel kamen `playableIds`, `AspectRatio` und
`ImageFit` dazu ([Platzierung](2026-10-15-platzierung-design.md)).
```

- [ ] **Step 4: Gesamtlauf**

```bash
cd core && ./mvnw clean test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

Expected: alles PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/guidelines/game-rounds.md docs/superpowers/specs/2026-09-14-entstauber-design.md docs/superpowers/specs/2026-09-07-community-image-pool-design.md
git commit -F - <<'EOF'
Record assetStage and the shared pool helpers

game-rounds.md says how an asset other than scene and solution is
released now, and that assetStage is a stopgap until #101.

The Entstauber and image pool specs still placed the pool precedence
in the game and listed three exported methods; both now point at the
helpers Platzierung moved into imagepool.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
