# Entstauber — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Reaktionsspiel „Entstauber“ aus `huettehuette` als fünftes Rundenspiel: ein Foto aus dem Bild-Pool unter Staub, Kachel für Kachel im Takt der Runde freigelegt und bestätigt, gewertet nach ⌀-Reaktionszeit.

**Architecture:** Zuerst vier kleine Erweiterungen am gemeinsamen Vertrag (dritter Strom `GameRandom.scene`, `RoundContext.communityId` + `isAvailable`, `scoresOnDuration`, `SCENE_ASSET_KEY`), dann die erste exportierte API von `imagepool`, ein neues Modulith-Modul `deduster` (Raster, Takt, Bildzuschnitt, Tabelle `deduster.round_images`) und der Adapter `DedusterGameType` in `game.internal`. Im Frontend ein neues Spielverzeichnis `games/deduster/`: der Lauf als reine Logik (`useDedusterRun`), das Brett unter der eigenen Hülle, die Auswertung mit Tabelle und inline-SVG-Kurve.

**Tech Stack:** Kotlin 2.4 / Spring Boot 4.1 / Spring Modulith 2.1 · JUnit 5 + kotest-Matcher + mockk + Testcontainers · Java2D/ImageIO · Vue 3 + TypeScript strict + Vitest + @vue/test-utils (happy-dom) · Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-09-14-entstauber-design.md`](../specs/2026-09-14-entstauber-design.md) — vor jedem Task lesen; der Plan argumentiert aus ihr.

**Eine Abweichung von der Spec, bewusst:** `ImagePoolQuery.original(id): PoolImageBytes?` wird zu `ImagePoolQuery.displayed(id, minEdge): BufferedImage?`. Die EXIF-Drehung lebt in `imagepool.internal.ImageIntake`, und Modulith verbietet `deduster` den Zugriff dorthin; die Alternative wäre eine zweite Kopie der acht Orientierungsfälle in `deduster`. `displayed` dekodiert unterabgetastet und gedreht, `deduster` schneidet nur noch zu und skaliert. Task 15 zieht die Spec nach.

## Global Constraints

- **Sprache:** Quellcode, Kommentare, Commit-Messages **englisch**. User-facing Text **deutsch**, deutsche Anführungszeichen `„…“`, nie `"`. Spec und Plan bleiben deutsch.
- **Commit-Messages** nach den 7 Regeln aus `CLAUDE.md`: Betreff imperativ, groß, ohne Punkt, ≤ 50 Zeichen; Leerzeile; Body umbrochen bei 72, erklärt *was* und *warum*. **Kein** `feat:`-Präfix. Letzte Zeile genau: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — wörtlich, nicht der eigene Modellname.
- **Niemals `git commit --amend`**, immer ein neuer Commit.
- **Kotlin:** named arguments ab zwei Argumenten an jedem Aufrufpunkt (Ausnahmen: ein Argument, varargs, Java-deklarierte Funktionen, trailing lambdas, infix) — `.claude/guidelines/kotlin.md`.
- **Testing-Stack:** kotest-Matcher (`shouldBe`, `shouldBeNull`, …), mockk, Spring-Kontext-Tests mit `@Import(TestcontainersConfiguration::class)`. Frontend: Vitest + `vi`, nie mockk.
- **TDD:** erst der fallende Test, dann die minimale Implementierung.
- **Keine redundanten Inline-Kommentare.** Kein Grabstein-Kommentar für Entferntes. Neue Kommentare nur, wo sie beim Lesen *dieser* Zeile einen Fehler verhindern — dann kurz, *was* und *warum*.
- **Logging:** kotlin-logging, `private val logger = KotlinLogging.logger {}` **in** der Klasse, immer Lambda-Nachrichten.
- **Namen:** Spiel-Id `deduster`, Anzeigename `Entstauber`, Modul/Schema `deduster`. Die Bühne heißt im Code `scene`, **nie** `stage`.
- **Ströme:** Bild und Takt aus `random.scene`, Kachelreihenfolge aus `random.presentation`, `random.solution` bleibt unberührt. Ziehungsreihenfolge: Bild, Takt, Reihenfolge.
- **Feste Zahlen (aus der Spec, wörtlich):**
  - Raster: Verhältnis ≥ `1.1547` → 8 × 6; ≤ `0.8660` → 6 × 8; dazwischen 7 × 7.
  - Takt-Gewichte: `900:1 1000:4 1100:4 1200:8 1300:9 1400:3 1500:1 1800:2 1900:1 2000:1`.
  - `MIN_HUMAN_MS = 120`.
  - `deduster.play-image-edge = 1600`, `deduster.play-image-quality = 0.82`.
  - `SCENE_ASSET_KEY = 98`.
- **Wörtliche Texte:**
  - Warnsatz, nicht gezeitet: `Der Lauf startet mit dem Aufdecken — und du hast nur <strong>einen</strong> Versuch.`
  - Hinweis nach dem Neuladen: `Neu geladen — dein Lauf wird markiert.`
  - Briefing-Zusatz: `Beim Halten wird im Takt des Spiels eingezählt.`
  - „raus“-Werte: `mit Applaus` / `zu spät` / `verklickt`.
- **Die Reihenfolge erreicht das DOM nie** — kein `data-`Attribut, keine Klasse, kein Text auf einer *kommenden* Kachel.
- **Kein Übergang** beim Freilegen einer Kachel, keine Fremdpakete (`echarts`, `seedrandom`, `vue-touch-ripple`).
- Backend-Befehle aus `core/`, Frontend-Befehle aus `webapp-vue/`.
- **Nicht im Browser-Pane prüfbar:** Halten, Takt und Ripple laufen über `requestAnimationFrame`/Timer, und der Pane meldet sich immer als versteckt. Kein Implementer versucht, den Lauf dort nachzuweisen; die Handprobe gehört aufs Handy.

## File Structure

**Backend, neu:**

| Datei | Aufgabe |
|---|---|
| `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolQuery.kt` | die exportierte Schnittstelle + `ImageSize` |
| `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImagePoolQueryService.kt` | ihre Implementierung |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterGrid.kt` | Orientierung → Spalten, Zeilen, Zielverhältnis |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterTicks.kt` | die Taktverteilung |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterPool.kt` | Vorrang Gemeinschaft vor global, Raster eines Bildes |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterImages.kt` | `@Component`: mittiger Zuschnitt, Skalierung, JPEG — liest die Properties selbst |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/RoundImageStore.kt` | Lesen/Schreiben der Rundenbilder |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/internal/RoundImage.kt` | Entität |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/internal/RoundImageRepository.kt` | Repository |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/internal/DedusterProperties.kt` | `@ConfigurationProperties("deduster")` |
| `core/src/main/kotlin/org/unividuell/countdown/core/deduster/internal/DedusterConfiguration.kt` | aktiviert die Properties |
| `core/src/main/resources/db/migration/deduster/V1__create_round_images.sql` | Schema + Tabelle |
| `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/DedusterGameType.kt` | der Adapter |

**Backend, geändert:** `game/GameRandom.kt`, `game/GameType.kt`, `game/GameCatalog.kt`, `game/internal/{AnnouncementService, PlayService, RoundResponses, RoundDtos, FindPatternGameType, GuessHueGameType, SongSnippetGameType, SpotObjectGameType}.kt`, `gamelab/internal/{LabService, LabDtos}.kt`, `imagepool/internal/ImageIntake.kt`, `application.yaml`; Testdateien, die `GameRandom(…)`, `RoundContext(…)` oder einen eigenen `GameType` bauen.

**Frontend, neu (`webapp-vue/src/games/deduster/`):** `types.ts`, `useDedusterRun.ts`, `DedusterBriefing.vue`, `DedusterBoard.vue`, `scoreboard.ts`, `DedusterScoreboard.vue`, `chart.ts`, `DedusterChart.vue`, `DedusterReveal.vue`, `DedusterGame.vue`, je mit Test unter `__tests__/`.

**Frontend, geändert:** `ui/HoldButton.vue`, `ui/RevealCover.vue`, `games/RevealScoreboard.vue` (ein Slot `name`), `games/registry.ts`, `gamelab/games.ts`, `gamelab/types.ts`, `api/types.ts`, `rounds/RoundCard.vue`, `pages/c/[slug]/lab/[game]/index.vue`.

**Doku:** `.claude/guidelines/{game-rounds, game-integrity, modules-and-migrations}.md`, Bild-Pool-Spec, Entstauber-Spec.

Reihenfolge: Vertrag (1–4) → Pool-API (5) → Modul `deduster` (6) → Adapter (7) → Wertung und Gesamtfluss (8) → Knopf und Hülle (9) → Lauf (10) → Brett (11) → Tabelle (12) → Kurve (13) → Auswertung + Registrierung (14) → Doku (15). Nach jedem Task sind **alle** Tests grün, Lint und Typecheck sauber. Bis Task 14 ist Entstauber nirgends auswählbar, weil `isAvailable` ohne Bilder `false` sagt und das Frontend es erst in Task 14 registriert.

Prüfbefehle, die jeder Task am Ende braucht:

```bash
cd core && ./mvnw test
cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck
```

---
### Task 1: Ein dritter Strom — `GameRandom.scene`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameRandom.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt` (KDoc von `draw` und `scene`)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameRandomTest.kt`
- Modify (Aufrufer): jede Testdatei mit `GameRandom(` — heute `SpotObjectGameTypeTest`, `GuessHueGameTypeTest`, `GameCatalogTest` (2×), `SongSnippetGameTypeTest` (2×), `FindPatternGameTypeTest`. Finden mit `grep -rn "GameRandom(" core/src/test`.

**Interfaces:**
- Produces: `class GameRandom(val solution: SeededRandom, val presentation: SeededRandom, val scene: SeededRandom)`; `GameRandom.independent(source)` und `GameRandom.fromSeed(seed)` füllen alle drei.

Warum: Entstaubers Bühne (Bild, Takt) liegt vor dem Aufdecken beim Client. Aus `presentation` gezogen, ließe sich daraus die noch versiegelte Kachelreihenfolge zurückrechnen (`SeededRandom` ist umkehrbar). `game-rounds.md` nennt den Ausweg selbst: einen dritten, unabhängig geseedeten Strom.

- [ ] **Step 1: Failing test schreiben**

`GameRandomTest.kt` ganz ersetzen:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.collections.shouldHaveSize
import org.junit.jupiter.api.Test
import java.security.SecureRandom

class GameRandomTest {

    @Test
    fun `fromSeed's three streams draw three different first values`() {
        // The salts are the only thing keeping the lab's derived streams apart. Were one 0, or the
        // derivation "simplified" back to one seed, two streams would draw the same first double —
        // the failure a field-set test cannot see, because it narrows a value rather than adding one.
        val random = GameRandom.fromSeed(4711)

        setOf(
            random.solution.nextDouble(),
            random.presentation.nextDouble(),
            random.scene.nextDouble(),
        ) shouldHaveSize 3
    }

    @Test
    fun `independent seeds all three streams`() {
        val random = GameRandom.independent(SecureRandom())

        setOf(
            random.solution.nextDouble(),
            random.presentation.nextDouble(),
            random.scene.nextDouble(),
        ) shouldHaveSize 3
    }
}
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd core && ./mvnw test -Dtest=GameRandomTest`
Expected: Kompilierfehler `Unresolved reference 'scene'`.

- [ ] **Step 3: `GameRandom` erweitern**

`GameRandom.kt`, Klasse und KDoc ersetzen (Imports bleiben):

```kotlin
/**
 * The three independently seeded streams a round is drawn from, split by **publication**:
 * [scene] draws what reaches the client before the reveal, [presentation] what reaches it with or
 * after the reveal, and [solution] only what stays here.
 *
 * Three and not one, because `SeededRandom` is invertible: `nextDouble` publishes 53 bits of two
 * consecutive words, the xoshiro128** transition is a bijection, so a few published doubles pin the
 * generator and let it be run **backwards** past whatever the same stream drew before. Equality of
 * values was never the bar — sharing the stream is.
 *
 * Read [scene] and [presentation] as fully public, [scene] from the moment the round is announced.
 * The game type picked for the round comes from [presentation], because that is announced as well.
 */
class GameRandom(val solution: SeededRandom, val presentation: SeededRandom, val scene: SeededRandom) {

    companion object {
        /**
         * Three draws from a CSPRNG, none stored. `SecureRandom`'s output is not invertible to its
         * state, which is precisely why three seeds may come from one source here while the
         * `SeededRandom`s must never feed each other.
         */
        fun independent(source: SecureRandom) = GameRandom(
            solution = SeededRandom.fromSeed(source.nextInt()),
            presentation = SeededRandom.fromSeed(source.nextInt()),
            scene = SeededRandom.fromSeed(source.nextInt()),
        )

        /**
         * All streams from one visible seed — the lab's constructor, where the seed rides in the URL
         * and nothing is secret anyway. The other two seeds are derived so that one number
         * reproduces a whole round; in production that derivation would be exactly the mistake
         * [independent] avoids, which is why the two factories are separate and named for their use.
         */
        fun fromSeed(seed: Int) = GameRandom(
            solution = SeededRandom.fromSeed(seed),
            presentation = SeededRandom.fromSeed(seed xor PRESENTATION_SALT),
            scene = SeededRandom.fromSeed(seed xor SCENE_SALT),
        )

        /** Arbitrary, fixed: they only have to make the derived streams differ. */
        private const val PRESENTATION_SALT = 0x5F5F5F5F.toInt()
        private const val SCENE_SALT = 0x3C3C3C3C
    }
}
```

`GameType.kt`: im KDoc von `draw` den Satz „Everything the player will be shown must come from [GameRandom.presentation]“ ersetzen durch:

```kotlin
    /**
     * Draw the round, once, at announce time. Everything the player is shown before the reveal comes
     * from [GameRandom.scene], everything shown with or after it from [GameRandom.presentation] —
     * see there for why that is not a stylistic preference.
     */
```

und im KDoc von `scene` den Schluss ab „Drawn from **neither** …“ ersetzen durch:

```kotlin
     * Drawn from [GameRandom.scene] or not drawn at all — never from the other two streams. Both are
     * invertible: a scene value taken from [GameRandom.presentation] would let a client rebuild the
     * still-sealed payload before the reveal, and one from [GameRandom.solution] the solution.
     */
```

- [ ] **Step 4: Aufrufer nachziehen**

Jeder `GameRandom(solution = …, presentation = …)` in den Tests bekommt `scene = SeededRandom.fromSeed(0x5CE)` als drittes benanntes Argument. Kein Test der bestehenden Spiele ändert sein Ergebnis: keines zieht aus `scene`.

- [ ] **Step 5: Tests laufen lassen**

Run: `cd core && ./mvnw test -Dtest='GameRandomTest,*GameTypeTest,GameCatalogTest'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Add a third, scene stream to GameRandom

Entstauber shows its image and tempo before the reveal. Drawn from
the presentation stream, they would let a client step that stream
back to the still-sealed tile order. The rule in game-rounds.md
already names the way out: a third, independently seeded stream.
The four existing games never draw from it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 2: `RoundContext.communityId` und `GameType.isAvailable`

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/AnnouncementService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt`
- Modify (Aufrufer): jede Testdatei mit `RoundContext(` — finden mit `grep -rn "RoundContext(" core/src/test`.

**Interfaces:**
- Produces: `data class RoundContext(val communityId: UUID, val roundNumber: Int, val phase: Phase, val previousParams: List<JsonNode> = emptyList())`; `GameType.isAvailable(context: RoundContext): Boolean = true`; `GameTypeHandle.isAvailable(context: RoundContext): Boolean`; `GameCatalog.availableIds(context: RoundContext): List<String>` (sortiert wie `ids()`).

- [ ] **Step 1: Failing tests schreiben**

In `GameCatalogTest.kt` `FakeGame` um einen Schalter erweitern und zwei Tests anhängen:

```kotlin
    private class FakeGame(
        override val id: String,
        private val available: Boolean = true,
    ) : GameType<FakeParams> {
        // … bestehende Overrides unverändert …
        override fun isAvailable(context: RoundContext) = available
    }
```

```kotlin
    private val context = RoundContext(
        communityId = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de"),
        roundNumber = 3,
        phase = Phase.ONE,
    )

    @Test
    fun `a game that cannot draw for this round is not a candidate`() {
        val ids = catalog(FakeGame("zulu"), FakeGame(id = "empty", available = false), FakeGame("alpha"))
            .availableIds(context)

        ids shouldContainExactly listOf("alpha", "zulu")
    }

    @Test
    fun `a game that says nothing is available`() {
        catalog(FakeGame("silent")).availableIds(context) shouldContainExactly listOf("silent")
    }
```

(Import `java.util.UUID` ergänzen.)

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd core && ./mvnw test -Dtest=GameCatalogTest`
Expected: Kompilierfehler (`communityId`, `isAvailable`, `availableIds` unbekannt).

- [ ] **Step 3: Vertrag erweitern**

`GameType.kt`:

```kotlin
/**
 * What a game may know about the round it is drawing for. [communityId] is whose round it is — the
 * image pool is per community. [previousParams] are the frozen params of this edition's earlier
 * rounds OF THE SAME GAME TYPE — for draws that avoid repetition.
 */
data class RoundContext(
    val communityId: UUID,
    val roundNumber: Int,
    val phase: Phase,
    val previousParams: List<JsonNode> = emptyList(),
)
```

Im Interface `GameType`, direkt nach `draw`:

```kotlin
    /**
     * Whether this game can draw for this round at all. `true` by default — and here the default is
     * the safe direction, because a game that says nothing does not switch itself off.
     *
     * The selection draws from the filtered list; a game without content never comes up.
     */
    fun isAvailable(context: RoundContext): Boolean = true
```

`GameCatalog.kt`, in `GameTypeHandle`:

```kotlin
    /** Whether this game can draw for the round described by [context]. */
    fun isAvailable(context: RoundContext): Boolean = type.isAvailable(context)
```

in `GameCatalog`:

```kotlin
    /** [ids] without the games that cannot draw for this round — still sorted, for the same reason. */
    fun availableIds(context: RoundContext): List<String> =
        ids().filter { id -> handles.getValue(id).isAvailable(context) }
```

- [ ] **Step 4: Ankündigung filtert vor der Wahl**

`AnnouncementService.kt`: `materialise` bekommt die Gemeinschaft, baut den Kontext **vor** der Wahl und zieht nur aus verfügbaren Spielen. Aufruf in `resolve` anpassen: `materialise(communityId = communityId, edition = edition, round = round)`.

```kotlin
    private fun materialise(communityId: UUID, edition: CommunityEdition, round: Round): RoundGame? {
        val history = store.history(edition = edition, roundNumber = round.number)
        val random = GameRandom.independent(secureRandom)
        val context = RoundContext(
            communityId = communityId,
            roundNumber = round.number,
            phase = Phase.of(edition = edition, roundNumber = round.number),
        )
        val typeId = selection.pick(
            candidates = catalog.availableIds(context),
            history = history,
            // The chosen type is announced, so it is a published value and comes from the published
            // stream — the same rule that governs the payload.
            random = random.presentation,
        ) ?: run {
            // … Kommentar und Warnung unverändert …
        }
        val handle = requireNotNull(catalog.handle(typeId)) { "selection picked unknown type '$typeId'" }
        val announced = store.announce(
            edition = edition,
            roundNumber = round.number,
            gameType = typeId,
            params = handle.draw(
                random = random,
                context = context.copy(
                    previousParams = store.previousParams(edition = edition, gameType = typeId),
                ),
            ),
            // … Rest unverändert …
```

- [ ] **Step 5: Labor reicht die Gemeinschaft durch**

`LabService.kt`: `chooseRound` bekommt `communityId: UUID`; alle zehn Aufrufe werden `chooseRound(communityId = communityId, handle = handle, seed = seed, phase = phase)`. Ein Spiel, das für diese Gemeinschaft nicht ziehen kann, ist im Labor so wenig da wie ein unbekanntes — 404, wie die Labor-Guideline es will:

```kotlin
    private fun chooseRound(communityId: UUID, handle: GameTypeHandle<*>, seed: Int, phase: Phase): LabRound {
        val award: Award = awardFor(
            roundNumber = LAB_ROUND_NUMBER,
            phaseTwoStartRound = if (phase == Phase.TWO) LAB_ROUND_NUMBER else null,
        )
        val context = RoundContext(communityId = communityId, roundNumber = LAB_ROUND_NUMBER, phase = phase)
        if (!handle.isAvailable(context)) throw UnknownLabGameException("'${handle.id}' cannot draw here")
        return LabRound(
            seed = seed,
            phase = phase,
            params = handle.draw(random = GameRandom.fromSeed(seed), context = context),
            award = award,
        )
    }
```

- [ ] **Step 6: Labortest — kommt mit Task 7**

`LabServiceTest` läuft gegen den **echten** Katalog, und heute kann jedes Spiel darin ziehen. Den Pfad „nicht verfügbar → `UnknownLabGameException`“ prüft Task 7 mit dem ersten Spiel, das ablehnen kann. Hier genügt, dass die bestehenden Labortests mit dem neuen `chooseRound` grün bleiben.

- [ ] **Step 7: Aufrufer nachziehen**

Jeder `RoundContext(` in den Tests bekommt `communityId = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")` als erstes benanntes Argument (eine Konstante pro Datei, `private val community = …`).

- [ ] **Step 8: Tests laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Let a game decline a round it cannot draw

Entstauber draws from the community's image pool and has nothing to
draw while that pool and the global one are empty, which is the normal
state locally and on staging. The round context now carries the
community, and the selection only draws among games that can.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 3: `scoresOnDuration` — Aufdecken und Zeitwertung getrennt

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameCatalog.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/{PlayService, RoundResponses, RoundDtos}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/{FindPatternGameType, GuessHueGameType, SongSnippetGameType, SpotObjectGameType}.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/{LabService, LabDtos}.kt`
- Modify: `webapp-vue/src/api/types.ts`, `webapp-vue/src/gamelab/types.ts`, `webapp-vue/src/rounds/RoundCard.vue`, `webapp-vue/src/pages/c/[slug]/lab/[game]/index.vue`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceTimedTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/GameCatalogTest.kt`
- Test: `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`
- Modify (Aufrufer): jeder Fake-`GameType` in den Tests (`grep -rln "override fun requiresReveal" core/src/test`) und jede Frontend-Fixture mit `requiresReveal:` (`grep -rln "requiresReveal" webapp-vue/src`).

**Interfaces:**
- Produces: `GameType.scoresOnDuration(params: P): Boolean` (abstrakt); `GameTypeHandle.scoresOnDuration(params: JsonNode): Boolean`; `GameDto(id, displayName, requiresReveal, scoresOnDuration)`; `LabRoundResponse.scoresOnDuration: Boolean`; TS: `GameDto.scoresOnDuration: boolean`, `LabRoundResponse.scoresOnDuration: boolean`.

Warum: Entstauber braucht das einmalige Aufdecken, gewertet wird aber die ⌀-Reaktionszeit. Ohne Trennung überschriebe `PlayService.guess` die `deviation` mit der Dauer — bei festem Takt für alle Durchhalter dieselbe Zahl. Antworten auf `requiresReveal(params)` / `scoresOnDuration(params)`: Farbausmalung `false`/`false`, Anspielung `false`/`false`, Musterung und Weltanschauung `params.timed`/`params.timed`, Entstauber (Task 7) `true`/`false`.

- [ ] **Step 1: Failing test schreiben**

In `PlayServiceTimedTest.kt` in `TimedGame` eine zweite Bean anhängen — aufgedeckt, aber nicht auf Zeit gewertet; die eigene `deviation` kommt aus dem Tipp:

```kotlin
        /** Revealed once, scored on its own number — the shape Entstauber has. */
        @Bean
        fun untimedRevealGame(): GameType<TimedParams> = object : GameType<TimedParams> {
            override val id = "untimed-reveal-fake"
            override val displayName = "Staubfänger"
            override val paramsType = TimedParams::class.java
            override fun draw(random: GameRandom, context: RoundContext) = TimedParams(answer = 7)
            override fun present(params: TimedParams) = TimedPayload(prompt = "?")
            override fun judge(params: TimedParams, guess: JsonNode) = Judgement(
                qualifies = true,
                deviation = guess.get("value").asDouble(),
                outcome = null,
            )
            override fun requiresReveal(params: TimedParams) = true
            override fun scoresOnDuration(params: TimedParams) = false
        }
```

`announce` bekommt einen Parameter `gameType: String = "timed-fake"` und reicht ihn an `store.announce` durch. Test:

```kotlin
    @Test
    fun `a revealed game that does not score on time keeps its own distance and publishes no duration`() {
        val community = aCommunity("Untimed Reveal")
        announce(community = community, rule = AwardRule.CLOSEST_ONLY, gameType = "untimed-reveal-fake")
        val viewer = aMember(community = community, login = "viewer")

        play.reveal(slug = community.slug, userId = viewer, isSuperAdmin = false)
        clock.advance(Duration.ofSeconds(42))
        val response = play.guess(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = currentNumber(community), guess = mapper.readTree("""{"value":311.5}"""),
        )

        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = roundGameId(community), userId = viewer,
        ).shouldNotBeNull()
        row.deviation shouldBe 311.5
        response.me.shouldNotBeNull().durationMs.shouldBeNull()
        response.game.shouldNotBeNull().requiresReveal shouldBe true
        response.game.shouldNotBeNull().scoresOnDuration shouldBe false
    }
```

(Import `io.kotest.matchers.nulls.shouldBeNull`.) Und in `GameCatalogTest` die Durchreichung prüfen wie bei `requiresReveal`: `FakeGame.scoresOnDuration` antwortet `params.secret % 3 == 0`, Test mit `secret = 3` → `true`, `secret = 4` → `false`.

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='PlayServiceTimedTest,GameCatalogTest'`
Expected: Kompilierfehler (`scoresOnDuration` ist kein Mitglied von `GameType`).

- [ ] **Step 3: Vertrag**

`GameType.kt`, direkt nach `requiresReveal`:

```kotlin
    /**
     * Whether the span from the reveal to the guess IS this game's score.
     *
     * Separate from [requiresReveal] because the two questions part ways: Entstauber needs the one
     * deliberate reveal, but scores on reaction times its own judge computes. When `true`, the
     * framework replaces [Judgement.deviation] with that span and publishes it as `durationMs`.
     *
     * No default, for the same reason as [requiresReveal]: the convenient answer is not the safe one.
     */
    fun scoresOnDuration(params: P): Boolean
```

`GameTypeHandle`:

```kotlin
    /** Whether reveal-to-guess is this round's score, from a stored `params` blob. */
    fun scoresOnDuration(params: JsonNode): Boolean = type.scoresOnDuration(paramsOf(params))
```

- [ ] **Step 4: Die vier Spiele antworten**

- `GuessHueGameType`, `SongSnippetGameType`: `override fun scoresOnDuration(params: …) = false`
- `FindPatternGameType`, `SpotObjectGameType`: `override fun scoresOnDuration(params: …) = params.timed`

Jeder Fake-`GameType` in den Tests bekommt `override fun scoresOnDuration(params: X) = <derselbe Ausdruck wie sein requiresReveal>` — damit ändert sich für keinen bestehenden Test etwas.

- [ ] **Step 5: Server liest die richtige Frage**

`PlayService.guess`, der `deviation`-Zweig:

```kotlin
        val deviation = when {
            stages > 1 -> play.stage.toDouble()
            current.handle.scoresOnDuration(round.params) ->
                durationMsBetween(revealedAt = play.revealedAt, guessedAt = guessedAt).toDouble()
            else -> judgement.deviation
        }
```

Den Kommentar darüber anpassen: „For a game that scores on duration it is the time since that reveal started“ statt „For a game that asked for a deliberate reveal …“.

`RoundDtos.kt`:

```kotlin
/**
 * [requiresReveal] and [scoresOnDuration] ride on the game rather than on the round, because they
 * are the game's answers — and are therefore absent exactly when there is no game to answer for.
 * The first seals the round until a deliberate reveal; the second starts the band's stopwatch.
 */
data class GameDto(
    val id: String,
    val displayName: String,
    val requiresReveal: Boolean,
    val scoresOnDuration: Boolean,
)
```

Im KDoc von `durationMs` (zweimal, `MyPlayDto` und `OtherPlayDto`) „The condition is `GameType.requiresReveal`, not a new switch: that flag already means „the clock is part of this game““ ersetzen durch „The condition is `GameType.scoresOnDuration`: published exactly when the duration is the score.“

`RoundResponses.kt`:

```kotlin
        // Asked once per response, not per row: it is the round's game that decides, not the player.
        val timed = current.handle.scoresOnDuration(current.roundGame.params)
```

```kotlin
            game = GameDto(
                id = current.handle.id,
                displayName = current.handle.displayName,
                requiresReveal = current.handle.requiresReveal(current.roundGame.params),
                scoresOnDuration = timed,
            ),
```

KDoc von `durationMsOf`: „Only for a game that scores on duration“ statt „Only for a game that asked for the reveal“.

- [ ] **Step 6: Labor**

`LabService.guess`: die Wache bleibt bei `requiresReveal`, die Dauer folgt `scoresOnDuration`:

```kotlin
        if (handle.requiresReveal(playing.params) &&
            !store.hasOpened(communityId = communityId, gameId = gameId, round = playing, userId = userId)
        ) {
            throw LabNotRevealedException()
        }
```

und an `store.record(…)` `timed = handle.scoresOnDuration(playing.params)`. Die lokale Variable `timed` fällt weg; den Kommentar über `adjusted` entsprechend auf „a game that scores on duration“ ändern.

`LabDtos.kt`, `LabRoundResponse` nach `awardPoints`:

```kotlin
    /** Whether the band's stopwatch runs for this game — mirrors `GameDto.scoresOnDuration`. */
    val scoresOnDuration: Boolean,
```

In `LabService.respond` füllen: `scoresOnDuration = handle.scoresOnDuration(snapshot.round.params)`. Der KDoc von `LabEntryDto.durationMs` („`null` for a game that does not score on time“) stimmt schon.

- [ ] **Step 7: Backend-Tests laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 8: Frontend — Failing test**

In `webapp-vue/src/rounds/__tests__/RoundCard.spec.ts`, neben den Stoppuhr-Tests (dort gibt es `aRound`, `aPlay`, `mountCard`, `playOf`). `aRound` bekommt in seinem Vorgabe-`game` `scoresOnDuration: true` (es ist das Uhr-Spiel der Datei), dann:

```ts
  // Revealed once, but the score is not the clock — Entstauber's shape.
  it('leaves the band alone for a sealed game that does not score on time', () => {
    const w = mountCard({
      round: aRound({
        game: { id: 'deduster', displayName: 'Entstauber', requiresReveal: true, scoresOnDuration: false },
        me: aPlay({ revealedAt: '2026-08-14T11:00:00Z' }),
      }),
    })

    expect(playOf(w)).toBeNull()
  })
```

Run: `cd webapp-vue && pnpm test -- src/rounds/__tests__/RoundCard.spec.ts`
Expected: FAIL (Typfehler bzw. `play` läuft trotz `scoresOnDuration: false`).

- [ ] **Step 9: Frontend umstellen**

`api/types.ts`, `GameDto`:

```ts
  requiresReveal: boolean
  /** Whether reveal-to-guess is the score — what starts the band's stopwatch. */
  scoresOnDuration: boolean
```

`gamelab/types.ts`, `LabRoundResponse` nach `awardPoints`: `scoresOnDuration: boolean`.

`rounds/RoundCard.vue`, in `play`:

```ts
  return props.round?.game?.scoresOnDuration === true
    ? { phase: 'running', since: me.revealedAt }
    : null
```

Die Zeile `return props.round?.game?.requiresReveal === true` an Zeile ~87 (das Gesicht `sealed` o. ä.) bleibt **unverändert** — sie fragt nach dem Aufdecken.

`pages/c/[slug]/lab/[game]/index.vue`, `labPlay`:

```ts
const labPlay = computed<PlayClock | null>(() => {
  const since = playStartedAt.value
  return since !== null && round.value?.me == null && round.value?.scoresOnDuration === true
    ? { phase: 'running', since }
    : null
})
```

Jede Fixture, die `requiresReveal:` setzt oder einen `LabRoundResponse` baut, bekommt `scoresOnDuration` mit demselben Wert wie ihr `requiresReveal` (Labor: `true` genau dann, wenn das Spiel dort heute eine Stoppuhr zeigt). `pnpm typecheck` findet jede fehlende.

- [ ] **Step 10: Frontend-Prüfung**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add core/src webapp-vue/src
git commit -F - <<'MSG'
Split scoring on duration from requiring a reveal

requiresReveal meant two things: a single deliberate reveal, and that
reveal-to-guess is the score. Entstauber needs the first without the
second; with one flag the framework would overwrite its average
reaction time with a duration that is the same for every finisher.
The duration is published, and the stopwatch runs, only when it is
the score.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 4: `SCENE_ASSET_KEY` — ein Asset vor dem Aufdecken

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/GameType.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/PlayService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabService.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/RoundAssetGateTest.kt`

**Interfaces:**
- Produces: `const val SCENE_ASSET_KEY = 98` im Paket `org.unividuell.countdown.core.game`.

- [ ] **Step 1: Failing test schreiben**

`RoundAssetGateTest.GatedGame.gatedGame().asset` liefert zusätzlich `SCENE_ASSET_KEY -> RoundAsset(mediaType = "image/jpeg", bytes = byteArrayOf(98))`, und `scoresOnDuration(params) = false` kommt aus Task 3 schon mit. Zwei Tests:

```kotlin
    @Test
    fun `the scene asset opens before the reveal, without a play row`() {
        val (community, viewer) = aCommunity("Asset Gate Scene")
        val roundNumber = announceGated(community)

        play.asset(
            slug = community.slug, userId = viewer, isSuperAdmin = false,
            roundNumber = roundNumber, key = SCENE_ASSET_KEY,
        ).bytes shouldBe byteArrayOf(98)
    }

    @Test
    fun `every other key still needs the reveal`() {
        val (community, viewer) = aCommunity("Asset Gate Scene Only")
        val roundNumber = announceGated(community)

        shouldThrow<NotRevealedException> {
            play.asset(
                slug = community.slug, userId = viewer, isSuperAdmin = false,
                roundNumber = roundNumber, key = 0,
            )
        }
    }
```

(Import `org.unividuell.countdown.core.game.internal.NotRevealedException`.) Die Labor-Seite des Schlüssels prüft Task 7 mit Entstauber selbst — `LabServiceTest` kennt nur den echten Katalog, und heute liefert dort kein Spiel ein Bühnen-Asset.

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd core && ./mvnw test -Dtest=RoundAssetGateTest`
Expected: Kompilierfehler `Unresolved reference 'SCENE_ASSET_KEY'`.

- [ ] **Step 3: Konstante und Gates**

`GameType.kt`, neben `SOLUTION_ASSET_KEY`:

```kotlin
/**
 * The asset key of a round's scene: open as soon as the round is announced, no play row needed.
 * Opening stage 0 instead would be the wrong cut — for Anspielung that is the first clip, the puzzle.
 */
const val SCENE_ASSET_KEY = 98
```

`PlayService.asset`, nach `val roundGameId = …` und **vor** dem Lesen der Play-Zeile:

```kotlin
        if (key == SCENE_ASSET_KEY) {
            return announced.handle.asset(params = announced.roundGame.params, roundGameId = roundGameId, key = key)
                ?: throw AssetNotFoundException()
        }
```

(Import `org.unividuell.countdown.core.game.SCENE_ASSET_KEY`.) Im KDoc der Methode einen Satz ergänzen: „The scene key is the one exception to the play row: it is what the cover lies over.“

`LabService.asset`:

```kotlin
        val allowed = when (key) {
            SCENE_ASSET_KEY -> true
            SOLUTION_ASSET_KEY -> hasGuessed
            else -> key in 0..stage
        }
```

- [ ] **Step 4: Tests laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Serve a round's scene asset before the reveal

The cover promises that a game's scene is fully set up before anyone
starts. For Entstauber that scene includes the photo, so it has to be
fetchable without a play row. A reserved key keeps every other asset
behind the reveal; opening stage 0 instead would hand Anspielung's
first clip out early.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 5: `imagepool` exportiert `ImagePoolQuery`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolQuery.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImagePoolQueryService.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageIntake.kt`
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/imagepool/internal/ImageRepository.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageIntakeTest.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImagePoolQueryServiceTest.kt` (neu)
- Modify (Testhygiene): `core/src/test/kotlin/org/unividuell/countdown/core/imagepool/ImageRepositoryTest.kt` und jede weitere Testklasse, die Zeilen **committet** in den globalen Bestand schreibt.

**Interfaces:**
- Produces (Paket `org.unividuell.countdown.core.imagepool`):
  - `data class ImageSize(val width: Int, val height: Int)`
  - `interface ImagePoolQuery { fun candidateIds(communityId: UUID?): List<UUID>; fun displaySize(id: UUID): ImageSize?; fun displayed(id: UUID, minShortEdge: Int): BufferedImage? }`
- Produces (intern): `ImageIntake.displayDimensions(bytes, mediaType): Dimensions`, `ImageIntake.displayed(bytes, mediaType, minShortEdge): BufferedImage`, `ImageRepository.idsInPool(communityId: UUID?): List<UUID>`.

Warum `displayed` statt `original` (Abweichung von der Spec, siehe Kopf): die EXIF-Drehung lebt in `ImageIntake`, und `deduster` darf `imagepool.internal` nicht sehen. Warum `displaySize` einzeln: die Spalten `width`/`height` stammen aus dem Dateikopf und sind bei Hochformat-Handyfotos **vertauscht**; für das Raster zählen die angezeigten Maße.

- [ ] **Step 1: Testhygiene zuerst**

`ImageRepositoryTest` committet Zeilen in den **globalen** Bestand (`communityId = null`, Bytes `[seed, seed, seed]` — kein dekodierbares Bild) und lässt sie liegen. Sobald Entstauber im Katalog steht (Task 7), sähe jede spätere Ankündigung in der Testsuite diese Zeilen als verfügbaren Bestand, könnte Entstauber ziehen und am Dekodieren scheitern — abhängig von der Testreihenfolge. Deshalb räumt jede Testklasse, die committet in den globalen Bestand schreibt, nach jedem Test auf:

```kotlin
    @Autowired lateinit var jdbc: JdbcTemplate

    @AfterEach
    fun cleanUpGlobalPool() {
        // The global pool is shared by the whole suite; a leftover row here is an "available image"
        // for every later announcement — and these test rows do not decode.
        jdbc.update("DELETE FROM imagepool.images WHERE community_id IS NULL")
    }
```

Welche Klassen das sind: `ImageRepositoryTest` sicher. Für `ImagePoolGateTest`, `SuperAdminImageControllerTest`, `ImagePoolControllerTest` prüfen, ob sie gegen die echte Datenbank speichern (kein `@Transactional` und kein gemocktes Repository) — dann dieselbe Methode. `ImagePoolServiceTest` mockt das Repository und braucht nichts.

- [ ] **Step 2: Failing tests schreiben — `ImageIntake`**

In `ImageIntakeTest.kt` anhängen:

```kotlin
    @Test
    fun `display dimensions swap for an EXIF-rotated photo`() {
        ImageIntake.displayDimensions(bytes = fixture("exif-orientation-6.jpg"), mediaType = "image/jpeg") shouldBe
            Dimensions(width = 20, height = 40)
    }

    @Test
    fun `display dimensions of an unrotated image are its header`() {
        ImageIntake.displayDimensions(bytes = encoded(format = "png", width = 30, height = 10), mediaType = "image/png") shouldBe
            Dimensions(width = 30, height = 10)
    }

    @Test
    fun `the displayed image is rotated as shown`() {
        val img = ImageIntake.displayed(
            bytes = fixture("exif-orientation-6.jpg"), mediaType = "image/jpeg", minShortEdge = 10,
        )

        img.width shouldBe 20
        img.height shouldBe 40
        (Color(img.getRGB(10, 5)).red > Color(img.getRGB(10, 5)).blue) shouldBe true
    }

    @Test
    fun `the displayed image is subsampled only as far as the short edge allows`() {
        val img = ImageIntake.displayed(
            bytes = encoded(format = "png", width = 4000, height = 3000), mediaType = "image/png", minShortEdge = 1000,
        )

        // 3000 / 1000 = step 3 → 1334 × 1000: as small as possible, never below the asked edge.
        img.height shouldBe 1000
        img.width shouldBe 1334
    }
```

Run: `cd core && ./mvnw test -Dtest=ImageIntakeTest`
Expected: Kompilierfehler (`displayDimensions`, `displayed` unbekannt).

- [ ] **Step 3: `ImageIntake` — eine Dekodierstrecke, zwei Abnehmer**

`thumbnail` und das neue `displayed` teilen sich Dekodieren, Weißgrund und Drehung; nur der Unterabtastschritt unterscheidet sich. In `ImageIntake.kt`:

```kotlin
    /**
     * Header and EXIF tag only, never a decode: the size the image is *shown* at. Orientations 5–8
     * turn the picture by 90°, so width and height trade places.
     */
    fun displayDimensions(bytes: ByteArray, mediaType: String): Dimensions {
        val stored = probe(bytes = bytes, mediaType = mediaType)
        return if (orientationOf(bytes) in 5..8) Dimensions(width = stored.height, height = stored.width) else stored
    }

    /**
     * The image as shown — EXIF orientation applied, transparency flattened onto white — decoded
     * subsampled as far as possible while the short edge stays at or above [minShortEdge]. For a
     * consumer that crops and scales itself; the short edge is the one a centre crop never loses.
     */
    fun displayed(bytes: ByteArray, mediaType: String, minShortEdge: Int): BufferedImage =
        decodedAsShown(bytes = bytes, mediaType = mediaType) { width, height ->
            max(a = 1, b = minOf(a = width, b = height) / minShortEdge)
        }

    /** Decode subsampled by [step] (from the source's width and height), flatten, rotate as shown. */
    private fun decodedAsShown(
        bytes: ByteArray,
        mediaType: String,
        step: (width: Int, height: Int) -> Int,
    ): BufferedImage {
        val decoded = withReader(bytes = bytes, mediaType = mediaType) { reader ->
            val by = step(reader.getWidth(0), reader.getHeight(0))
            val param = reader.defaultReadParam.apply { setSourceSubsampling(by, by, 0, 0) }
            reader.read(0, param)
        }
        // Flattened onto white FIRST: every buffer below is TYPE_INT_RGB, which starts out black,
        // so rotating a transparent PNG before the white ground is laid down turns its alpha black.
        return applyOrientation(image = flattenedOntoWhite(decoded), orientation = orientationOf(bytes))
    }
```

`thumbnail` nutzt dieselbe Strecke — der Block von `val decoded = …` bis `val oriented = …` wird:

```kotlin
        val oriented = decodedAsShown(bytes = bytes, mediaType = mediaType) { width, height ->
            subsamplingStep(longEdge = max(a = width, b = height), maxEdge = maxEdge)
        }
```

Der Kommentar „Flattened onto white FIRST …“ zieht dabei mit in `decodedAsShown` und verschwindet aus `thumbnail`; der KDoc von `thumbnail` bleibt.

Run: `cd core && ./mvnw test -Dtest=ImageIntakeTest`
Expected: PASS — auch alle bestehenden Thumbnail-Tests.

- [ ] **Step 4: Failing test schreiben — die Schnittstelle**

`ImagePoolQueryServiceTest.kt` (gegen die echte Datenbank, damit die Abfrage selbst geprüft ist):

```kotlin
package org.unividuell.countdown.core.imagepool

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.community.internal.CommunityService
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.internal.Image
import org.unividuell.countdown.core.imagepool.internal.ImageRepository
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.UUID
import javax.imageio.ImageIO

/** Rolled back after each test: nothing here may outlive it in the shared global pool. */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class ImagePoolQueryServiceTest(
    @Autowired val query: ImagePoolQuery,
    @Autowired val images: ImageRepository,
    @Autowired val communities: CommunityService,
    @Autowired val users: UserRepository,
) {
    private fun user(): UUID = users.save(User(githubId = System.nanoTime(), githubLogin = "pool-query")).id!!

    private fun png(width: Int, height: Int): ByteArray {
        val img = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        img.createGraphics().apply { color = Color.GREEN; fillRect(0, 0, width, height); dispose() }
        return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
    }

    private fun stored(communityId: UUID?, uploader: UUID, bytes: ByteArray): UUID = images.save(
        Image(
            communityId = communityId, uploadedBy = uploader, mediaType = "image/png",
            width = 1, height = 1, byteSize = bytes.size,
            sha256 = MessageDigest.getInstance("SHA-256").digest(bytes),
            bytes = bytes, thumbBytes = byteArrayOf(0),
        ),
    ).id!!

    @Test
    fun `candidates are one pool's ids in a stable order`() {
        val owner = user()
        val community = communities.create(creatorUserId = owner, rawName = "Pool Query").id!!
        val first = stored(communityId = community, uploader = owner, bytes = png(width = 10, height = 5))
        val second = stored(communityId = community, uploader = owner, bytes = png(width = 11, height = 5))
        stored(communityId = null, uploader = owner, bytes = png(width = 12, height = 5))

        query.candidateIds(community) shouldContainExactly listOf(first, second)
    }

    @Test
    fun `the display size comes from the image, not from the stored columns`() {
        val owner = user()
        val id = stored(communityId = null, uploader = owner, bytes = png(width = 30, height = 10))

        query.displaySize(id) shouldBe ImageSize(width = 30, height = 10)
    }

    @Test
    fun `a missing image has neither size nor pixels`() {
        query.displaySize(UUID.randomUUID()).shouldBeNull()
        query.displayed(id = UUID.randomUUID(), minShortEdge = 10).shouldBeNull()
    }

    @Test
    fun `the displayed image is decoded`() {
        val owner = user()
        val id = stored(communityId = null, uploader = owner, bytes = png(width = 30, height = 10))

        query.displayed(id = id, minShortEdge = 10).shouldNotBeNull().width shouldBe 30
    }
}
```

Run: `cd core && ./mvnw test -Dtest=ImagePoolQueryServiceTest`
Expected: Kompilierfehler (`ImagePoolQuery` unbekannt).

- [ ] **Step 5: Schnittstelle und Implementierung**

`ImagePoolQuery.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool

import java.awt.image.BufferedImage
import java.util.UUID

/** The size an image is *shown* at — EXIF orientation already applied. */
data class ImageSize(val width: Int, val height: Int)

/**
 * The pool as other modules see it: which images there are, and what one looks like. Read-only,
 * and without a word of game knowledge — which pool a game prefers is the game's rule.
 */
interface ImagePoolQuery {
    /** This pool's image ids in a stable order. `null` addresses the global pool. */
    fun candidateIds(communityId: UUID?): List<UUID>

    /**
     * The shown size, from the file header and its EXIF tag — the stored `width`/`height` are the
     * header's and lie for a rotated phone photo. Reads one image; the pool is never decoded whole.
     */
    fun displaySize(id: UUID): ImageSize?

    /**
     * The image as shown, decoded only as small as [minShortEdge] allows — see
     * `ImageIntake.displayed`. `null` when the image is gone.
     */
    fun displayed(id: UUID, minShortEdge: Int): BufferedImage?
}
```

`ImageRepository.kt`:

```kotlin
    /** Ascending, so a seeded pick over this list is reproducible. IS NOT DISTINCT FROM: see [countInPool]. */
    @Query("SELECT id FROM imagepool.images WHERE community_id IS NOT DISTINCT FROM :communityId ORDER BY id")
    fun idsInPool(communityId: UUID?): List<UUID>
```

`ImagePoolQueryService.kt`:

```kotlin
package org.unividuell.countdown.core.imagepool.internal

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import java.awt.image.BufferedImage
import java.util.UUID

@Service
class ImagePoolQueryService(private val images: ImageRepository) : ImagePoolQuery {

    @Transactional(readOnly = true)
    override fun candidateIds(communityId: UUID?): List<UUID> = images.idsInPool(communityId)

    @Transactional(readOnly = true)
    override fun displaySize(id: UUID): ImageSize? = images.findOriginal(id)?.let {
        val shown = ImageIntake.displayDimensions(bytes = it.bytes, mediaType = it.mediaType)
        ImageSize(width = shown.width, height = shown.height)
    }

    @Transactional(readOnly = true)
    override fun displayed(id: UUID, minShortEdge: Int): BufferedImage? = images.findOriginal(id)?.let {
        ImageIntake.displayed(bytes = it.bytes, mediaType = it.mediaType, minShortEdge = minShortEdge)
    }
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `cd core && ./mvnw test`
Expected: PASS, inklusive `ModularityTests`.

- [ ] **Step 7: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Export a read-only query API from imagepool

Its first consumer is Entstauber, which needs a pool's image ids, an
image's shown size, and the image itself as shown. The stored width
and height come from the file header and are swapped for rotated
phone photos, so the size is read from the header plus its EXIF tag.
The image is handed out decoded and already rotated, because the EXIF
handling lives here and nowhere else.

The image tests now clear the global pool behind them: a leftover row
there is an available image for every later announcement in the suite.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 6: Das Modul `deduster`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterGrid.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterTicks.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterPool.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/DedusterImages.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/RoundImageStore.kt`
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/deduster/internal/{RoundImage, RoundImageRepository, DedusterProperties, DedusterConfiguration}.kt`
- Create: `core/src/main/resources/db/migration/deduster/V1__create_round_images.sql`
- Modify: `core/src/main/resources/application.yaml`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/deduster/{DedusterGridTest, DedusterTicksTest, DedusterPoolTest, DedusterImagesTest, RoundImageStoreTest}.kt`

**Interfaces:**
- Consumes: `ImagePoolQuery` (Task 5).
- Produces (Paket `org.unividuell.countdown.core.deduster`):
  - `enum class DedusterGrid(val cols: Int, val rows: Int, val ratioWidth: Int, val ratioHeight: Int) { LANDSCAPE, PORTRAIT, SQUARE }` mit `val tiles: Int`, `DedusterGrid.of(width: Int, height: Int)`, `DedusterGrid.ofLayout(cols: Int, rows: Int)`.
  - `object DedusterTicks { val WEIGHTS: Map<Int, Int>; fun intervalMs(scene: SeededRandom): Int }`
  - `@Component class DedusterPool { fun candidates(communityId: UUID): List<UUID>; fun gridOf(imageId: UUID): DedusterGrid? }`
  - `@Component class DedusterImages { fun playImage(imageId: UUID, grid: DedusterGrid): ByteArray? }`, dazu `DedusterImages.render(source: BufferedImage, grid: DedusterGrid, longEdge: Int, quality: Float): ByteArray`.
  - `class StoredImage(val mediaType: String, val bytes: ByteArray)`; `@Component class RoundImageStore { fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray); fun find(roundGameId: UUID): StoredImage?; fun release(roundGameIds: List<UUID>): Int }`

Abhängigkeit: `deduster → imagepool`. Niemand außer dem Adapter (Task 7) importiert `deduster`.

- [ ] **Step 1: Failing tests — Raster und Takt**

`DedusterGridTest.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class DedusterGridTest {

    @Test
    fun `the thresholds are the geometric means of the three targets`() {
        DedusterGrid.of(width = 11547, height = 10000) shouldBe DedusterGrid.LANDSCAPE
        DedusterGrid.of(width = 11546, height = 10000) shouldBe DedusterGrid.SQUARE
        DedusterGrid.of(width = 8661, height = 10000) shouldBe DedusterGrid.SQUARE
        DedusterGrid.of(width = 8660, height = 10000) shouldBe DedusterGrid.PORTRAIT
    }

    @Test
    fun `a phone photo lands on its orientation`() {
        DedusterGrid.of(width = 4000, height = 3000) shouldBe DedusterGrid.LANDSCAPE
        DedusterGrid.of(width = 3000, height = 4000) shouldBe DedusterGrid.PORTRAIT
        DedusterGrid.of(width = 1080, height = 1080) shouldBe DedusterGrid.SQUARE
    }

    @Test
    fun `the tile count stays all but fixed, so averages stay comparable`() {
        DedusterGrid.LANDSCAPE.tiles shouldBe 48
        DedusterGrid.PORTRAIT.tiles shouldBe 48
        DedusterGrid.SQUARE.tiles shouldBe 49
    }

    @Test
    fun `a stored layout finds its grid again`() {
        DedusterGrid.ofLayout(cols = 6, rows = 8) shouldBe DedusterGrid.PORTRAIT
    }
}
```

`DedusterTicksTest.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.rng.SeededRandom

class DedusterTicksTest {

    @Test
    fun `every drawn tempo is one the original played`() {
        val scene = SeededRandom.fromSeed(7)
        repeat(500) { DedusterTicks.intervalMs(scene) shouldBeIn DedusterTicks.WEIGHTS.keys }
    }

    @Test
    fun `the median of the original is the most frequent draw`() {
        val scene = SeededRandom.fromSeed(11)
        val counts = List(20_000) { DedusterTicks.intervalMs(scene) }.groupingBy { it }.eachCount()

        counts.maxBy { it.value }.key shouldBe 1300
    }

    @Test
    fun `the table is the original's, verbatim`() {
        DedusterTicks.WEIGHTS shouldBe mapOf(
            900 to 1, 1000 to 4, 1100 to 4, 1200 to 8, 1300 to 9,
            1400 to 3, 1500 to 1, 1800 to 2, 1900 to 1, 2000 to 1,
        )
    }
}
```

Run: `cd core && ./mvnw test -Dtest='DedusterGridTest,DedusterTicksTest'`
Expected: Kompilierfehler.

- [ ] **Step 2: Raster und Takt implementieren**

`DedusterGrid.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

/**
 * The grid a round is played on and the ratio its photo is cropped to. The tile count is fixed —
 * 48 or 49 — because average reaction times are only comparable across rounds of the same length;
 * the grid follows the photo's orientation instead, since the pool is fed by phone cameras.
 */
enum class DedusterGrid(val cols: Int, val rows: Int, val ratioWidth: Int, val ratioHeight: Int) {
    LANDSCAPE(cols = 8, rows = 6, ratioWidth = 4, ratioHeight = 3),
    PORTRAIT(cols = 6, rows = 8, ratioWidth = 3, ratioHeight = 4),
    SQUARE(cols = 7, rows = 7, ratioWidth = 1, ratioHeight = 1),
    ;

    val tiles: Int get() = cols * rows

    companion object {
        /** √(4/3) and √(3/4): the geometric means of neighbouring targets — every photo gets the crop that cuts least. */
        private const val LANDSCAPE_FROM = 1.1547
        private const val PORTRAIT_UP_TO = 0.8660

        fun of(width: Int, height: Int): DedusterGrid {
            val ratio = width.toDouble() / height
            return when {
                ratio >= LANDSCAPE_FROM -> LANDSCAPE
                ratio <= PORTRAIT_UP_TO -> PORTRAIT
                else -> SQUARE
            }
        }

        /** The grid a round's frozen `cols`/`rows` were drawn as. */
        fun ofLayout(cols: Int, rows: Int): DedusterGrid = entries.single { it.cols == cols && it.rows == rows }
    }
}
```

`DedusterTicks.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import org.unividuell.countdown.core.rng.SeededRandom

/**
 * How fast tiles fall. Drawn, not fixed: long is not easy — at 2000 ms a round lasts 96 s and the
 * last tiles meet a concentration long gone — and short is hard the other way.
 */
object DedusterTicks {

    /** The original's Entstauber rounds by tempo in ms (its one 960 ms round counted as 1000). */
    val WEIGHTS: Map<Int, Int> = linkedMapOf(
        900 to 1, 1000 to 4, 1100 to 4, 1200 to 8, 1300 to 9,
        1400 to 3, 1500 to 1, 1800 to 2, 1900 to 1, 2000 to 1,
    )

    fun intervalMs(scene: SeededRandom): Int =
        scene.weightedPick(items = WEIGHTS.keys.toList(), weights = WEIGHTS.values.map { it.toDouble() })
}
```

Run: `cd core && ./mvnw test -Dtest='DedusterGridTest,DedusterTicksTest'`
Expected: PASS.

- [ ] **Step 3: Failing tests — Pool und Bild**

`DedusterPoolTest.kt` (mockk, kein Spring):

```kotlin
package org.unividuell.countdown.core.deduster

import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import java.util.UUID

class DedusterPoolTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val own = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val global = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val query = mockk<ImagePoolQuery>()
    private val pool = DedusterPool(query)

    @Test
    fun `the community's own images come first, exclusively`() {
        every { query.candidateIds(community) } returns listOf(own)
        every { query.candidateIds(null) } returns listOf(global)

        pool.candidates(community) shouldContainExactly listOf(own)
    }

    @Test
    fun `the global pool is only the fallback`() {
        every { query.candidateIds(community) } returns emptyList()
        every { query.candidateIds(null) } returns listOf(global)

        pool.candidates(community) shouldContainExactly listOf(global)
    }

    @Test
    fun `the grid follows the shown size`() {
        every { query.displaySize(own) } returns ImageSize(width = 3000, height = 4000)
        every { query.displaySize(global) } returns null

        pool.gridOf(own) shouldBe DedusterGrid.PORTRAIT
        pool.gridOf(global).shouldBeNull()
    }
}
```

`DedusterImagesTest.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO

class DedusterImagesTest {

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

    private fun decoded(bytes: ByteArray) = ImageIO.read(ByteArrayInputStream(bytes))

    @Test
    fun `a wide photo is cropped in the middle to the grid's ratio`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 2400, height = 600), grid = DedusterGrid.LANDSCAPE, longEdge = 1600, quality = 0.82f),
        )

        // 600 high → 800 wide at 4:3, taken from the middle third: green, nothing of red or blue.
        out.width shouldBe 800
        out.height shouldBe 600
        val centre = Color(out.getRGB(400, 300))
        (centre.green > centre.red && centre.green > centre.blue) shouldBe true
        val left = Color(out.getRGB(5, 300))
        (left.green > left.red) shouldBe true
    }

    @Test
    fun `a large photo is scaled to the long edge`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 3000, height = 4000), grid = DedusterGrid.PORTRAIT, longEdge = 1600, quality = 0.82f),
        )

        out.width shouldBe 1200
        out.height shouldBe 1600
    }

    @Test
    fun `a small photo is never blown up`() {
        val out = decoded(
            DedusterImages.render(source = bands(width = 300, height = 300), grid = DedusterGrid.SQUARE, longEdge = 1600, quality = 0.82f),
        )

        out.width shouldBe 300
        out.height shouldBe 300
    }
}
```

Run: `cd core && ./mvnw test -Dtest='DedusterPoolTest,DedusterImagesTest'`
Expected: Kompilierfehler.

- [ ] **Step 4: Pool, Properties und Bild implementieren**

`DedusterPool.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.util.UUID

/** The game's view of the image pool. The precedence lives here, not in the pool: the pool knows no games. */
@Component
class DedusterPool(private val pool: ImagePoolQuery) {

    /** The community's own images; the global ones only when it has none. */
    fun candidates(communityId: UUID): List<UUID> =
        pool.candidateIds(communityId).ifEmpty { pool.candidateIds(null) }

    /** `null` when the image vanished between listing and measuring. */
    fun gridOf(imageId: UUID): DedusterGrid? =
        pool.displaySize(imageId)?.let { DedusterGrid.of(width = it.width, height = it.height) }
}
```

`internal/DedusterProperties.kt`:

```kotlin
package org.unividuell.countdown.core.deduster.internal

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * The frozen play image: ~300–500 KB a round at these values, kept for good — a round must not
 * change when its pool image does.
 */
@ConfigurationProperties(prefix = "deduster")
data class DedusterProperties(
    val playImageEdge: Int = 1600,
    val playImageQuality: Double = 0.82,
)
```

`internal/DedusterConfiguration.kt`:

```kotlin
package org.unividuell.countdown.core.deduster.internal

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration
@EnableConfigurationProperties(DedusterProperties::class)
class DedusterConfiguration
```

`application.yaml`, nach dem Block `imagepool:`:

```yaml
deduster:
  # Long edge of a round's frozen photo, and its JPEG quality — ~300–500 KB a round, kept for good.
  play-image-edge: 1600
  play-image-quality: 0.82
```

`DedusterImages.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.unividuell.countdown.core.deduster.internal.DedusterProperties
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.roundToInt

/** A round's photo: cropped to its grid, scaled to the play size, frozen as JPEG. */
@Component
class DedusterImages(
    private val pool: ImagePoolQuery,
    private val properties: DedusterProperties,
) {
    /** `null` when the pool image is gone. */
    fun playImage(imageId: UUID, grid: DedusterGrid): ByteArray? =
        pool.displayed(id = imageId, minShortEdge = properties.playImageEdge)?.let {
            render(
                source = it, grid = grid,
                longEdge = properties.playImageEdge, quality = properties.playImageQuality.toFloat(),
            )
        }

    companion object {
        /** Centre crop to [grid]'s ratio, then down (never up) to [longEdge], as a JPEG at [quality]. */
        fun render(source: BufferedImage, grid: DedusterGrid, longEdge: Int, quality: Float): ByteArray {
            val wide = source.width.toLong() * grid.ratioHeight > source.height.toLong() * grid.ratioWidth
            val cropWidth = if (wide) source.height * grid.ratioWidth / grid.ratioHeight else source.width
            val cropHeight = if (wide) source.height else source.width * grid.ratioHeight / grid.ratioWidth
            val scale = minOf(a = 1.0, b = longEdge.toDouble() / max(a = cropWidth, b = cropHeight))
            val width = max(a = 1, b = (cropWidth * scale).roundToInt())
            val height = max(a = 1, b = (cropHeight * scale).roundToInt())

            val target = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
            val graphics = target.createGraphics()
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
                graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
                val left = (source.width - cropWidth) / 2
                val top = (source.height - cropHeight) / 2
                graphics.drawImage(source, 0, 0, width, height, left, top, left + cropWidth, top + cropHeight, null)
            } finally {
                graphics.dispose()
            }
            return jpeg(image = target, quality = quality)
        }

        private fun jpeg(image: BufferedImage, quality: Float): ByteArray {
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
    }
}
```

Run: `cd core && ./mvnw test -Dtest='DedusterPoolTest,DedusterImagesTest'`
Expected: PASS.

- [ ] **Step 5: Failing test — die Tabelle**

`RoundImageStoreTest.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

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
class RoundImageStoreTest(@Autowired val store: RoundImageStore) {

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
        val gone = UUID.randomUUID(); val kept = UUID.randomUUID()
        listOf(gone, kept).forEach { store.store(roundGameId = it, mediaType = "image/jpeg", bytes = byteArrayOf(0)) }

        store.release(listOf(gone)) shouldBe 1
        store.find(gone).shouldBeNull()
        store.find(kept).shouldNotBeNull()
    }
}
```

Run: `cd core && ./mvnw test -Dtest=RoundImageStoreTest`
Expected: Kompilierfehler.

- [ ] **Step 6: Migration, Entität, Repository, Store**

`db/migration/deduster/V1__create_round_images.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS deduster;

CREATE TABLE deduster.round_images (
    -- Soft reference into game.round_games, deliberately no foreign key — the same reason as
    -- songsnippet.round_audio: the code arrow points game -> deduster, so this schema migrates
    -- first, and a cross-schema FK against that arrow cannot be created on a fresh database.
    round_game_id UUID        PRIMARY KEY,
    media_type    TEXT        NOT NULL,
    bytes         BYTEA       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`internal/RoundImage.kt`:

```kotlin
package org.unividuell.countdown.core.deduster.internal

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

/** Plain class: ByteArray equality is identity. Written only through the repository's insert. */
@Table(schema = "deduster", name = "round_images")
class RoundImage(
    @Id
    val roundGameId: UUID,
    val mediaType: String,
    val bytes: ByteArray,
    val createdAt: Instant? = null,
)

/** Two columns, no id: see `songsnippet`'s and `imagepool`'s byte projections. */
class RoundImageBytes(val mediaType: String, val bytes: ByteArray)
```

`internal/RoundImageRepository.kt`:

```kotlin
package org.unividuell.countdown.core.deduster.internal

import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface RoundImageRepository : CrudRepository<RoundImage, UUID> {

    /** First writer wins, the loser is a no-op — the materialised hook may run twice on a race. */
    @Modifying
    @Query(
        """
        INSERT INTO deduster.round_images (round_game_id, media_type, bytes)
        VALUES (:roundGameId, :mediaType, :bytes)
        ON CONFLICT (round_game_id) DO NOTHING
        """,
    )
    fun insertIfAbsent(roundGameId: UUID, mediaType: String, bytes: ByteArray): Int

    @Query("SELECT media_type, bytes FROM deduster.round_images WHERE round_game_id = :roundGameId")
    fun findBytes(roundGameId: UUID): RoundImageBytes?

    @Modifying
    @Query("DELETE FROM deduster.round_images WHERE round_game_id IN (:roundGameIds)")
    fun deleteForRounds(roundGameIds: Collection<UUID>): Int
}
```

`RoundImageStore.kt`:

```kotlin
package org.unividuell.countdown.core.deduster

import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.unividuell.countdown.core.deduster.internal.RoundImageRepository
import java.util.UUID

/** A round's frozen photo. Plain class: ByteArray equality is identity. */
class StoredImage(val mediaType: String, val bytes: ByteArray)

/**
 * Written once at announcement, read by every viewer, kept as long as the round is shown: the
 * history renders past rounds, and an Entstauber without its photo is an empty grid.
 */
@Component
class RoundImageStore(private val repository: RoundImageRepository) {

    @Transactional
    fun store(roundGameId: UUID, mediaType: String, bytes: ByteArray) {
        repository.insertIfAbsent(roundGameId = roundGameId, mediaType = mediaType, bytes = bytes)
    }

    @Transactional(readOnly = true)
    fun find(roundGameId: UUID): StoredImage? =
        repository.findBytes(roundGameId)?.let { StoredImage(mediaType = it.mediaType, bytes = it.bytes) }

    @Transactional
    fun release(roundGameIds: List<UUID>): Int = repository.deleteForRounds(roundGameIds)
}
```

- [ ] **Step 7: Tests und Boot**

Run: `cd core && ./mvnw test`
Expected: PASS, inklusive `ModularityTests` (`deduster → imagepool`, sonst nichts).

`configuration.md` verlangt nach einer `application.yaml`-Änderung einen echten Start: die Test-`application.yaml` **ersetzt** die Hauptdatei, die Suite bindet `deduster.*` also nie (die Tests laufen auf den Vorgaben der Properties-Klasse).

Run: `cd core && ./mvnw spring-boot:run` im Hintergrund starten (Harness-`run_in_background`, nicht `&`), im Log auf `Started CoreApplicationKt` warten, dann beenden.
Expected: Start ohne Binding-Fehler für `deduster.*`.

- [ ] **Step 8: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Add the deduster module: grid, tempo, photo, store

Entstauber's own knowledge, without the game contract: which grid a
photo's orientation gets, the tempo distribution of the original's
rounds, the centre crop to the grid's ratio, and the table that keeps
each round's frozen photo. The community's own images win over the
global pool; that precedence is the game's rule, not the pool's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 7: Der Adapter `DedusterGameType`

**Files:**
- Create: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/DedusterGameType.kt`
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/DedusterGameTypeTest.kt`
- Modify: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabServiceTest.kt`

**Interfaces:**
- Consumes: `DedusterPool`, `DedusterImages`, `RoundImageStore`, `DedusterGrid`, `DedusterTicks` (Task 6); `GameRandom.scene` (1); `RoundContext.communityId`, `isAvailable` (2); `scoresOnDuration` (3); `SCENE_ASSET_KEY` (4).
- Produces (Paket `org.unividuell.countdown.core.game.internal`):
  - `data class DedusterParams(val imageId: UUID, val cols: Int, val rows: Int, val intervalMs: Int, val order: List<Int>)`
  - `data class DedusterScene(val cols: Int, val rows: Int, val intervalMs: Int) : GameScene` — JSON `{"cols":6,"rows":8,"intervalMs":1300}`
  - `data class DedusterPayload(val cols: Int, val rows: Int, val intervalMs: Int, val order: List<Int>) : GamePayload`
  - `enum class DedusterEnd { COMPLETE, TOO_LATE, WRONG_TILE }`
  - `data class DedusterGuess(val reactionsMs: List<Int>, val endedBy: DedusterEnd, val wrongTileIndex: Int?, val restarted: Boolean)` — die gespeicherte Form, JSON z. B. `{"reactionsMs":[412,388],"endedBy":"WRONG_TILE","wrongTileIndex":17,"restarted":false}`
  - `data class DedusterOutcome(val tilesCleared: Int, val endedBy: DedusterEnd, val wrongTileIndex: Int?, val averageReactionMs: Double?, val implausible: Boolean, val restarted: Boolean) : GameOutcome`
  - Spiel-Id `deduster`, Anzeigename `Entstauber`.

- [ ] **Step 1: Failing tests — Ziehung, Bühne, Payload**

`DedusterGameTypeTest.kt`:

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.assertions.throwables.shouldThrow
import io.kotest.matchers.collections.shouldBeIn
import io.kotest.matchers.collections.shouldContainExactly
import io.kotest.matchers.maps.shouldBeEmpty
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.nulls.shouldNotBeNull
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterImages
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.deduster.DedusterTicks
import org.unividuell.countdown.core.deduster.RoundImageStore
import org.unividuell.countdown.core.deduster.StoredImage
import org.unividuell.countdown.core.game.internal.DedusterEnd
import org.unividuell.countdown.core.game.internal.DedusterGameType
import org.unividuell.countdown.core.game.internal.DedusterOutcome
import org.unividuell.countdown.core.game.internal.DedusterParams
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class DedusterGameTypeTest {

    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val imageA = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val imageB = UUID.fromString("0190f1b2-0000-7000-8000-0000000000b1")
    private val roundGameId = UUID.fromString("0190f1b2-0000-7000-8000-0000000000f1")

    private val mapper = JsonMapper.builder().build()
    private val pool = mockk<DedusterPool> {
        every { candidates(community) } returns listOf(imageA, imageB)
        every { gridOf(any()) } returns DedusterGrid.PORTRAIT
    }
    private val images = mockk<DedusterImages>()
    private val store = mockk<RoundImageStore>(relaxed = true)
    private val game = DedusterGameType(pool = pool, images = images, store = store, mapper = mapper)

    private fun random(solution: Int = 1, presentation: Int = 2, scene: Int = 3) = GameRandom(
        solution = SeededRandom.fromSeed(solution),
        presentation = SeededRandom.fromSeed(presentation),
        scene = SeededRandom.fromSeed(scene),
    )

    private fun context(previous: List<DedusterParams> = emptyList(), phase: Phase = Phase.ONE) = RoundContext(
        communityId = community,
        roundNumber = 12,
        phase = phase,
        previousParams = previous.map { mapper.valueToTree(it) },
    )

    private fun draw(random: GameRandom = random(), context: RoundContext = context()) =
        game.draw(random = random, context = context)

    private fun fields(value: Any?) = mapper.readTree(mapper.writeValueAsString(value)).propertyNames().toSet()

    @Test
    fun `it is registered under a stable id and a German display name`() {
        game.id shouldBe "deduster"
        game.displayName shouldBe "Entstauber"
    }

    @Test
    fun `a drawn round lays out the photo's grid and orders every tile once`() {
        val params = draw()

        params.cols shouldBe 6
        params.rows shouldBe 8
        params.order.sorted() shouldContainExactly (0 until 48).toList()
        params.intervalMs shouldBeIn DedusterTicks.WEIGHTS.keys
        params.imageId shouldBeIn listOf(imageA, imageB)
    }

    @Test
    fun `an image this edition already had is not drawn again`() {
        val earlier = draw().copy(imageId = imageA)

        repeat(20) { seed ->
            draw(random = random(scene = seed), context = context(previous = listOf(earlier))).imageId shouldBe imageB
        }
    }

    @Test
    fun `a pool this edition has used up is drawn from in full again`() {
        val used = listOf(draw().copy(imageId = imageA), draw().copy(imageId = imageB))

        draw(context = context(previous = used)).imageId shouldBeIn listOf(imageA, imageB)
    }

    /** Entstauber keeps no secret: the solution stream must stay untouched, and is pinned so. */
    @Test
    fun `the solution seed changes nothing`() {
        draw(random = random(solution = 1)) shouldBe draw(random = random(solution = 99))
    }

    /** Image and tempo are out before the reveal, so they must not share a stream with the order. */
    @Test
    fun `image and tempo follow the scene seed, the order follows the presentation seed`() {
        val a = draw(random = random(presentation = 2, scene = 3))
        val b = draw(random = random(presentation = 77, scene = 3))
        val c = draw(random = random(presentation = 2, scene = 55))

        b.imageId shouldBe a.imageId
        b.intervalMs shouldBe a.intervalMs
        b.order shouldNotBe a.order
        c.order shouldBe a.order
    }

    @Test
    fun `the scene carries exactly the layout and the tempo`() {
        fields(game.scene(draw())) shouldBe setOf("cols", "rows", "intervalMs")
    }

    @Test
    fun `the payload carries exactly what the run needs, and no image id`() {
        fields(game.present(draw())) shouldBe setOf("cols", "rows", "intervalMs", "order")
    }

    @Test
    fun `there is no solution exit - the photo under the dust is the reward`() {
        game.solution(draw()).shouldBeNull()
    }

    @Test
    fun `it is revealed once and never scored on the duration`() {
        for (phase in Phase.entries) {
            val params = draw(context = context(phase = phase))
            game.requiresReveal(params) shouldBe true
            game.scoresOnDuration(params) shouldBe false
        }
    }

    @Test
    fun `without any image it cannot draw`() {
        every { pool.candidates(community) } returns emptyList()

        game.isAvailable(context()) shouldBe false
    }

    @Test
    fun `the photo is the scene asset, frozen once`() {
        val params = draw()
        every { images.playImage(imageId = params.imageId, grid = DedusterGrid.PORTRAIT) } returns byteArrayOf(7)
        every { store.find(roundGameId) } returns null

        game.produceAssets(params)[SCENE_ASSET_KEY].shouldNotBeNull().mediaType shouldBe "image/jpeg"
        game.materialised(params = params, roundGameId = roundGameId)

        verify(exactly = 1) { store.store(roundGameId = roundGameId, mediaType = "image/jpeg", bytes = byteArrayOf(7)) }
    }

    @Test
    fun `the race's second caller does not render again`() {
        every { store.find(roundGameId) } returns StoredImage(mediaType = "image/jpeg", bytes = byteArrayOf(1))

        game.materialised(params = draw(), roundGameId = roundGameId)

        verify(exactly = 0) { images.playImage(imageId = any(), grid = any()) }
    }

    @Test
    fun `a vanished pool image yields no asset rather than a broken round`() {
        every { images.playImage(imageId = any(), grid = any()) } returns null

        game.produceAssets(draw()).shouldBeEmpty()
    }

    @Test
    fun `only the scene key is served`() {
        every { store.find(roundGameId) } returns StoredImage(mediaType = "image/jpeg", bytes = byteArrayOf(1))

        game.asset(params = draw(), roundGameId = roundGameId, key = SCENE_ASSET_KEY).shouldNotBeNull()
        game.asset(params = draw(), roundGameId = roundGameId, key = 0).shouldBeNull()
    }

    @Test
    fun `the history keeps the photo, archiving drops it`() {
        game.releaseStageAssets(listOf(roundGameId))
        verify(exactly = 0) { store.release(any()) }

        game.releaseAssets(listOf(roundGameId))
        verify(exactly = 1) { store.release(listOf(roundGameId)) }
    }
}
```

Run: `cd core && ./mvnw test -Dtest=DedusterGameTypeTest`
Expected: Kompilierfehler (`DedusterGameType` unbekannt).

- [ ] **Step 2: Failing tests — Urteil**

In derselben Datei anhängen. Die Läufe werden aus der gezogenen Reihenfolge gebaut, damit `wrongTileIndex` gegen die echte richtige Kachel geprüft wird:

```kotlin
    private fun run(
        reactions: List<Int>,
        endedBy: String,
        wrongTileIndex: Int? = null,
        restarted: Boolean? = null,
        extra: String = "",
    ) = mapper.readTree(
        buildString {
            append("""{"reactionsMs":${reactions},"endedBy":"$endedBy"""")
            if (wrongTileIndex != null) append(""","wrongTileIndex":$wrongTileIndex""")
            if (restarted != null) append(""","restarted":$restarted""")
            append(extra)
            append("}")
        },
    )

    private fun fixed(intervalMs: Int = 1300) = draw().copy(intervalMs = intervalMs)

    @Test
    fun `a complete run qualifies and is ranked on its average reaction`() {
        val params = fixed()
        val judgement = game.judge(params = params, guess = run(reactions = List(48) { 300 + it }, endedBy = "COMPLETE"))

        judgement.qualifies shouldBe true
        judgement.deviation shouldBe 323.5
        val outcome = judgement.outcome as DedusterOutcome
        outcome.tilesCleared shouldBe 48
        outcome.averageReactionMs shouldBe 323.5
        outcome.implausible shouldBe false
    }

    @Test
    fun `a run that ended early does not qualify`() {
        val judgement = game.judge(params = fixed(), guess = run(reactions = listOf(400, 410), endedBy = "TOO_LATE"))

        judgement.qualifies shouldBe false
        (judgement.outcome as DedusterOutcome).tilesCleared shouldBe 2
    }

    /** Zero would read as perfect, and NaN has no business in a column `==` runs over. */
    @Test
    fun `a run without a single hit is as far off as the tempo, and has no average`() {
        val judgement = game.judge(params = fixed(intervalMs = 900), guess = run(reactions = emptyList(), endedBy = "TOO_LATE"))

        judgement.deviation shouldBe 900.0
        (judgement.outcome as DedusterOutcome).averageReactionMs.shouldBeNull()
    }

    @Test
    fun `an unusable run is a client error and costs nothing`() {
        val params = fixed()
        listOf(
            """{"reactionsMs":"fast","endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[1.5],"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[-1],"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":${List(49) { 300 }},"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[300],"endedBy":"COMPLETE"}""",
            """{"reactionsMs":${List(48) { 300 }},"endedBy":"TOO_LATE"}""",
            """{"reactionsMs":[300],"endedBy":"BORED"}""",
            """{"reactionsMs":[300],"endedBy":"TOO_LATE","restarted":"yes"}""",
        ).forEach { body ->
            shouldThrow<InvalidGuessException> { game.judge(params = params, guess = mapper.readTree(body)) }
        }
    }

    @Test
    fun `an unusable wrong tile is dropped, not held against the run`() {
        val params = fixed()
        val correctTile = params.order[2]
        listOf(null, -1, 48, correctTile).forEach { wrong ->
            val outcome = game.judge(
                params = params,
                guess = run(reactions = listOf(400, 410), endedBy = "WRONG_TILE", wrongTileIndex = wrong),
            ).outcome as DedusterOutcome

            outcome.endedBy shouldBe DedusterEnd.WRONG_TILE
            outcome.wrongTileIndex.shouldBeNull()
        }
    }

    @Test
    fun `a usable wrong tile is kept for the evaluation`() {
        val params = fixed()
        val wrong = params.order[30]

        (game.judge(params = params, guess = run(reactions = listOf(400, 410), endedBy = "WRONG_TILE", wrongTileIndex = wrong))
            .outcome as DedusterOutcome).wrongTileIndex shouldBe wrong
    }

    /** A run cannot be repeated, so a false alarm must never cost it: marked, stored, scored. */
    @Test
    fun `a reaction faster than a human or slower than the beat marks the run`() {
        val params = fixed(intervalMs = 1000)

        (game.judge(params = params, guess = run(reactions = listOf(119, 400), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe true
        (game.judge(params = params, guess = run(reactions = listOf(400, 1001), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe true
        (game.judge(params = params, guess = run(reactions = listOf(120, 1000), endedBy = "TOO_LATE")).outcome as DedusterOutcome)
            .implausible shouldBe false
    }

    @Test
    fun `a restarted run says so`() {
        (game.judge(params = fixed(), guess = run(reactions = listOf(400), endedBy = "TOO_LATE", restarted = true))
            .outcome as DedusterOutcome).restarted shouldBe true
    }

    /** The column is republished to every player who has guessed: only what was checked goes in. */
    @Test
    fun `the stored guess is rebuilt from the checked fields alone`() {
        val stored = game.judge(
            params = fixed(),
            guess = run(reactions = listOf(400), endedBy = "TOO_LATE", extra = ""","order":[1,2,3]"""),
        ).guess.shouldNotBeNull()

        stored.propertyNames().toSet() shouldBe setOf("reactionsMs", "endedBy", "wrongTileIndex", "restarted")
    }
```

Run: `cd core && ./mvnw test -Dtest=DedusterGameTypeTest`
Expected: Kompilierfehler wie in Step 1.

- [ ] **Step 3: Adapter implementieren**

`DedusterGameType.kt`:

```kotlin
package org.unividuell.countdown.core.game.internal

import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.stereotype.Component
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterImages
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.deduster.DedusterTicks
import org.unividuell.countdown.core.deduster.RoundImageStore
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameScene
import org.unividuell.countdown.core.game.GameType
import org.unividuell.countdown.core.game.InvalidGuessException
import org.unividuell.countdown.core.game.Judgement
import org.unividuell.countdown.core.game.RoundAsset
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.SCENE_ASSET_KEY
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * The frozen round. [imageId] is a soft reference into the pool and, once the round is announced,
 * only provenance — the round keeps its own copy of the photo.
 */
data class DedusterParams(
    val imageId: UUID,
    val cols: Int,
    val rows: Int,
    val intervalMs: Int,
    /** The order tiles are dusted off in: a permutation of `0 until cols * rows`. */
    val order: List<Int>,
)

/** What lies under the cover: the dusted grid, and the tempo the hold counts in at. */
data class DedusterScene(val cols: Int, val rows: Int, val intervalMs: Int) : GameScene

/**
 * What the run needs, from the reveal on. No `imageId`: the photo comes through the round's asset
 * endpoint, and a pool id here would be a second, ungated address for the same picture.
 */
data class DedusterPayload(val cols: Int, val rows: Int, val intervalMs: Int, val order: List<Int>) : GamePayload

enum class DedusterEnd { COMPLETE, TOO_LATE, WRONG_TILE }

/** The guess as stored — rebuilt from the checked fields, never the client's node. */
data class DedusterGuess(
    /** One reaction per tile hit in time, in tick order. Its size IS how far the run got. */
    val reactionsMs: List<Int>,
    val endedBy: DedusterEnd,
    /** Only for [DedusterEnd.WRONG_TILE], and only when usable: for the evaluation, never the verdict. */
    val wrongTileIndex: Int?,
    /** The run began after a reload. */
    val restarted: Boolean,
)

data class DedusterOutcome(
    val tilesCleared: Int,
    val endedBy: DedusterEnd,
    val wrongTileIndex: Int?,
    /** `null` for a run without a single hit, so the table can say „—“. */
    val averageReactionMs: Double?,
    /** A reaction below [MIN_HUMAN_MS] or above the beat. Marked, still stored and scored. */
    val implausible: Boolean,
    val restarted: Boolean,
) : GameOutcome

/** Below this, a tap was already on its way before the tile fell. */
private const val MIN_HUMAN_MS = 120

/**
 * Entstauber as an announceable game; `deduster` knows nothing about it.
 *
 * The draw order is part of the round's identity: image, then tempo from the scene stream — both
 * reach the client before the reveal — then the tile order from the presentation stream, which
 * only arrives with the payload. The solution stream stays untouched on purpose: there is nothing
 * to hide here that is not on the screen anyway. Do not "repair" that.
 */
@Component
class DedusterGameType(
    private val pool: DedusterPool,
    private val images: DedusterImages,
    private val store: RoundImageStore,
    private val mapper: ObjectMapper,
) : GameType<DedusterParams> {

    private val logger = KotlinLogging.logger {}

    override val id = "deduster"
    override val displayName = "Entstauber"
    override val paramsType = DedusterParams::class.java

    override fun isAvailable(context: RoundContext) = pool.candidates(context.communityId).isNotEmpty()

    override fun draw(random: GameRandom, context: RoundContext): DedusterParams {
        val candidates = pool.candidates(context.communityId)
        val used = context.previousParams.map { mapper.treeToValue(it, DedusterParams::class.java).imageId }.toSet()
        // A pool of three images must not starve: once each has had its round, all count again.
        val imageId = random.scene.pick(candidates.filterNot { it in used }.ifEmpty { candidates })
        val grid = checkNotNull(pool.gridOf(imageId)) { "image $imageId vanished between listing and measuring" }
        val intervalMs = DedusterTicks.intervalMs(random.scene)
        return DedusterParams(
            imageId = imageId,
            cols = grid.cols,
            rows = grid.rows,
            intervalMs = intervalMs,
            order = random.presentation.shuffled((0 until grid.tiles).toList()),
        )
    }

    override fun scene(params: DedusterParams) =
        DedusterScene(cols = params.cols, rows = params.rows, intervalMs = params.intervalMs)

    override fun present(params: DedusterParams) = DedusterPayload(
        cols = params.cols, rows = params.rows, intervalMs = params.intervalMs, order = params.order,
    )

    override fun requiresReveal(params: DedusterParams) = true

    /** The reveal-to-guess span is idle time plus a fixed number of beats — the same for every finisher. */
    override fun scoresOnDuration(params: DedusterParams) = false

    override fun judge(params: DedusterParams, guess: JsonNode): Judgement {
        val tiles = params.cols * params.rows
        val reactions = reactionsOf(node = guess.get("reactionsMs"), tiles = tiles)
        val endedBy = endOf(guess.get("endedBy"))
        if (endedBy == DedusterEnd.COMPLETE && reactions.size != tiles) {
            throw InvalidGuessException("a complete run has $tiles reactions, got ${reactions.size}")
        }
        if (endedBy != DedusterEnd.COMPLETE && reactions.size == tiles) {
            throw InvalidGuessException("a run with every tile hit is complete, not $endedBy")
        }
        val restarted = when (val node = guess.get("restarted")) {
            null -> false
            else -> if (node.isBoolean) node.asBoolean() else throw InvalidGuessException("restarted must be a boolean")
        }
        val wrongTileIndex = wrongTileOf(params = params, endedBy = endedBy, level = reactions.size, node = guess.get("wrongTileIndex"))

        val implausible = reactions.any { it < MIN_HUMAN_MS || it > params.intervalMs }
        if (implausible) {
            // The row carries the mark and the player; this line is what makes it findable in the log.
            logger.warn {
                "deduster run on image ${params.imageId} marked implausible: a reaction outside " +
                    "$MIN_HUMAN_MS..${params.intervalMs} ms"
            }
        }
        val average = reactions.takeIf { it.isNotEmpty() }?.average()

        return Judgement(
            qualifies = endedBy == DedusterEnd.COMPLETE,
            // The worst real value, not a sentinel: zero would read as perfect.
            deviation = average ?: params.intervalMs.toDouble(),
            guess = mapper.valueToTree(
                DedusterGuess(
                    reactionsMs = reactions, endedBy = endedBy,
                    wrongTileIndex = wrongTileIndex, restarted = restarted,
                ),
            ),
            outcome = DedusterOutcome(
                tilesCleared = reactions.size,
                endedBy = endedBy,
                wrongTileIndex = wrongTileIndex,
                averageReactionMs = average,
                implausible = implausible,
                restarted = restarted,
            ),
        )
    }

    override fun produceAssets(params: DedusterParams): Map<Int, RoundAsset> {
        val grid = DedusterGrid.ofLayout(cols = params.cols, rows = params.rows)
        val bytes = images.playImage(imageId = params.imageId, grid = grid) ?: run {
            logger.warn { "deduster image ${params.imageId} is gone; the round has no photo" }
            return emptyMap()
        }
        return mapOf(SCENE_ASSET_KEY to RoundAsset(mediaType = "image/jpeg", bytes = bytes))
    }

    /** Idempotent: the race's second caller finds the row and does not render a second time. */
    override fun materialised(params: DedusterParams, roundGameId: UUID) {
        if (store.find(roundGameId) != null) return
        val asset = produceAssets(params)[SCENE_ASSET_KEY] ?: return
        store.store(roundGameId = roundGameId, mediaType = asset.mediaType, bytes = asset.bytes)
    }

    override fun asset(params: DedusterParams, roundGameId: UUID, key: Int): RoundAsset? =
        if (key != SCENE_ASSET_KEY) null
        else store.find(roundGameId)?.let { RoundAsset(mediaType = it.mediaType, bytes = it.bytes) }

    // releaseStageAssets stays the no-op default: the history shows past rounds, photo included.

    override fun releaseAssets(roundGameIds: List<UUID>) {
        store.release(roundGameIds)
    }

    private fun reactionsOf(node: JsonNode?, tiles: Int): List<Int> {
        if (node == null || !node.isArray) throw InvalidGuessException("reactionsMs must be an array")
        if (node.size() > tiles) throw InvalidGuessException("more reactions than the grid's $tiles tiles")
        return node.map { entry ->
            // canConvertToInt, not just isIntegralNumber: see FindPatternGameType.judge.
            if (!entry.isIntegralNumber || !entry.canConvertToInt() || entry.asInt() < 0) {
                throw InvalidGuessException("every reaction must be a non-negative integer of milliseconds")
            }
            entry.asInt()
        }
    }

    private fun endOf(node: JsonNode?): DedusterEnd {
        val name = node?.takeIf { it.isString }?.asString()
        return DedusterEnd.entries.firstOrNull { it.name == name }
            ?: throw InvalidGuessException("endedBy must be one of ${DedusterEnd.entries}")
    }

    /**
     * Decoration, not verdict: a missing, out-of-range or — of all tiles — the right one is dropped
     * with a warning, and the evaluation draws no wrong tile for the run.
     */
    private fun wrongTileOf(params: DedusterParams, endedBy: DedusterEnd, level: Int, node: JsonNode?): Int? {
        if (endedBy != DedusterEnd.WRONG_TILE) return null
        val index = node?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.asInt()
        if (index == null || index !in params.order.indices || index == params.order[level]) {
            logger.warn { "deduster run on image ${params.imageId}: unusable wrongTileIndex $node dropped" }
            return null
        }
        return index
    }
}
```

`index !in params.order.indices` prüft den Kachelbereich `0 until cols * rows` (die Reihenfolge ist eine Permutation genau dieses Bereichs). Jackson 3 heißt der Text-Test `isString`/`asString()`; meldet der Compiler sie nicht, sind es in dieser Version `isTextual`/`asText()` — dann diese nehmen.

Run: `cd core && ./mvnw test -Dtest=DedusterGameTypeTest`
Expected: PASS.

- [ ] **Step 4: `LabServiceTest` — der echte Katalog kennt jetzt Entstauber**

`LabServiceTest` läuft gegen den echten Katalog und iteriert ihn. Ohne Bilder kann Entstauber dort nicht ziehen, und ohne Aufdecken nicht getippt werden. Drei Änderungen:

1. Den Pool mocken, damit Entstauber ziehen kann:

```kotlin
    // Entstauber draws from the image pool; one fake image keeps it drawable and off the database.
    @MockkBean lateinit var pool: ImagePoolQuery
```

In `aCommunityWithTwoMembers()` vor dem `return`:

```kotlin
        every { pool.candidateIds(any()) } returns listOf(LAB_IMAGE)
        every { pool.displaySize(LAB_IMAGE) } returns ImageSize(width = 400, height = 300)
        every { pool.displayed(id = LAB_IMAGE, minShortEdge = any()) } returns
            BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)
```

mit `private val LAB_IMAGE = UUID.fromString("0190f1b2-0000-7000-8000-00000000da7a")` als Feld der Klasse.

2. `aValidGuessFor` bekommt den Zweig `"deduster" -> mapper.readTree("""{"reactionsMs":[],"endedBy":"TOO_LATE"}""")`, und in der Schleife über `catalog.ids()` vor `service.guess(…)`:

```kotlin
            // A sealed game needs its one reveal on record before a guess counts; for the others it is a no-op.
            service.reveal(
                slug = community.slug, gameId = gameId, seed = 42, phase = Phase.ONE,
                userId = mine.other, isSuperAdmin = false,
            )
```

3. Zwei neue Tests:

```kotlin
    @Test
    fun `a game that cannot draw for this community is not there`() {
        val (community, mine) = aCommunityWithTwoMembers()
        every { pool.candidateIds(any()) } returns emptyList()

        shouldThrow<UnknownLabGameException> {
            service.open(
                slug = community.slug, gameId = "deduster", seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false,
            )
        }
    }

    @Test
    fun `the scene asset is there before the reveal`() {
        val (community, mine) = aCommunityWithTwoMembers()
        service.open(
            slug = community.slug, gameId = "deduster", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        ).revealed shouldBe false

        service.asset(
            slug = community.slug, gameId = "deduster", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false, key = SCENE_ASSET_KEY,
        ).mediaType shouldBe "image/jpeg"
    }
```

Imports: `org.unividuell.countdown.core.imagepool.ImagePoolQuery`, `org.unividuell.countdown.core.imagepool.ImageSize`, `org.unividuell.countdown.core.game.SCENE_ASSET_KEY`, `java.awt.image.BufferedImage`. Heißt das Feld in `LabRoundResponse` nicht `revealed`, den Namen aus `LabDtos.kt` nehmen.

- [ ] **Step 5: Alle Tests**

Run: `cd core && ./mvnw test`
Expected: PASS, inklusive `ModularityTests` (`game → deduster → imagepool`).

- [ ] **Step 6: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Add Entstauber as an announceable game

A photo from the pool under dust, one tile after another at the
round's tempo; whoever keeps up to the last tile qualifies, and phase
two ranks on the average reaction time. Image and tempo come from the
scene stream, the tile order from the presentation stream, and the
solution stream stays unused: nothing here is secret that is not on
the screen anyway.

An implausible reaction marks the run instead of rejecting it, since
a run cannot be repeated. The stored guess is rebuilt from the checked
fields, because every other player receives it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 8: Punkte wie im Original und der Weg durch `PlayService`

**Files:**
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/DedusterPointsParityTest.kt` (neu)
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/game/PlayServiceDedusterTest.kt` (neu)

**Interfaces:**
- Consumes: `DedusterGameType.judge` (Task 7), `pointsFor(award, verdicts)`, `PlayService.{asset, reveal, guess}`.

Reine Tests; kein Produktionscode ändert sich, außer ein Test deckt einen Fehler in Task 1–7 auf — dann dort beheben und im Commit sagen.

- [ ] **Step 1: Die Paritätstabelle**

Sie stellt `calculateDedusterPoints` (Phase eins: jeder Durchhalter) und `filterWorseDedusterGuesses` (Phase zwei: nur die kleinste ⌀-Reaktionszeit, Gleichstand behält beide) Zeile für Zeile nach — Läufe hinein, über das echte `judge` und das echte `pointsFor`, Punkte heraus.

```kotlin
package org.unividuell.countdown.core.game

import io.kotest.matchers.shouldBe
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.unividuell.countdown.core.deduster.DedusterGrid
import org.unividuell.countdown.core.deduster.DedusterPool
import org.unividuell.countdown.core.game.internal.DedusterGameType
import org.unividuell.countdown.core.rng.SeededRandom
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class DedusterPointsParityTest {

    private val mapper = JsonMapper.builder().build()
    private val community = UUID.fromString("0190f1b2-0000-7000-8000-00000000c0de")
    private val image = UUID.fromString("0190f1b2-0000-7000-8000-0000000000a1")
    private val game = DedusterGameType(
        pool = mockk<DedusterPool> {
            every { candidates(community) } returns listOf(image)
            every { gridOf(image) } returns DedusterGrid.LANDSCAPE
        },
        images = mockk(),
        store = mockk(),
        mapper = mapper,
    )
    private val params = game.draw(
        random = GameRandom(
            solution = SeededRandom.fromSeed(1),
            presentation = SeededRandom.fromSeed(2),
            scene = SeededRandom.fromSeed(3),
        ),
        context = RoundContext(communityId = community, roundNumber = 12, phase = Phase.ONE),
    ).copy(intervalMs = 1300)

    private val phaseOne = Award(rule = AwardRule.ALL_QUALIFYING, points = 1)
    private val phaseTwo = Award(rule = AwardRule.CLOSEST_ONLY, points = 7)

    private fun player(n: Int) = UUID.fromString("0190f1b2-0000-7000-8000-%012d".format(n))

    private fun complete(average: Int) = """{"reactionsMs":${List(48) { average }},"endedBy":"COMPLETE"}"""
    private fun tooLate(tiles: Int, average: Int) = """{"reactionsMs":${List(tiles) { average }},"endedBy":"TOO_LATE"}"""

    private fun pointsOf(award: Award, runs: List<String>): List<Int> {
        val verdicts = runs.mapIndexed { at, body ->
            val judgement = game.judge(params = params, guess = mapper.readTree(body))
            Verdict(id = player(at), qualifies = judgement.qualifies, deviation = judgement.deviation)
        }
        val points = pointsFor(award = award, verdicts = verdicts)
        return runs.indices.map { points.getValue(player(it)) }
    }

    /** Each row: the round's runs, the points phase one pays, the points phase two pays. */
    private val table: List<Triple<List<String>, List<Int>, List<Int>>> = listOf(
        // Finishers all score in phase one; the fastest finisher alone in phase two.
        Triple(listOf(complete(300), complete(350)), listOf(1, 1), listOf(7, 0)),
        // Fast but not to the end is worth nothing — `qualifies` is finishing, nothing else.
        Triple(listOf(tooLate(tiles = 20, average = 200), complete(400)), listOf(0, 1), listOf(0, 7)),
        // A tie to the millisecond keeps both, as the original's `best - avg < 0` did.
        Triple(listOf(complete(300), complete(300)), listOf(1, 1), listOf(7, 7)),
        // Nobody makes it: the round pays nothing, in both phases.
        Triple(listOf(tooLate(tiles = 3, average = 300), tooLate(tiles = 0, average = 0)), listOf(0, 0), listOf(0, 0)),
    )

    @Test
    fun `phase one pays every finisher, phase two only the fastest`() {
        for ((runs, one, two) in table) {
            pointsOf(award = phaseOne, runs = runs) shouldBe one
            pointsOf(award = phaseTwo, runs = runs) shouldBe two
        }
    }
}
```

Run: `cd core && ./mvnw test -Dtest=DedusterPointsParityTest`
Expected: PASS. (Scheitert eine Zeile, liegt der Fehler in `judge` — `qualifies` oder `deviation` — oder die Erwartung widerspricht der Spec; nicht die Tabelle anpassen, bis klar ist, welches.)

- [ ] **Step 2: Der Weg durch `PlayService`**

Gegen die echte Datenbank, mit dem echten Adapter und gemocktem Pool. Der Aufbau folgt `PlayServiceTimedTest` (Gemeinschaft, Mitglied, Runde per `store.announce`); `materialised` wird von Hand gerufen, weil `store.announce` den Haken nicht auslöst.

```kotlin
package org.unividuell.countdown.core.game

import com.ninjasquad.springmockk.MockkBean
import io.kotest.matchers.nulls.shouldBeNull
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
import org.unividuell.countdown.core.game.internal.DedusterParams
import org.unividuell.countdown.core.game.internal.PlayService
import org.unividuell.countdown.core.game.internal.RoundGameStore
import org.unividuell.countdown.core.game.internal.RoundPlayRepository
import org.unividuell.countdown.core.iam.User
import org.unividuell.countdown.core.iam.internal.UserRepository
import org.unividuell.countdown.core.imagepool.ImagePoolQuery
import org.unividuell.countdown.core.imagepool.ImageSize
import tools.jackson.databind.ObjectMapper
import java.awt.image.BufferedImage
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

@Import(TestcontainersConfiguration::class)
@SpringBootTest
@Transactional
class PlayServiceDedusterTest(
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

    private val image = UUID.fromString("0190f1b2-0000-7000-8000-00000000da7a")

    private fun aUser(login: String): UUID =
        requireNotNull(users.save(User(githubId = System.nanoTime(), githubLogin = login)).id)

    private fun aCommunity(): Pair<Community, UUID> {
        val owner = aUser("owner")
        val community = communities.create(creatorUserId = owner, rawName = "Entstauber Flow")
        communities.update(
            community = community, name = null, label = null,
            startsAt = Instant.parse("2099-01-01T10:00:00Z"), startsAtTimezone = "Europe/Berlin",
            phaseTwoStartRound = null, gamesFromRound = null, gamesUntilRound = null,
        )
        val player = aUser("player")
        members.save(
            CommunityMember(communityId = requireNotNull(community.id), userId = player, status = MemberStatus.ACTIVE),
        )
        return community to player
    }

    private fun roundNumberOf(community: Community): Int {
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        return engine.roundAt(
            now = clock.instant(), startsAt = requireNotNull(edition.startsAt), zone = ZoneId.of(edition.startsAtTimezone),
        ).number
    }

    /** One real Entstauber round, announced and materialised with its photo. */
    private fun announced(community: Community): Pair<Int, DedusterParams> {
        every { pool.candidateIds(any()) } returns listOf(image)
        every { pool.displaySize(image) } returns ImageSize(width = 400, height = 300)
        every { pool.displayed(id = image, minShortEdge = any()) } returns BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB)

        val handle = catalog.handle("deduster").shouldNotBeNull()
        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val number = roundNumberOf(community)
        val params = handle.draw(
            random = GameRandom.fromSeed(4711),
            context = RoundContext(communityId = requireNotNull(community.id), roundNumber = number, phase = Phase.ONE),
        )
        val round = store.announce(
            edition = edition, roundNumber = number, gameType = "deduster", params = params,
            award = Award(rule = AwardRule.CLOSEST_ONLY, points = 3), announcedAt = clock.instant(),
        )
        handle.materialised(params = params, roundGameId = requireNotNull(round.id))
        return number to mapper.treeToValue(params, DedusterParams::class.java)
    }

    @Test
    fun `the photo is there before the reveal, the order only after it`() {
        val (community, player) = aCommunity()
        val (number, _) = announced(community)

        play.asset(
            slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number, key = SCENE_ASSET_KEY,
        ).mediaType shouldBe "image/jpeg"

        val revealed = play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)
        mapper.valueToTree<tools.jackson.databind.JsonNode>(revealed.scene).propertyNames().toSet() shouldBe
            setOf("cols", "rows", "intervalMs")
        revealed.payload.shouldNotBeNull()
    }

    @Test
    fun `a finished run is stored with its average, and no duration is published`() {
        val (community, player) = aCommunity()
        val (number, params) = announced(community)
        play.reveal(slug = community.slug, userId = player, isSuperAdmin = false)

        val reactions = List(params.cols * params.rows) { 400 }
        val response = play.guess(
            slug = community.slug, userId = player, isSuperAdmin = false, roundNumber = number,
            guess = mapper.readTree("""{"reactionsMs":$reactions,"endedBy":"COMPLETE"}"""),
        )

        val edition = requireNotNull(editions.findActiveByCommunityId(requireNotNull(community.id)))
        val row = plays.findByRoundGameIdAndUserId(
            roundGameId = requireNotNull(store.find(edition = edition, roundNumber = number)?.id), userId = player,
        ).shouldNotBeNull()
        row.deviation shouldBe 400.0
        row.qualifies shouldBe true
        response.me.shouldNotBeNull().durationMs.shouldBeNull()
        response.game.shouldNotBeNull().scoresOnDuration shouldBe false
    }
}
```

Run: `cd core && ./mvnw test -Dtest=PlayServiceDedusterTest`
Expected: PASS.

- [ ] **Step 3: Alle Tests**

Run: `cd core && ./mvnw test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add core/src
git commit -F - <<'MSG'
Pin Entstauber's points and its way through a round

A parity table replays the original's two scoring functions through
the real judge and pointsFor: every finisher in phase one, only the
fastest average in phase two, ties keep both, nobody finishing pays
nobody. A round test checks that the photo is fetchable before the
reveal and that a finished run keeps its own average as the distance.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 9: `HoldButton.beatMs`, `RevealCover.timed` / `note`

**Files:**
- Modify: `webapp-vue/src/ui/HoldButton.vue`
- Modify: `webapp-vue/src/ui/RevealCover.vue`
- Test: `webapp-vue/src/ui/__tests__/HoldButton.spec.ts`
- Test: `webapp-vue/src/ui/__tests__/RevealCover.spec.ts`

**Interfaces:**
- Produces: `HoldButton` Prop `beatMs?: number` (Vorgabe `BEAT_MS`), wirksam nur mit `beats`; `RevealCover` Props `timed?: boolean` (Vorgabe `true`), `note?: string | null` (Vorgabe `null`), `beatMs?: number` (Vorgabe `BEAT_MS`, an `HoldButton` durchgereicht).

Musterung und Weltanschauung setzen keinen der neuen Props und merken nichts — die unveränderten bestehenden Tests sind der Beweis.

- [ ] **Step 1: Failing tests**

`HoldButton.spec.ts`, im `describe('with beats', …)`:

```ts
    it('counts in at the beat it is given', async () => {
      const w = mountButton({ beats: 3, beatMs: 600, label: 'START' })

      await w.get('[data-test="hold-button"]').trigger('pointerdown', { isPrimary: true })
      vi.advanceTimersByTime(700)
      await w.vm.$nextTick()
      expect(face(w).text()).toBe('2')

      vi.advanceTimersByTime(1000)
      expect(w.emitted('confirm')).toHaveLength(1)
    })
```

`RevealCover.spec.ts` — `mountCover` nimmt die neuen Props mit auf (`Partial<{ state; busy; timed: boolean; note: string | null; beatMs: number }>`), dazu:

```ts
  it('names a run, not a clock, for a game that is not timed', () => {
    const text = mountCover({ timed: false }).get('[data-test="reveal-cover-cost"]').text()

    expect(text).toBe('Der Lauf startet mit dem Aufdecken — und du hast nur einen Versuch.')
  })

  it('shows a note under the button when it has one, and none otherwise', () => {
    expect(mountCover({ note: 'Neu geladen — dein Lauf wird markiert.' }).get('[data-test="reveal-cover-note"]').text()).toBe(
      'Neu geladen — dein Lauf wird markiert.',
    )
    expect(mountCover().find('[data-test="reveal-cover-note"]').exists()).toBe(false)
  })

  it('counts in at the beat the game gives it', () => {
    expect(mountCover({ beatMs: 1300 }).getComponent(HoldButton).props('beatMs')).toBe(1300)
  })
```

Run: `cd webapp-vue && pnpm test -- src/ui/__tests__/HoldButton.spec.ts src/ui/__tests__/RevealCover.spec.ts`
Expected: FAIL (unbekannte Props, falscher Text).

- [ ] **Step 2: `HoldButton`**

Props ergänzen:

```ts
    /**
     * Turns the hold into a count-in of this many beats: the button reads [label] at rest and
     * the beat while held, and the hold lasts `beats × beatMs` — [holdMs] is ignored then.
     */
    beats?: number
    /** One beat of the count-in. Entstauber counts in at its round's tempo. */
    beatMs?: number
  }>(),
  { holdMs: DEFAULT_HOLD_MS, beatMs: BEAT_MS },
```

und die Dauer:

```ts
const { progress, holding, start, cancel } = useHoldProgress(
  counting ? (props.beats ?? 0) * props.beatMs : props.holdMs,
```

- [ ] **Step 3: `RevealCover`**

Props:

```ts
const props = withDefaults(
  defineProps<{
    state: SceneState
    /** The reveal is on its way — the card's `busy`, reaching the game as `disabled`. */
    busy: boolean
    /** Whether the reveal starts a scored clock. Entstauber's does not; it starts a run. */
    timed?: boolean
    /** One line under the button — Entstauber's after a reload. */
    note?: string | null
    /** The count-in's beat, handed to the button. */
    beatMs?: number
  }>(),
  { timed: true, note: null, beatMs: BEAT_MS },
)
```

(Import `BEAT_MS` aus `@/ui/useHoldProgress`.) Den Satz im Kopfkommentar „the clock starts at the reveal, and there is no second attempt“ ersetzen durch „there is no second attempt; whether a clock starts with it is the one thing the game says, through [timed]“.

Template, der Kostensatz:

```html
    <p data-test="reveal-cover-cost" class="max-w-xs text-sm text-neutral-800">
      <template v-if="props.timed">Deine Zeit läuft ab dem Aufdecken</template>
      <template v-else>Der Lauf startet mit dem Aufdecken</template>
      — und du hast nur <strong>einen</strong> Versuch.
    </p>
```

Prüfen, dass `text()` genau einen Leerraum vor dem Gedankenstrich ergibt (der bestehende Test vergleicht wörtlich); notfalls die Zeilen so umbrechen, dass kein doppeltes Leerzeichen entsteht.

Am `HoldButton`: `:beat-ms="props.beatMs"`. Nach dem `div` mit dem Knopf:

```html
    <p v-if="props.note" data-test="reveal-cover-note" class="max-w-xs text-sm text-neutral-700">
      {{ props.note }}
    </p>
```

- [ ] **Step 4: Prüfen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS — auch alle unveränderten Tests von Musterung, Weltanschauung und Farbausmalung.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src
git commit -F - <<'MSG'
Let the cover count in at a game's beat

Entstauber's count-in runs at the round's tempo, so the three held
beats are the pulse the tiles will fall in. Its reveal starts a run,
not a scored clock, so the cover names that instead; and after a
reload it says the run will be marked. Musterung and Weltanschauung
pass none of the new props and keep their behaviour.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 10: Typwächter und der Lauf — `types.ts`, `useDedusterRun.ts`

**Files:**
- Create: `webapp-vue/src/games/deduster/types.ts`
- Create: `webapp-vue/src/games/deduster/useDedusterRun.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/types.spec.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/useDedusterRun.spec.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `interface DedusterScene { cols: number; rows: number; intervalMs: number }`
  - `interface DedusterPayload extends DedusterScene { order: number[] }`
  - `type DedusterEnd = 'COMPLETE' | 'TOO_LATE' | 'WRONG_TILE'`
  - `interface DedusterGuessWire { reactionsMs: number[]; endedBy: DedusterEnd; wrongTileIndex: number | null; restarted: boolean }`
  - `interface DedusterOutcome { tilesCleared: number; endedBy: DedusterEnd; wrongTileIndex: number | null; averageReactionMs: number | null; implausible: boolean; restarted: boolean }`
  - `asDedusterScene(v: unknown): DedusterScene | null`, `asDedusterPayload(v: unknown): DedusterPayload | null`, `asDedusterGuess(v: unknown): DedusterGuessWire | null`, `asDedusterOutcome(v: unknown): DedusterOutcome | null`
- Produces (`useDedusterRun.ts`):
  - `interface RunClock { now(): number; schedule(fn: () => void, delayMs: number): () => void; afterPaint(fn: () => void): void }`
  - `const browserClock: RunClock` (`performance.now`, `setTimeout`, `requestAnimationFrame`)
  - `interface RunResult { reactionsMs: number[]; endedBy: DedusterEnd; wrongTileIndex: number | null }`
  - `type TapResult = 'hit' | 'miss' | 'ignored'`
  - `useDedusterRun(input: { order: readonly number[]; intervalMs: number; onEnd: (result: RunResult) => void; clock?: RunClock })` → `{ revealed: Readonly<Ref<number>>; running: Readonly<Ref<boolean>>; ended: Readonly<Ref<boolean>>; start(tileZeroAt: number): void; tap(index: number): TapResult; abandon(): void }`

`revealed` ist die **Anzahl** freigelegter Kacheln; die freigelegten sind `order.slice(0, revealed)`, die heiße ist `order[revealed - 1]`. Das ist alles, was das Brett je aus `order` liest — die kommenden Kacheln erreichen kein Template.

- [ ] **Step 1: Failing tests — Typwächter**

`types.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { asDedusterGuess, asDedusterOutcome, asDedusterPayload, asDedusterScene } from '../types'

describe('deduster types', () => {
  it('narrows a scene', () => {
    expect(asDedusterScene({ cols: 6, rows: 8, intervalMs: 1300 })).toEqual({ cols: 6, rows: 8, intervalMs: 1300 })
    expect(asDedusterScene({ cols: 6, rows: 8 })).toBeNull()
    expect(asDedusterScene({ cols: 6.5, rows: 8, intervalMs: 1300 })).toBeNull()
  })

  it('takes a payload only when its order is a permutation of the grid', () => {
    const base = { cols: 2, rows: 2, intervalMs: 900 }
    expect(asDedusterPayload({ ...base, order: [2, 0, 3, 1] })).toEqual({ ...base, order: [2, 0, 3, 1] })
    expect(asDedusterPayload({ ...base, order: [0, 0, 1, 2] })).toBeNull()
    expect(asDedusterPayload({ ...base, order: [0, 1, 2] })).toBeNull()
    expect(asDedusterPayload({ ...base, order: [0, 1, 2, 4] })).toBeNull()
  })

  it('narrows a stored guess', () => {
    expect(asDedusterGuess({ reactionsMs: [300], endedBy: 'WRONG_TILE', wrongTileIndex: 4, restarted: false })).toEqual({
      reactionsMs: [300],
      endedBy: 'WRONG_TILE',
      wrongTileIndex: 4,
      restarted: false,
    })
    expect(asDedusterGuess({ reactionsMs: [300], endedBy: 'BORED', wrongTileIndex: null, restarted: false })).toBeNull()
    expect(asDedusterGuess(null)).toBeNull()
  })

  it('narrows an outcome, average included or absent', () => {
    const outcome = {
      tilesCleared: 0,
      endedBy: 'TOO_LATE',
      wrongTileIndex: null,
      averageReactionMs: null,
      implausible: false,
      restarted: true,
    }
    expect(asDedusterOutcome(outcome)).toEqual(outcome)
    expect(asDedusterOutcome({ ...outcome, averageReactionMs: 'fast' })).toBeNull()
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster`
Expected: FAIL (Modul fehlt).

- [ ] **Step 2: `types.ts`**

```ts
/**
 * What the server sends, narrowed by hand: `scene`, `payload` and every stored guess arrive as
 * `unknown`, and a stale round may be junk.
 */

export interface DedusterScene {
  cols: number
  rows: number
  /** One beat: how long a tile stays hot, and the count-in's step. */
  intervalMs: number
}

export interface DedusterPayload extends DedusterScene {
  /** The order tiles are dusted off in. Never rendered beyond the tiles already fallen. */
  order: number[]
}

export type DedusterEnd = 'COMPLETE' | 'TOO_LATE' | 'WRONG_TILE'

const ENDS: readonly DedusterEnd[] = ['COMPLETE', 'TOO_LATE', 'WRONG_TILE']

export interface DedusterGuessWire {
  reactionsMs: number[]
  endedBy: DedusterEnd
  wrongTileIndex: number | null
  restarted: boolean
}

export interface DedusterOutcome {
  tilesCleared: number
  endedBy: DedusterEnd
  wrongTileIndex: number | null
  averageReactionMs: number | null
  implausible: boolean
  restarted: boolean
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isEnd(value: unknown): value is DedusterEnd {
  return typeof value === 'string' && (ENDS as readonly string[]).includes(value)
}

function isIntegerOrNull(value: unknown): value is number | null {
  return value === null || isInteger(value)
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function asDedusterScene(value: unknown): DedusterScene | null {
  const v = record(value)
  if (v === null || !isInteger(v.cols) || !isInteger(v.rows) || !isInteger(v.intervalMs)) return null
  if (v.cols <= 0 || v.rows <= 0 || v.intervalMs <= 0) return null
  return { cols: v.cols, rows: v.rows, intervalMs: v.intervalMs }
}

export function asDedusterPayload(value: unknown): DedusterPayload | null {
  const scene = asDedusterScene(value)
  const order = record(value)?.order
  if (scene === null || !Array.isArray(order)) return null
  const tiles = scene.cols * scene.rows
  // A permutation of the grid, or the board would light a tile twice or never reach one.
  if (order.length !== tiles || !order.every(isInteger)) return null
  if (new Set(order).size !== tiles || order.some((tile) => tile < 0 || tile >= tiles)) return null
  return { ...scene, order }
}

export function asDedusterGuess(value: unknown): DedusterGuessWire | null {
  const v = record(value)
  if (v === null || !Array.isArray(v.reactionsMs) || !v.reactionsMs.every(isInteger)) return null
  if (!isEnd(v.endedBy) || !isIntegerOrNull(v.wrongTileIndex) || typeof v.restarted !== 'boolean') return null
  return { reactionsMs: v.reactionsMs, endedBy: v.endedBy, wrongTileIndex: v.wrongTileIndex, restarted: v.restarted }
}

export function asDedusterOutcome(value: unknown): DedusterOutcome | null {
  const v = record(value)
  if (v === null || !isInteger(v.tilesCleared) || !isEnd(v.endedBy) || !isIntegerOrNull(v.wrongTileIndex)) return null
  const average = v.averageReactionMs
  if (average !== null && !(typeof average === 'number' && Number.isFinite(average))) return null
  if (typeof v.implausible !== 'boolean' || typeof v.restarted !== 'boolean') return null
  return {
    tilesCleared: v.tilesCleared,
    endedBy: v.endedBy,
    wrongTileIndex: v.wrongTileIndex,
    averageReactionMs: average,
    implausible: v.implausible,
    restarted: v.restarted,
  }
}
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/types.spec.ts`
Expected: PASS.

- [ ] **Step 3: Failing tests — der Lauf**

Die Uhr ist injiziert: `now` ist eine Zahl, die der Test bewegt; `schedule` sammelt Aufträge, die der Test bis zu einem Zeitpunkt abarbeitet; `afterPaint` läuft sofort nach dem Kachelwechsel, mit der dann aktuellen Zeit.

`useDedusterRun.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { useDedusterRun, type RunClock, type RunResult } from '../useDedusterRun'

function fakeClock(paintDelayMs = 0) {
  let now = 0
  let jobs: { at: number; fn: () => void; cancelled: boolean }[] = []
  const clock: RunClock = {
    now: () => now,
    schedule(fn, delayMs) {
      const job = { at: now + delayMs, fn, cancelled: false }
      jobs.push(job)
      return () => {
        job.cancelled = true
      }
    },
    afterPaint(fn) {
      const job = { at: now + paintDelayMs, fn, cancelled: false }
      jobs.push(job)
    },
  }
  /** Moves time to [to], running every due job in time order — jobs may schedule further jobs. */
  function advanceTo(to: number): void {
    for (;;) {
      const due = jobs.filter((j) => !j.cancelled && j.at <= to).sort((a, b) => a.at - b.at)[0]
      if (due === undefined) break
      jobs = jobs.filter((j) => j !== due)
      now = due.at
      due.fn()
    }
    now = to
  }
  return { clock, advanceTo }
}

const ORDER = [5, 2, 0, 7] as const

function runWith(paintDelayMs = 0) {
  const { clock, advanceTo } = fakeClock(paintDelayMs)
  const ends: RunResult[] = []
  const run = useDedusterRun({ order: ORDER, intervalMs: 1000, clock, onEnd: (r) => ends.push(r) })
  return { run, advanceTo, ends }
}

describe('useDedusterRun', () => {
  it('ignores taps before tile 0 falls', () => {
    const { run, advanceTo } = runWith()
    run.start(1000)

    advanceTo(500)
    expect(run.tap(5)).toBe('ignored')
    expect(run.revealed.value).toBe(0)
  })

  it('drops a tile per beat and times each first hit from the paint', () => {
    const { run, advanceTo, ends } = runWith(16)
    run.start(1000)

    advanceTo(1316)
    expect(run.revealed.value).toBe(1)
    expect(run.tap(5)).toBe('hit')
    expect(run.tap(5)).toBe('hit')

    advanceTo(2400)
    expect(run.revealed.value).toBe(2)
    expect(run.tap(2)).toBe('hit')

    advanceTo(3200)
    run.tap(0)
    advanceTo(4500)
    run.tap(7)

    expect(ends).toEqual([{ reactionsMs: [300, 384, 184, 484], endedBy: 'COMPLETE', wrongTileIndex: null }])
    expect(run.ended.value).toBe(true)
  })

  it('ends too late when a beat passes without the hit', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)

    advanceTo(1200)
    run.tap(5)
    advanceTo(3000)

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'TOO_LATE', wrongTileIndex: null }])
  })

  it('ends on a wrong tile, an earlier tile included', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)

    advanceTo(1200)
    run.tap(5)
    advanceTo(2100)
    expect(run.tap(5)).toBe('miss')

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'WRONG_TILE', wrongTileIndex: 5 }])
    expect(run.tap(2)).toBe('ignored')
  })

  it('ends too late when abandoned, and only once', () => {
    const { run, advanceTo, ends } = runWith()
    run.start(1000)
    advanceTo(1200)
    run.tap(5)

    run.abandon()
    run.abandon()
    advanceTo(9000)

    expect(ends).toEqual([{ reactionsMs: [200], endedBy: 'TOO_LATE', wrongTileIndex: null }])
  })

  it('lets a late start fall at once', () => {
    const { run, advanceTo } = runWith()
    advanceTo(5000)
    run.start(1000)

    advanceTo(5000)
    expect(run.revealed.value).toBe(1)
  })
})
```

Zur Rechnung im zweiten Test: Kachel 0 fällt bei 1000, gemalt bei 1016, Treffer bei 1316 → 300. Kachel 1 fällt bei 2000 → 2016, Treffer 2400 → 384. Kachel 2 bei 3000 → 3016, Treffer 3200 → 184. Kachel 3 bei 4000 → 4016, Treffer 4500 → 484, und der letzte Treffer beendet den Lauf sofort.

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/useDedusterRun.spec.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: `useDedusterRun.ts`**

```ts
/**
 * One Entstauber run, as logic without a screen: tiles fall on a fixed beat grid, each must be
 * hit before the next, and the first wrong tap or missed beat ends it.
 *
 * Measured with a monotonic clock and stamped after the tile has been painted, so render time is
 * not counted as reaction. The clock is injected; the board passes [browserClock].
 */
import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue'
import type { DedusterEnd } from './types'

export interface RunClock {
  now(): number
  /** Runs [fn] after [delayMs]; the returned function cancels it. */
  schedule(fn: () => void, delayMs: number): () => void
  /** Runs [fn] once the change just made has reached the screen. */
  afterPaint(fn: () => void): void
}

export const browserClock: RunClock = {
  now: () => performance.now(),
  // The globals, not `window.`: they are what fake timers replace in the board's tests.
  schedule(fn, delayMs) {
    const id = setTimeout(fn, delayMs)
    return () => clearTimeout(id)
  },
  afterPaint(fn) {
    requestAnimationFrame(() => fn())
  },
}

export interface RunResult {
  reactionsMs: number[]
  endedBy: DedusterEnd
  wrongTileIndex: number | null
}

export type TapResult = 'hit' | 'miss' | 'ignored'

export function useDedusterRun(input: {
  order: readonly number[]
  intervalMs: number
  onEnd: (result: RunResult) => void
  clock?: RunClock
}) {
  const clock = input.clock ?? browserClock
  /** How many tiles are off; the hot one is `order[revealed - 1]`. */
  const revealed = ref(0)
  const running = ref(false)
  const ended = ref(false)
  const reactions: number[] = []

  let tileZeroAt = 0
  let fellAt = 0
  let hit = false
  let cancelTick: (() => void) | null = null

  // A fixed grid from tile 0, not a chain of delays: a late timer must not push every later beat.
  function scheduleTick(level: number): void {
    const due = tileZeroAt + level * input.intervalMs
    cancelTick = clock.schedule(() => onTick(level), Math.max(0, due - clock.now()))
  }

  function onTick(level: number): void {
    if (ended.value) return
    if (level > 0 && !hit) return finish('TOO_LATE', null)
    if (level >= input.order.length) return
    revealed.value = level + 1
    hit = false
    fellAt = clock.now()
    clock.afterPaint(() => {
      if (revealed.value === level + 1 && !hit) fellAt = clock.now()
    })
    scheduleTick(level + 1)
  }

  function finish(endedBy: DedusterEnd, wrongTileIndex: number | null): void {
    if (ended.value) return
    ended.value = true
    running.value = false
    cancelTick?.()
    input.onEnd({ reactionsMs: [...reactions], endedBy, wrongTileIndex })
  }

  function start(at: number): void {
    if (running.value || ended.value) return
    running.value = true
    tileZeroAt = at
    scheduleTick(0)
  }

  function tap(index: number): TapResult {
    if (!running.value || revealed.value === 0) return 'ignored'
    if (index !== input.order[revealed.value - 1]) {
      finish('WRONG_TILE', index)
      return 'miss'
    }
    if (!hit) {
      hit = true
      reactions.push(Math.max(0, Math.round(clock.now() - fellAt)))
      if (revealed.value === input.order.length) finish('COMPLETE', null)
    }
    return 'hit'
  }

  function abandon(): void {
    if (running.value) finish('TOO_LATE', null)
  }

  if (getCurrentScope()) onScopeDispose(() => cancelTick?.())

  return {
    revealed: readonly(revealed),
    running: readonly(running),
    ended: readonly(ended),
    start,
    tap,
    abandon,
  }
}
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add webapp-vue/src/games/deduster
git commit -F - <<'MSG'
Add Entstauber's run as screen-free logic

Tiles fall on a fixed beat grid counted from tile 0, so one late
timer does not shift every later beat. A reaction is measured on the
monotonic clock from the moment the tile was painted, so render time
does not count. The first hit on the hot tile counts, a repeat is
fine, any other tile or a missed beat ends the run.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 11: Das Brett — `DedusterBoard`, `DedusterBriefing`

**Files:**
- Create: `webapp-vue/src/games/deduster/photo.ts`
- Create: `webapp-vue/src/games/deduster/DedusterBriefing.vue`
- Create: `webapp-vue/src/games/deduster/DedusterBoard.vue`
- Modify: `webapp-vue/src/games/deduster/types.ts` (Konstante `SCENE_ASSET_KEY`)
- Test: `webapp-vue/src/games/deduster/__tests__/DedusterBoard.spec.ts`

**Interfaces:**
- Consumes: `useDedusterRun`, `browserClock` (Task 10); `RevealCover` mit `timed`, `note`, `beatMs` (Task 9); `SceneState`.
- Produces:
  - `photo.ts`: `loadPhoto(url: string): Promise<void>` — fertig, sobald das Foto dekodiert ist.
  - `types.ts`: `export const SCENE_ASSET_KEY = 98`
  - `DedusterBoard` Props `{ payload: DedusterPayload | null; scene: DedusterScene | null; sealed: boolean; disabled: boolean; submitted: boolean; photoUrl: string; awardRule: AwardRule | null; awardPoints: number | null }`, Emits `{ guess: [DedusterGuessWire]; reveal: [] }`.
  - `DedusterBriefing` Props `{ awardRule: AwardRule | null; awardPoints: number | null }`.

Ablauf, wie die Spec ihn festlegt:

```
versiegelt:  Foto dekodiert → ready → halten 3 · 2 · 1 (je intervalMs) → Ring voll:
             Hülle weg, emit('reveal') → ein Takt ganzes Raster unter Staub → Kachel 0
             (bei max(ringFullAt + intervalMs, Payload da))
neu geladen: mit Payload, ohne Tipp, nie versiegelt gesehen → eigene Hülle mit note → halten →
             Hülle weg, kein reveal → ein Takt → Kachel 0; der Tipp trägt restarted: true
gescheitert: disabled fällt zurück, solange noch versiegelt → Hülle wieder da, auf ready
```

- [ ] **Step 1: Failing tests**

`DedusterBoard.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DedusterBoard from '../DedusterBoard.vue'
import RevealCover from '@/ui/RevealCover.vue'
import type { DedusterPayload } from '../types'

vi.mock('../photo', () => ({ loadPhoto: vi.fn(() => Promise.resolve()) }))

enableAutoUnmount(afterEach)

const SCENE = { cols: 2, rows: 2, intervalMs: 1000 }
const PAYLOAD: DedusterPayload = { ...SCENE, order: [3, 1, 0, 2] }

function mountBoard(props: Partial<InstanceType<typeof DedusterBoard>['$props']> = {}) {
  return mount(DedusterBoard, {
    props: {
      payload: null,
      scene: SCENE,
      sealed: true,
      disabled: false,
      submitted: false,
      photoUrl: '/asset/98',
      awardRule: null,
      awardPoints: null,
      ...props,
    },
  })
}

const cells = (w: ReturnType<typeof mountBoard>) => w.findAll('[data-test="deduster-cell"]')
const cleared = (w: ReturnType<typeof mountBoard>) => cells(w).filter((c) => c.classes().includes('opacity-0'))

/** happy-dom has no layout; a 200 × 200 field puts cell (col, row) at (50 + 100·col, 50 + 100·row). */
function stubField(w: ReturnType<typeof mountBoard>): void {
  const field = w.get('[data-test="deduster-field"]').element
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
}

async function tapCell(w: ReturnType<typeof mountBoard>, index: number): Promise<void> {
  const col = index % 2
  const row = Math.floor(index / 2)
  await w.get('[data-test="deduster-field"]').trigger('pointerdown', {
    clientX: 50 + 100 * col, clientY: 50 + 100 * row, isPrimary: true, button: 0,
  })
}

describe('DedusterBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    })
  })
  afterEach(() => vi.useRealTimers())

  it('lays the dusted grid out from the scene, under a cover that counts in at the beat', async () => {
    const w = mountBoard()
    await flushPromises()

    expect(cells(w)).toHaveLength(4)
    expect(cleared(w)).toHaveLength(0)
    const cover = w.getComponent(RevealCover)
    expect(cover.props('timed')).toBe(false)
    expect(cover.props('beatMs')).toBe(1000)
    expect(cover.props('note')).toBeNull()
  })

  it('offers the hold only once the photo is decoded', async () => {
    const w = mountBoard()
    expect(w.getComponent(RevealCover).props('state')).toBe('preparing')

    await flushPromises()
    expect(w.getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('drops the cover with the full ring and asks for the reveal, every tile still dust', async () => {
    const w = mountBoard()
    await flushPromises()

    w.getComponent(RevealCover).vm.$emit('start')
    await w.vm.$nextTick()

    expect(w.emitted('reveal')).toHaveLength(1)
    expect(w.findComponent(RevealCover).exists()).toBe(false)
    expect(cleared(w)).toHaveLength(0)
  })

  it('drops tile 0 one beat after the full ring, however fast the payload came', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    vi.advanceTimersByTime(300)
    await w.setProps({ sealed: false, payload: PAYLOAD })

    vi.advanceTimersByTime(699)
    await w.vm.$nextTick()
    expect(cleared(w)).toHaveLength(0)

    vi.advanceTimersByTime(1)
    await w.vm.$nextTick()
    expect(cleared(w)).toHaveLength(1)
  })

  it('puts the cover back when the reveal fails', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ disabled: true })
    await w.setProps({ disabled: false })

    expect(w.getComponent(RevealCover).props('state')).toBe('ready')
  })

  it('hands in a finished run, with the wrong tile it ended on', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    stubField(w)

    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()
    vi.advanceTimersByTime(250)
    await tapCell(w, 3)
    await tapCell(w, 0)

    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.endedBy).toBe('WRONG_TILE')
    expect(guess.wrongTileIndex).toBe(0)
    expect((guess.reactionsMs as number[]).length).toBe(1)
    expect(guess.restarted).toBe(false)
  })

  it('ends the run too late when the tab goes away', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    vi.advanceTimersByTime(1000)

    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })

    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.endedBy).toBe('TOO_LATE')
  })

  it('after a reload lays its own cover, starts without a reveal, and marks the run', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD, scene: SCENE })
    await flushPromises()

    const cover = w.getComponent(RevealCover)
    expect(cover.props('note')).toBe('Neu geladen — dein Lauf wird markiert.')
    cover.vm.$emit('start')
    vi.advanceTimersByTime(3000)

    expect(w.emitted('reveal')).toBeUndefined()
    const [guess] = w.emitted('guess')![0] as [Record<string, unknown>]
    expect(guess.restarted).toBe(true)
  })

  it('never puts the order into the DOM', async () => {
    const w = mountBoard()
    await flushPromises()
    w.getComponent(RevealCover).vm.$emit('start')
    await w.setProps({ sealed: false, payload: PAYLOAD })
    vi.advanceTimersByTime(1000)
    await w.vm.$nextTick()

    // One tile is off; nothing marks the three still to come, and no attribute names a tile.
    expect(cleared(w)).toHaveLength(1)
    for (const cell of cells(w)) {
      expect(Object.keys(cell.attributes()).sort()).toEqual(['class', 'data-test'])
    }
  })

  it('takes no taps once a guess is in', async () => {
    const w = mountBoard({ sealed: false, payload: PAYLOAD, submitted: true })
    await flushPromises()

    expect(w.findComponent(RevealCover).exists()).toBe(false)
    stubField(w)
    await tapCell(w, 3)
    expect(w.emitted('guess')).toBeUndefined()
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/DedusterBoard.spec.ts`
Expected: FAIL (Komponente fehlt).

Zu Test „drops tile 0 …“: der Ring ist bei `performance.now() = 0` voll, die Antwort kommt bei 300, Kachel 0 fällt bei `0 + 1000` — nicht bei `300 + 1000`. Das ist der Kern von „Die Hülle fällt mit dem vollen Ring, nicht mit dem Payload“.

- [ ] **Step 2: `photo.ts` und Konstante**

`photo.ts`:

```ts
/**
 * Resolves once the round's photo is decoded and paintable — the cover's `ready`. Decoded, not
 * merely loaded: the first tile must not wait on the decoder while its beat is already running.
 */
export async function loadPhoto(url: string): Promise<void> {
  const image = new Image()
  image.src = url
  await image.decode()
}
```

`types.ts`, oben:

```ts
/** The server's `SCENE_ASSET_KEY`: the photo, fetchable before the reveal. */
export const SCENE_ASSET_KEY = 98
```

- [ ] **Step 3: `DedusterBriefing.vue`**

```vue
<script setup lang="ts">
/**
 * The rules and the stake, below the play area — readable while the cover lies, which is when they
 * should be read. The five rules are the original's, word for word; the sixth explains the hold.
 */
import AwardBox from '@/ui/AwardBox.vue'
import InfoBox from '@/ui/InfoBox.vue'
import type { AwardRule } from '@/api/types'

const props = defineProps<{
  awardRule: AwardRule | null
  awardPoints: number | null
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <InfoBox storage-key="deduster">
      <template #abstract> Bestätige jede frisch entstaubte Kachel, bevor die nächste fällt. </template>
      <ol class="ms-4 list-decimal space-y-1">
        <li>In einem pro Runde festen Takt wird eine Kachel nach der anderen entstaubt.</li>
        <li>Jede neu entstaubte Kachel muss bestätigt werden — ein Tipp auf genau diese Kachel.</li>
        <li>Zeit dafür ist bis zur nächsten Kachel, also ein Takt.</li>
        <li>Wer bis zum Schluss mithält, gewinnt.</li>
        <li>
          Verloren hat, wer nicht rechtzeitig bestätigt oder eine andere als die zuletzt entstaubte
          Kachel antippt.
        </li>
      </ol>
      <p class="mt-3">Beim Halten wird im Takt des Spiels eingezählt.</p>
    </InfoBox>
    <AwardBox
      v-if="props.awardRule !== null && props.awardPoints !== null"
      :award-rule="props.awardRule"
      :award-points="props.awardPoints"
      game-id="deduster"
    >
      <template #qualifies>Du musst bis zur letzten Kachel mithalten.</template>
      <template #closest>
        Bis zur letzten Kachel — und von allen, die es schaffen, die kürzeste ⌀-Reaktionszeit.
      </template>
    </AwardBox>
  </div>
</template>
```

- [ ] **Step 4: `DedusterBoard.vue`**

```vue
<script setup lang="ts">
/**
 * Playing: the photo under dust, the cover over it, the run on top of both, and the rules below.
 *
 * The cover drops with the full ring, not with the payload: then one whole beat of fully dusted grid
 * is on screen before tile 0, and the reveal's round trip runs inside that beat instead of breaking
 * the pulse. That deviates from the cover contract on purpose — the contract protects a scored
 * clock, and this game has none; under the glass lies only dust, which is shown right after anyway.
 *
 * The order never reaches the template: only the count of fallen tiles does, and the set of fallen
 * tiles is derived from it in script.
 */
import { computed, effectScope, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useEventListener, useScrollLock } from '@vueuse/core'
import type { AwardRule } from '@/api/types'
import RevealCover from '@/ui/RevealCover.vue'
import type { SceneState } from '@/ui/sceneState'
import { prefersReducedMotion } from '@/ui/motion'
import DedusterBriefing from './DedusterBriefing.vue'
import { loadPhoto } from './photo'
import type { DedusterGuessWire, DedusterPayload, DedusterScene } from './types'
import { browserClock, useDedusterRun, type RunResult } from './useDedusterRun'

const RELOAD_NOTE = 'Neu geladen — dein Lauf wird markiert.'
const RIPPLE_MS = 400

const props = defineProps<{
  payload: DedusterPayload | null
  /** The layout and tempo under the cover, while `payload` is still withheld. */
  scene: DedusterScene | null
  sealed: boolean
  disabled: boolean
  /** A guess of this viewer's is already in: the board takes no more taps. */
  submitted: boolean
  /** The round's photo — the scene asset, fetchable before the reveal. */
  photoUrl: string
  awardRule: AwardRule | null
  awardPoints: number | null
}>()

const emit = defineEmits<{ guess: [value: DedusterGuessWire]; reveal: [] }>()

const layout = computed(() => props.payload ?? props.scene)

const sceneState = ref<SceneState>('preparing')
async function preparePhoto(): Promise<void> {
  sceneState.value = 'preparing'
  try {
    await loadPhoto(props.photoUrl)
    sceneState.value = 'ready'
  } catch {
    sceneState.value = 'failed'
  }
}
void preparePhoto()

/**
 * Mounted with the payload, without a guess, and never sealed in this mount: the reveal happened
 * before a reload. The server cannot tell a crash from intent, so the run may go again — marked.
 */
const sawSealed = ref(props.sealed)
watch(
  () => props.sealed,
  (sealed) => {
    if (sealed) sawSealed.value = true
  },
)
const restart = computed(() => !sawSealed.value && props.payload !== null && !props.submitted)

/** When the hold completed, on the run's clock. `null` while the cover lies. */
const ringFullAt = ref<number | null>(null)
const coverShown = computed(
  () => ringFullAt.value === null && !props.submitted && (props.sealed || restart.value),
)

/** Created once the order is known; its own scope so unmounting stops its timers. */
const scope = effectScope()
const run = shallowRef<ReturnType<typeof useDedusterRun> | null>(null)
onBeforeUnmount(() => scope.stop())

function begin(): void {
  const payload = props.payload
  const fullAt = ringFullAt.value
  if (payload === null || fullAt === null || run.value !== null) return
  const restarted = restart.value
  run.value =
    scope.run(() =>
      useDedusterRun({
        order: payload.order,
        intervalMs: payload.intervalMs,
        onEnd: (result: RunResult) => emit('guess', { ...result, restarted }),
      }),
    ) ?? null
  // One beat of whole, dusted grid after the full ring; a payload later than that falls at once.
  run.value?.start(fullAt + payload.intervalMs)
}

function onStart(): void {
  ringFullAt.value = browserClock.now()
  if (props.sealed) emit('reveal')
  else begin()
}

watch(
  () => props.payload,
  () => begin(),
)

// A reveal that failed hands `disabled` back while the round is still sealed: lay the cover again.
watch(
  () => props.disabled,
  (now, before) => {
    if (before && !now && props.sealed && run.value === null) ringFullAt.value = null
  },
)

const revealed = computed(() => {
  const payload = props.payload
  const count = run.value?.revealed.value ?? 0
  return new Set(payload === null ? [] : payload.order.slice(0, count))
})

const running = computed(() => run.value?.running.value === true)
const scrollLocked = useScrollLock(typeof document === 'undefined' ? null : document.body)
watch(running, (now) => {
  scrollLocked.value = now
})

// Mobile browsers throttle timers in the background; without this, switching apps would pause the run.
useEventListener(document, 'visibilitychange', () => {
  if (document.hidden) run.value?.abandon()
})

const field = ref<HTMLDivElement | null>(null)

function onPointerDown(event: PointerEvent): void {
  const current = run.value
  const grid = layout.value
  const el = field.value
  if (current === null || grid === null || el === null || !current.running.value) return
  if (!event.isPrimary || event.button !== 0) return
  const box = el.getBoundingClientRect()
  const x = event.clientX - box.left
  const y = event.clientY - box.top
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((x / box.width) * grid.cols)))
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((y / box.height) * grid.rows)))
  const result = current.tap(row * grid.cols + col)
  if (result !== 'ignored') ripple(el, x, y, result === 'hit')
}

/**
 * Feedback at the finger: without it a hit is only confirmed by the next tile, and the last one
 * never. Green for a hit, a repeat on the same tile included; red for anything else — then it is
 * the last thing the player sees. One element per tap, removed when its animation ends.
 */
function ripple(host: HTMLElement, x: number, y: number, hit: boolean): void {
  if (typeof host.animate !== 'function' || prefersReducedMotion()) return
  const dot = document.createElement('span')
  dot.className = 'pointer-events-none absolute size-16 rounded-full'
  dot.style.left = `${x}px`
  dot.style.top = `${y}px`
  dot.style.backgroundColor = hit ? 'rgb(34 197 94 / 0.55)' : 'rgb(239 68 68 / 0.7)'
  host.appendChild(dot)
  const animation = dot.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 },
    ],
    { duration: RIPPLE_MS, easing: 'ease-out' },
  )
  animation.onfinish = () => dot.remove()
}
</script>

<template>
  <div data-test="deduster-board" class="flex flex-col gap-6">
    <!-- Card-wide, like Musterung's: the field runs edge to edge for the largest tap targets, and
         the bottom padding, cancelled by `-mb-4`, lets the cover's blur fade before the glass ends. -->
    <div v-if="layout" class="relative -mx-4 -mt-4 -mb-4 pb-4">
      <div data-test="deduster-play" :inert="coverShown || undefined">
        <div
          ref="field"
          data-test="deduster-field"
          class="relative w-full overflow-hidden select-none"
          :class="{ 'touch-none': running }"
          :style="{ aspectRatio: `${layout.cols} / ${layout.rows}` }"
          @pointerdown="onPointerDown"
        >
          <img
            v-if="sceneState === 'ready'"
            :src="props.photoUrl"
            alt=""
            class="absolute inset-0 size-full"
            draggable="false"
          />
          <!-- No transition on a falling tile: any fade costs reaction time, and differently on every device. -->
          <div
            class="absolute inset-0 grid"
            :style="{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }"
          >
            <div
              v-for="cell in layout.cols * layout.rows"
              :key="cell"
              data-test="deduster-cell"
              class="border border-stone-500/30 bg-stone-400"
              :class="{ 'opacity-0': revealed.has(cell - 1) }"
            />
          </div>
        </div>
      </div>
      <RevealCover
        v-if="coverShown"
        :state="sceneState"
        :busy="props.disabled"
        :timed="false"
        :beat-ms="layout.intervalMs"
        :note="restart ? RELOAD_NOTE : null"
        @start="onStart"
        @retry="preparePhoto"
      />
    </div>

    <DedusterBriefing :award-rule="props.awardRule" :award-points="props.awardPoints" />
  </div>
</template>
```

Wenn `useScrollLock` mit `null` nicht typisiert, `document.body` direkt übergeben — happy-dom hat einen `body`. Heißt der Helfer in `@/ui/motion` anders als `prefersReducedMotion`, den Namen aus `HoldButton.vue` übernehmen (dort importiert).

- [ ] **Step 5: Prüfen**

Run: `cd webapp-vue && pnpm test -- src/games/deduster && pnpm lint && pnpm typecheck`
Expected: PASS.

Scheitert „never puts the order into the DOM“ an einem Attribut, das Vue selbst setzt (z. B. `style`), die Erwartung **nicht** lockern, bevor geprüft ist, dass das Attribut keine Kachel benennt; ein reines `style` ohne Bezug zur Reihenfolge darf in die Liste.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/deduster
git commit -F - <<'MSG'
Add Entstauber's board, under its own cover

The photo is decoded under the cover before the hold is offered. The
cover drops with the full ring, so one whole beat of dusted grid is on
screen before tile 0 and the reveal's round trip hides in that beat.
After a reload the board lays its own cover without a second reveal
and marks the run. Leaving the tab ends the run, since mobile
browsers would otherwise turn an app switch into a pause.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 12: Die Tabelle — `scoreboard.ts`, `DedusterScoreboard`

**Files:**
- Create: `webapp-vue/src/games/deduster/scoreboard.ts`
- Create: `webapp-vue/src/games/deduster/DedusterScoreboard.vue`
- Modify: `webapp-vue/src/games/RevealScoreboard.vue` (Slot `name`)
- Test: `webapp-vue/src/games/deduster/__tests__/scoreboard.spec.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/DedusterScoreboard.spec.ts`
- Test: `webapp-vue/src/games/__tests__/RevealScoreboard.spec.ts`

**Interfaces:**
- Consumes: `asDedusterGuess`, `asDedusterOutcome` (Task 10); `ScoreboardRow`, `isProvisional`, `tickOfRow`, `readableTextColor`.
- Produces:
  - `scoreboard.ts`: `type OutLabel = 'mit Applaus' | 'zu spät' | 'verklickt'`; `interface DedusterRow extends ScoreboardRow { reactionsMs: number[]; tilesCleared: number; averageLabel: string; levelLabel: string; out: OutLabel | null; endedBy: DedusterEnd | null; wrongTileIndex: number | null; implausible: boolean; restarted: boolean }`; `scoreRows(input: { entries: readonly GameEntry[]; tiles: number; awardRule: AwardRule | null; mineUserId: string | null }): DedusterRow[]`.
  - `DedusterScoreboard` Props `{ rows: DedusterRow[]; live: boolean; animate: boolean; selectedUserId: string | null }`, Emit `{ select: [userId: string] }`.
  - `RevealScoreboard`: ein Slot `name` mit `{ row }`, Vorgabe `{{ row.name }}`.

Spalten und Sortierung sind die des Originals: Name / ⌀ ms / Level % / raus / Punkte; Punkte ↓, Level % ↓, ⌀ ms ↑.

- [ ] **Step 1: Failing tests — Zeilen**

`scoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameEntry } from '@/games/GameEntry'
import { scoreRows } from '../scoreboard'

function entry(userId: string, guess: unknown, outcome: unknown, points: number | null): GameEntry {
  return {
    userId,
    username: userId,
    stage: 0,
    guess,
    outcome,
    points,
    durationMs: null,
    avatar: { bgColorHex: '#2563eb' },
    votes: [],
    struck: false,
    adminOverride: null,
  }
}

function played(userId: string, reactions: number[], endedBy: string, points: number, extra: Record<string, unknown> = {}) {
  const average = reactions.length === 0 ? null : reactions.reduce((a, b) => a + b, 0) / reactions.length
  return entry(
    userId,
    { reactionsMs: reactions, endedBy, wrongTileIndex: null, restarted: false },
    {
      tilesCleared: reactions.length,
      endedBy,
      wrongTileIndex: null,
      averageReactionMs: average,
      implausible: false,
      restarted: false,
      ...extra,
    },
    points,
  )
}

describe('deduster scoreRows', () => {
  it('sorts by points, then how far, then the faster average', () => {
    const rows = scoreRows({
      entries: [
        played('slow', [500, 500, 500, 500], 'COMPLETE', 1),
        played('early', [200], 'TOO_LATE', 0),
        played('fast', [300, 300, 300, 300], 'COMPLETE', 1),
        played('further', [250, 250], 'WRONG_TILE', 0),
      ],
      tiles: 4,
      awardRule: 'ALL_QUALIFYING',
      mineUserId: null,
    })

    expect(rows.map((r) => r.userId)).toEqual(['fast', 'slow', 'further', 'early'])
  })

  it('reads the original’s columns', () => {
    const [row] = scoreRows({
      entries: [played('a', [300, 401], 'WRONG_TILE', 0)],
      tiles: 4,
      awardRule: null,
      mineUserId: null,
    })

    expect(row!.averageLabel).toBe('351')
    expect(row!.levelLabel).toBe('50 %')
    expect(row!.out).toBe('verklickt')
  })

  it('says „—“ for a run without a single hit, and names every way out', () => {
    const rows = scoreRows({
      entries: [
        played('none', [], 'TOO_LATE', 0),
        played('all', [300, 300], 'COMPLETE', 1),
      ],
      tiles: 2,
      awardRule: null,
      mineUserId: null,
    })
    const byId = Object.fromEntries(rows.map((r) => [r.userId, r]))

    expect(byId.none!.averageLabel).toBe('—')
    expect(byId.none!.out).toBe('zu spät')
    expect(byId.all!.out).toBe('mit Applaus')
  })

  it('carries the marks the server set', () => {
    const [row] = scoreRows({
      entries: [played('m', [100], 'TOO_LATE', 0, { implausible: true, restarted: true })],
      tiles: 4,
      awardRule: null,
      mineUserId: null,
    })

    expect(row!.implausible).toBe(true)
    expect(row!.restarted).toBe(true)
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/scoreboard.spec.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 2: `scoreboard.ts`**

```ts
/**
 * „Auswertung“ for Entstauber: which rows exist, in which order, what each cell says. Pure, like
 * Musterung's — the half a test can assert on.
 */
import type { AwardRule } from '@/api/types'
import { isProvisional } from '@/games/awards'
import type { GameEntry } from '@/games/GameEntry'
import { tickOfRow } from '@/games/revealChoreography'
import type { ScoreboardRow } from '@/games/scoreboardColumns'
import { readableTextColor } from '@/ui/readableTextColor'
import { asDedusterGuess, asDedusterOutcome, type DedusterEnd } from './types'

export type OutLabel = 'mit Applaus' | 'zu spät' | 'verklickt'

const OUT: Record<DedusterEnd, OutLabel> = {
  COMPLETE: 'mit Applaus',
  TOO_LATE: 'zu spät',
  WRONG_TILE: 'verklickt',
}

export interface DedusterRow extends ScoreboardRow {
  reactionsMs: number[]
  tilesCleared: number
  /** Whole milliseconds, or „—“ for a run without a single hit — as the original showed it. */
  averageLabel: string
  levelLabel: string
  /** `null` for a row without a readable run, a give-up among them. */
  out: OutLabel | null
  endedBy: DedusterEnd | null
  /** As the server kept it: only a usable one survives `judge`. */
  wrongTileIndex: number | null
  implausible: boolean
  restarted: boolean
}

export function scoreRows(input: {
  entries: readonly GameEntry[]
  tiles: number
  awardRule: AwardRule | null
  mineUserId: string | null
}): DedusterRow[] {
  const ranked = input.entries.map((entry) => {
    const guess = asDedusterGuess(entry.guess)
    const outcome = asDedusterOutcome(entry.outcome)
    const reactionsMs = guess?.reactionsMs ?? []
    const average = outcome?.averageReactionMs ?? null
    const row: DedusterRow = {
      userId: entry.userId,
      name: entry.username,
      colorHex: entry.avatar.bgColorHex,
      ink: readableTextColor(entry.avatar.bgColorHex),
      points: entry.points,
      provisional: isProvisional(entry.points, input.awardRule),
      tick: 0,
      reactionsMs,
      tilesCleared: reactionsMs.length,
      averageLabel: average === null ? '—' : String(Math.round(average)),
      levelLabel: `${Math.round((reactionsMs.length / input.tiles) * 100)} %`,
      out: outcome === null ? null : OUT[outcome.endedBy],
      endedBy: outcome?.endedBy ?? null,
      wrongTileIndex: outcome?.wrongTileIndex ?? null,
      implausible: outcome?.implausible ?? false,
      restarted: outcome?.restarted ?? false,
    }
    return { row, average }
  })

  ranked.sort(
    (a, b) =>
      (b.row.points ?? -1) - (a.row.points ?? -1) ||
      b.row.tilesCleared - a.row.tilesCleared ||
      averageOrder(a.average, b.average) ||
      a.row.userId.localeCompare(b.row.userId),
  )

  const myRank = ranked.findIndex((item) => item.row.userId === input.mineUserId)
  return ranked.map(({ row }, rank) => ({
    ...row,
    tick: tickOfRow(rank, myRank === -1 ? null : myRank, ranked.length),
  }))
}

/** Faster first; a row without an average sorts after one with it rather than winning by default. */
function averageOrder(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/scoreboard.spec.ts`
Expected: PASS.

- [ ] **Step 3: Failing tests — Slot und Komponente**

`RevealScoreboard.spec.ts`, ein Test mehr (die vorhandenen Fixture-Helfer der Datei nutzen):

```ts
  it('lets a game fill the name cell, and shows the name by default', () => {
    const custom = mount(RevealScoreboard, {
      props: { rows: [ROW], columns: [], caption: 'x', live: false, animate: false },
      slots: { name: '<button data-test="named">{{ params.row.name }}</button>' },
    })
    expect(custom.get('[data-test="named"]').text()).toBe(ROW.name)

    const plain = mount(RevealScoreboard, {
      props: { rows: [ROW], columns: [], caption: 'x', live: false, animate: false },
    })
    expect(plain.text()).toContain(ROW.name)
  })
```

`ROW` ist eine `ScoreboardRow` der Datei; gibt es keine, eine anlegen (`{ userId: 'u1', name: 'Anna', colorHex: '#2563eb', ink: '#fff', points: 1, provisional: false, tick: 0 }`). Scoped Slots in `@vue/test-utils` sehen ihre Props als `params`.

`DedusterScoreboard.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterScoreboard from '../DedusterScoreboard.vue'
import type { DedusterRow } from '../scoreboard'

const ROW: DedusterRow = {
  userId: 'u1',
  name: 'Anna',
  colorHex: '#2563eb',
  ink: '#ffffff',
  points: 0,
  provisional: false,
  tick: 0,
  reactionsMs: [],
  tilesCleared: 0,
  averageLabel: '—',
  levelLabel: '0 %',
  out: 'zu spät',
  endedBy: 'TOO_LATE',
  wrongTileIndex: null,
  implausible: true,
  restarted: true,
}

describe('DedusterScoreboard', () => {
  it('shows the original’s columns and both marks', () => {
    const w = mount(DedusterScoreboard, { props: { rows: [ROW], live: false, animate: false, selectedUserId: null } })

    expect(w.get('[data-test="cell-avg-u1"]').text()).toBe('—')
    expect(w.get('[data-test="cell-level-u1"]').text()).toBe('0 %')
    expect(w.get('[data-test="cell-out-u1"]').text()).toContain('zu spät')
    expect(w.find('[data-test="mark-implausible-u1"]').exists()).toBe(true)
    expect(w.find('[data-test="mark-restarted-u1"]').exists()).toBe(true)
  })

  it('selects a player by their name, for the curve', async () => {
    const w = mount(DedusterScoreboard, { props: { rows: [ROW], live: false, animate: false, selectedUserId: null } })

    await w.get('[data-test="select-u1"]').trigger('click')

    expect(w.emitted('select')).toEqual([['u1']])
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games`
Expected: FAIL.

- [ ] **Step 4: Slot in `RevealScoreboard`**

Im `<th scope="row">` des Tabellenkörpers `{{ row.name }}` ersetzen durch:

```html
            <slot name="name" :row="row">{{ row.name }}</slot>
```

Im Kopfkommentar der Datei einen Satz anhängen: „A game may fill the name cell through the `name` slot — Entstauber puts a button there that picks the player's line in its curve.“

- [ ] **Step 5: `DedusterScoreboard.vue`**

```vue
<script setup lang="ts">
/**
 * „Auswertung“ for Entstauber. The table is `RevealScoreboard`; this file decides the three columns
 * and the name cell — a button, because the rows are the curve's legend: tapping one brings that
 * player's line forward.
 */
import { computed } from 'vue'
import RevealScoreboard from '@/games/RevealScoreboard.vue'
import type { ScoreboardColumn } from '@/games/scoreboardColumns'
import type { DedusterRow } from './scoreboard'

const props = defineProps<{
  rows: DedusterRow[]
  live: boolean
  animate: boolean
  selectedUserId: string | null
}>()

const emit = defineEmits<{ select: [userId: string] }>()

const columns = computed<ScoreboardColumn<DedusterRow>[]>(() => [
  { key: 'avg', label: '⌀ ms', width: '3.5rem', align: 'end', numeric: true },
  { key: 'level', label: 'Level', width: '3.5rem', align: 'end', numeric: true },
  { key: 'out', label: 'raus', width: '5.5rem' },
])
</script>

<template>
  <RevealScoreboard
    :rows="props.rows"
    :columns="columns"
    caption="Alle Läufe der Runde, nach Punkten sortiert"
    :live="props.live"
    :animate="props.animate"
  >
    <template #name="{ row }">
      <button
        type="button"
        :data-test="`select-${row.userId}`"
        class="w-full cursor-pointer truncate text-start"
        :class="props.selectedUserId === row.userId ? 'font-semibold underline' : ''"
        :aria-pressed="props.selectedUserId === row.userId"
        @click="emit('select', row.userId)"
      >
        {{ row.name }}
      </button>
    </template>

    <template #cell-avg="{ row }">{{ row.averageLabel }}</template>
    <template #cell-level="{ row }">{{ row.levelLabel }}</template>
    <template #cell-out="{ row }">
      <span>{{ row.out ?? '—' }}</span>
      <span
        v-if="row.implausible"
        :data-test="`mark-implausible-${row.userId}`"
        class="ms-1"
        title="unplausible Reaktionszeit"
        >⚠<span class="sr-only"> unplausible Reaktionszeit</span></span
      >
      <span
        v-if="row.restarted"
        :data-test="`mark-restarted-${row.userId}`"
        class="ms-1"
        title="nach dem Neuladen gespielt"
        >↻<span class="sr-only"> nach dem Neuladen gespielt</span></span
      >
    </template>
  </RevealScoreboard>
</template>
```

Typisiert der generische `RevealScoreboard` den Slot `name` nicht als `DedusterRow`, prüft `vue-tsc` das; in dem Fall den Slot in `RevealScoreboard` per `defineSlots` mit `row: Row` deklarieren — dieselbe Form, die die `cell-<key>`-Slots dort schon haben.

- [ ] **Step 6: Prüfen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS — inklusive aller bestehenden Tabellen der anderen Spiele.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src/games
git commit -F - <<'MSG'
Add Entstauber's scoreboard

The original's columns and order: average reaction, how far, how the
run ended, points; sorted by points, then progress, then the faster
average. A run without a hit reads „—“, and the server's two marks,
implausible and restarted, are shown on the row. The name cell is a
button, because the rows are the legend of the curve that follows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 13: Die Kurve — `chart.ts`, `DedusterChart`

**Files:**
- Create: `webapp-vue/src/games/deduster/chart.ts`
- Create: `webapp-vue/src/games/deduster/DedusterChart.vue`
- Test: `webapp-vue/src/games/deduster/__tests__/chart.spec.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/DedusterChart.spec.ts`

**Interfaces:**
- Consumes: `DedusterRow` (Task 12).
- Produces:
  - `chart.ts`: `const VIEW = { width: 320, height: 200, left: 36, right: 8, top: 8, bottom: 22 }`; `interface Frame { tiles: number; intervalMs: number; minMs: number; maxMs: number }`; `frameFor(input: { tiles: number; intervalMs: number; rows: readonly DedusterRow[] }): Frame`; `xOf(frame, level): number`; `yOf(frame, ms): number`; `polyline(frame, reactionsMs): string`; `levelAt(frame, x): number`; `wrongTilesAt(level: number, rows: readonly DedusterRow[]): { tile: number; players: { userId: string; colorHex: string }[] }[]`.
  - `DedusterChart` Props `{ rows: DedusterRow[]; tiles: number; intervalMs: number; selectedUserId: string | null; level: number | null }`, Emit `{ scrub: [level: number] }`.

Reines SVG: eine `<polyline>` je Spieler in seiner Farbe, ein `<rect>` als Game-Over-Band über dem Takt, eine gestrichelte `<line>` je ⌀, wenige `<text>` an den Achsen. Kein Tooltip, keine Legende (die Tabelle ist sie), kein Zoom, keine Animation.

- [ ] **Step 1: Failing tests — Skalen und Scrub**

`chart.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DedusterRow } from '../scoreboard'
import { VIEW, frameFor, levelAt, polyline, wrongTilesAt, xOf, yOf } from '../chart'

function row(userId: string, reactionsMs: number[], endedBy: DedusterRow['endedBy'], wrongTileIndex: number | null = null): DedusterRow {
  return {
    userId, name: userId, colorHex: `#${userId.padEnd(6, '0')}`, ink: '#fff', points: 0, provisional: false, tick: 0,
    reactionsMs, tilesCleared: reactionsMs.length, averageLabel: '', levelLabel: '', out: null, endedBy,
    wrongTileIndex, implausible: false, restarted: false,
  }
}

describe('deduster chart', () => {
  const frame = frameFor({ tiles: 48, intervalMs: 1300, rows: [row('aa', [250, 400], 'TOO_LATE')] })

  it('spans level 0 to the last tile across the plot', () => {
    expect(xOf(frame, 0)).toBe(VIEW.left)
    expect(xOf(frame, 47)).toBe(VIEW.width - VIEW.right)
  })

  it('puts the beat inside the plot, with room above it for the game-over band', () => {
    expect(frame.maxMs).toBeGreaterThan(1300)
    expect(yOf(frame, frame.maxMs)).toBe(VIEW.top)
    expect(yOf(frame, frame.minMs)).toBe(VIEW.height - VIEW.bottom)
  })

  it('draws one point per reaction', () => {
    expect(polyline(frame, [250, 400]).split(' ')).toHaveLength(2)
  })

  it('scrubs to the nearest level, clamped to the grid', () => {
    expect(levelAt(frame, xOf(frame, 12) + 1)).toBe(12)
    expect(levelAt(frame, -50)).toBe(0)
    expect(levelAt(frame, 9999)).toBe(47)
  })

  it('reports the wrong taps of exactly the scrubbed level, several players on one tile', () => {
    const rows = [
      row('aa', [300, 300], 'WRONG_TILE', 17),
      row('bb', [300, 300], 'WRONG_TILE', 17),
      row('cc', [300], 'WRONG_TILE', 4),
      row('dd', [300, 300], 'TOO_LATE'),
    ]

    expect(wrongTilesAt(2, rows)).toEqual([
      { tile: 17, players: [{ userId: 'aa', colorHex: '#aa0000' }, { userId: 'bb', colorHex: '#bb0000' }] },
    ])
    expect(wrongTilesAt(1, rows)).toEqual([{ tile: 4, players: [{ userId: 'cc', colorHex: '#cc0000' }] }])
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/chart.spec.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 2: `chart.ts`**

```ts
/**
 * The evaluation curve's arithmetic: level → x, milliseconds → y, a finger's x → the nearest level.
 * Pure, so the component has only drawing left to get wrong.
 */
import type { DedusterRow } from './scoreboard'

/** The SVG's own coordinate system; it scales with the card through `viewBox`. */
export const VIEW = { width: 320, height: 200, left: 36, right: 8, top: 8, bottom: 22 } as const

export interface Frame {
  tiles: number
  intervalMs: number
  minMs: number
  maxMs: number
}

/** Head room above the beat, so the game-over band has a visible height. */
const BAND_SHARE = 0.12

export function frameFor(input: { tiles: number; intervalMs: number; rows: readonly DedusterRow[] }): Frame {
  const fastest = Math.min(input.intervalMs, ...input.rows.flatMap((r) => r.reactionsMs))
  return {
    tiles: input.tiles,
    intervalMs: input.intervalMs,
    minMs: Math.max(0, Math.floor(fastest / 100) * 100 - 100),
    maxMs: Math.round(input.intervalMs * (1 + BAND_SHARE)),
  }
}

export function xOf(frame: Frame, level: number): number {
  const span = VIEW.width - VIEW.left - VIEW.right
  return VIEW.left + (frame.tiles <= 1 ? 0 : (level / (frame.tiles - 1)) * span)
}

export function yOf(frame: Frame, ms: number): number {
  const span = VIEW.height - VIEW.top - VIEW.bottom
  return VIEW.top + ((frame.maxMs - ms) / (frame.maxMs - frame.minMs)) * span
}

export function polyline(frame: Frame, reactionsMs: readonly number[]): string {
  return reactionsMs.map((ms, level) => `${xOf(frame, level)},${yOf(frame, ms)}`).join(' ')
}

export function levelAt(frame: Frame, x: number): number {
  const span = VIEW.width - VIEW.left - VIEW.right
  const level = Math.round(((x - VIEW.left) / span) * (frame.tiles - 1))
  return Math.min(frame.tiles - 1, Math.max(0, level))
}

/**
 * The tiles somebody wrongly tapped at exactly [level], with who: a run that went wrong at level L
 * has L reactions. A timeout marks nothing — there is no tapped tile, and a dot on the right tile
 * would read as a hit.
 */
export function wrongTilesAt(
  level: number,
  rows: readonly DedusterRow[],
): { tile: number; players: { userId: string; colorHex: string }[] }[] {
  const byTile = new Map<number, { userId: string; colorHex: string }[]>()
  for (const row of rows) {
    if (row.endedBy !== 'WRONG_TILE' || row.wrongTileIndex === null || row.tilesCleared !== level) continue
    const players = byTile.get(row.wrongTileIndex) ?? []
    players.push({ userId: row.userId, colorHex: row.colorHex })
    byTile.set(row.wrongTileIndex, players)
  }
  return [...byTile.entries()].map(([tile, players]) => ({ tile, players }))
}
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/chart.spec.ts`
Expected: PASS.

- [ ] **Step 3: Failing tests — Komponente**

`DedusterChart.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterChart from '../DedusterChart.vue'
import type { DedusterRow } from '../scoreboard'

function row(userId: string, reactionsMs: number[]): DedusterRow {
  return {
    userId, name: userId, colorHex: '#2563eb', ink: '#fff', points: 0, provisional: false, tick: 0,
    reactionsMs, tilesCleared: reactionsMs.length, averageLabel: '', levelLabel: '', out: null,
    endedBy: 'TOO_LATE', wrongTileIndex: null, implausible: false, restarted: false,
  }
}

const ROWS = [row('a', [300, 320, 310]), row('b', [400])]

function mountChart(props: Partial<InstanceType<typeof DedusterChart>['$props']> = {}) {
  return mount(DedusterChart, {
    props: { rows: ROWS, tiles: 48, intervalMs: 1300, selectedUserId: null, level: null, ...props },
  })
}

describe('DedusterChart', () => {
  it('draws one line and one dashed average per player, and the band above the beat', () => {
    const w = mountChart()

    expect(w.findAll('polyline')).toHaveLength(2)
    expect(w.findAll('[data-test="chart-average"]')).toHaveLength(2)
    expect(w.find('[data-test="chart-game-over"]').exists()).toBe(true)
  })

  it('brings the selected player forward and fades the others', () => {
    const w = mountChart({ selectedUserId: 'b' })
    const lines = w.findAll('polyline')

    expect(lines[0]!.attributes('stroke-opacity')).toBe('0.25')
    expect(lines[1]!.attributes('stroke-opacity')).toBe('1')
  })

  it('reports the level under the finger', async () => {
    const w = mountChart()
    const svg = w.get('svg').element
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    await w.get('svg').trigger('pointerdown', { clientX: 36, clientY: 100, isPrimary: true })

    expect(w.emitted('scrub')).toEqual([[0]])
  })

  it('draws the guide line at the scrubbed level', () => {
    expect(mountChart({ level: 3 }).find('[data-test="chart-guide"]').exists()).toBe(true)
    expect(mountChart().find('[data-test="chart-guide"]').exists()).toBe(false)
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster/__tests__/DedusterChart.spec.ts`
Expected: FAIL.

- [ ] **Step 4: `DedusterChart.vue`**

```vue
<script setup lang="ts">
/**
 * The curve the original's discussion happened over, as plain SVG: one line per player in their
 * colour, the beat as a ceiling with the game-over band above it, a dashed average per player.
 *
 * A scrub instead of a tooltip — a finger dragged across reads the nearest level; a phone has no
 * hover. The legend is the table above: selecting a row brings its line forward.
 */
import { computed, ref } from 'vue'
import { VIEW, frameFor, levelAt, polyline, xOf, yOf } from './chart'
import type { DedusterRow } from './scoreboard'

const props = defineProps<{
  rows: DedusterRow[]
  tiles: number
  intervalMs: number
  selectedUserId: string | null
  /** The scrubbed level, owned by the reveal so the photo can outline it too. */
  level: number | null
}>()

const emit = defineEmits<{ scrub: [level: number] }>()

const frame = computed(() => frameFor({ tiles: props.tiles, intervalMs: props.intervalMs, rows: props.rows }))

const lines = computed(() =>
  props.rows.map((row) => {
    const sum = row.reactionsMs.reduce((a, b) => a + b, 0)
    return {
      row,
      points: polyline(frame.value, row.reactionsMs),
      averageY: row.reactionsMs.length === 0 ? null : yOf(frame.value, sum / row.reactionsMs.length),
      opacity: props.selectedUserId === null || props.selectedUserId === row.userId ? '1' : '0.25',
    }
  }),
)

const ticks = computed(() => {
  const step = 8
  return Array.from({ length: Math.floor((props.tiles - 1) / step) + 1 }, (_, i) => i * step)
})

const readout = computed(() => {
  const level = props.level
  if (level === null) return null
  const focus = props.rows.find((r) => r.userId === props.selectedUserId) ?? props.rows[0]
  const ms = focus?.reactionsMs[level]
  return { x: xOf(frame.value, level), text: ms === undefined ? `Level ${level + 1}` : `Level ${level + 1} · ${ms} ms` }
})

const svg = ref<SVGSVGElement | null>(null)
const dragging = ref(false)

function scrubAt(event: PointerEvent): void {
  const el = svg.value
  if (el === null) return
  const box = el.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * VIEW.width
  emit('scrub', levelAt(frame.value, x))
}

function onDown(event: PointerEvent): void {
  dragging.value = true
  scrubAt(event)
}

function onMove(event: PointerEvent): void {
  if (dragging.value) scrubAt(event)
}
</script>

<template>
  <svg
    ref="svg"
    data-test="deduster-chart"
    :viewBox="`0 0 ${VIEW.width} ${VIEW.height}`"
    class="w-full touch-pan-y text-neutral-500 select-none"
    role="img"
    aria-label="Reaktionszeit je Level, ein Verlauf je Spieler"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="dragging = false"
    @pointerleave="dragging = false"
  >
    <rect
      data-test="chart-game-over"
      :x="VIEW.left"
      :y="VIEW.top"
      :width="VIEW.width - VIEW.left - VIEW.right"
      :height="yOf(frame, props.intervalMs) - VIEW.top"
      class="fill-red-500/15"
    />
    <line
      :x1="VIEW.left"
      :x2="VIEW.width - VIEW.right"
      :y1="yOf(frame, props.intervalMs)"
      :y2="yOf(frame, props.intervalMs)"
      class="stroke-current"
      stroke-width="0.5"
    />
    <text :x="VIEW.left - 4" :y="yOf(frame, props.intervalMs) + 3" text-anchor="end" class="fill-current text-[8px]">
      {{ props.intervalMs }}
    </text>
    <text :x="VIEW.left - 4" :y="yOf(frame, frame.minMs)" text-anchor="end" class="fill-current text-[8px]">
      {{ frame.minMs }}
    </text>
    <text
      v-for="tick in ticks"
      :key="tick"
      :x="xOf(frame, tick)"
      :y="VIEW.height - 6"
      text-anchor="middle"
      class="fill-current text-[8px]"
    >
      {{ tick }}
    </text>

    <template v-for="line in lines" :key="line.row.userId">
      <line
        v-if="line.averageY !== null"
        data-test="chart-average"
        :x1="VIEW.left"
        :x2="VIEW.width - VIEW.right"
        :y1="line.averageY"
        :y2="line.averageY"
        :stroke="line.row.colorHex"
        :stroke-opacity="line.opacity"
        stroke-width="0.75"
        stroke-dasharray="3 3"
      />
      <polyline
        :points="line.points"
        fill="none"
        :stroke="line.row.colorHex"
        :stroke-opacity="line.opacity"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </template>

    <template v-if="readout">
      <line
        data-test="chart-guide"
        :x1="readout.x"
        :x2="readout.x"
        :y1="VIEW.top"
        :y2="VIEW.height - VIEW.bottom"
        class="stroke-neutral-900 dark:stroke-neutral-100"
        stroke-width="0.75"
      />
      <text
        :x="Math.min(readout.x + 4, VIEW.width - VIEW.right - 70)"
        :y="VIEW.top + 10"
        class="fill-neutral-900 text-[9px] dark:fill-neutral-100"
      >
        {{ readout.text }}
      </text>
    </template>
  </svg>
</template>
```

Die Zahlen an der Achse sind Level ab 0, wie im Original. Ist ein Farbton wie `fill-red-500/15` im Projekt nicht üblich, die Klasse aus `RevealScoreboard`/`AwardBox` übernehmen, die dort für „verloren“ steht.

- [ ] **Step 5: Prüfen**

Run: `cd webapp-vue && pnpm test -- src/games/deduster && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webapp-vue/src/games/deduster
git commit -F - <<'MSG'
Draw Entstauber's evaluation curve as plain SVG

The curve was where the original's discussion happened; echarts was
not. One line per player, the beat as a ceiling with the game-over
band above it, a dashed average each. A finger scrubs to the nearest
level instead of hovering, and the table is the legend.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---
### Task 14: Auswertung, Weiche, Registrierung — `DedusterReveal`, `DedusterGame`

**Files:**
- Create: `webapp-vue/src/games/deduster/DedusterReveal.vue`
- Create: `webapp-vue/src/games/deduster/DedusterGame.vue`
- Modify: `webapp-vue/src/games/registry.ts`
- Modify: `webapp-vue/src/gamelab/games.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/DedusterReveal.spec.ts`
- Test: `webapp-vue/src/games/deduster/__tests__/DedusterGame.spec.ts`

**Interfaces:**
- Consumes: alles aus Task 10–13.
- Produces: `DedusterGame` mit dem Spielvertrag aller Spiele (Props `payload, outcome, myGuess, solution, entries, mineUserId, awardRule, awardPoints, disabled, stage?, assetUrl?, closed?, sealed?, scene?`; Emits `guess, skip, giveUp, reveal`); Registry-Eintrag `deduster`; Labor-Eintrag `{ id: 'deduster', title: 'Entstauber' }`.

Der Lohn ist das freigelegte Foto — es gibt keinen Lösungsausgang (`solution` bleibt `null`). Die Auswertung zeigt das Foto, darunter Tabelle und Kurve. Der Rückkanal von der Kurve zum Bild: beim Scrubben auf Level *L* umrandet das Foto die richtige Kachel (`order[L]`) und rot jede Kachel, auf die an genau diesem Level jemand falsch getippt hat, mit Punkten in den Spielerfarben (je mit dünnem Kontrastrand).

- [ ] **Step 1: Failing tests**

`DedusterReveal.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterChart from '../DedusterChart.vue'
import DedusterReveal from '../DedusterReveal.vue'
import DedusterScoreboard from '../DedusterScoreboard.vue'
import type { DedusterRow } from '../scoreboard'

const PAYLOAD = { cols: 2, rows: 2, intervalMs: 1000, order: [3, 1, 0, 2] }

function row(userId: string, reactionsMs: number[], endedBy: DedusterRow['endedBy'], wrongTileIndex: number | null): DedusterRow {
  return {
    userId, name: userId, colorHex: '#7c3aed', ink: '#fff', points: 0, provisional: false, tick: 0,
    reactionsMs, tilesCleared: reactionsMs.length, averageLabel: '', levelLabel: '', out: null,
    endedBy, wrongTileIndex, implausible: false, restarted: false,
  }
}

const ROWS = [row('a', [300], 'WRONG_TILE', 2), row('b', [300], 'WRONG_TILE', 2), row('c', [300, 300], 'TOO_LATE', null)]

function mountReveal() {
  return mount(DedusterReveal, {
    props: { payload: PAYLOAD, photoUrl: '/asset/98', rows: ROWS, mineUserId: 'c', live: false, animate: false },
  })
}

describe('DedusterReveal', () => {
  it('shows the whole photo, the table and the curve', () => {
    const w = mountReveal()

    expect(w.get('img').attributes('src')).toBe('/asset/98')
    expect(w.findComponent(DedusterScoreboard).exists()).toBe(true)
    expect(w.findComponent(DedusterChart).exists()).toBe(true)
  })

  it('outlines the right tile and the wrong ones of the scrubbed level, with a dot per player', async () => {
    const w = mountReveal()

    w.getComponent(DedusterChart).vm.$emit('scrub', 1)
    await w.vm.$nextTick()

    expect(w.findAll('[data-test="reveal-correct"]').map((c) => c.attributes('data-tile'))).toEqual(['1'])
    const wrong = w.findAll('[data-test="reveal-wrong"]')
    expect(wrong.map((c) => c.attributes('data-tile'))).toEqual(['2'])
    expect(wrong[0]!.findAll('[data-test="reveal-dot"]')).toHaveLength(2)
  })

  it('starts with the viewer selected and lets a row take over', async () => {
    const w = mountReveal()
    expect(w.getComponent(DedusterChart).props('selectedUserId')).toBe('c')

    w.getComponent(DedusterScoreboard).vm.$emit('select', 'a')
    await w.vm.$nextTick()
    expect(w.getComponent(DedusterChart).props('selectedUserId')).toBe('a')
  })
})
```

(`data-tile` ist hier erlaubt: die Auswertung kommt erst nach dem eigenen Tipp, die Reihenfolge ist dann kein Geheimnis mehr. Auf dem Brett bleibt sie verboten.)

`DedusterGame.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DedusterBoard from '../DedusterBoard.vue'
import DedusterGame from '../DedusterGame.vue'
import DedusterReveal from '../DedusterReveal.vue'

vi.mock('../photo', () => ({ loadPhoto: vi.fn(() => Promise.resolve()) }))

const SCENE = { cols: 2, rows: 2, intervalMs: 1000 }
const PAYLOAD = { ...SCENE, order: [3, 1, 0, 2] }

function mountGame(props: Record<string, unknown> = {}) {
  return mount(DedusterGame, {
    props: {
      payload: null,
      outcome: null,
      myGuess: null,
      solution: null,
      entries: [],
      mineUserId: 'me',
      awardRule: 'ALL_QUALIFYING',
      awardPoints: 1,
      disabled: false,
      assetUrl: (key: number) => `/asset/${key}`,
      sealed: true,
      scene: SCENE,
      ...props,
    },
  })
}

describe('DedusterGame', () => {
  it('mounts the board under the cover while sealed, with the scene photo', () => {
    const board = mountGame().getComponent(DedusterBoard)

    expect(board.props('sealed')).toBe(true)
    expect(board.props('photoUrl')).toBe('/asset/98')
    expect(board.props('scene')).toEqual(SCENE)
  })

  it('turns to the evaluation once a guess of mine is in', () => {
    const w = mountGame({
      sealed: false,
      payload: PAYLOAD,
      myGuess: { reactionsMs: [], endedBy: 'TOO_LATE', wrongTileIndex: null, restarted: false },
    })

    expect(w.findComponent(DedusterReveal).exists()).toBe(true)
    expect(w.findComponent(DedusterBoard).exists()).toBe(false)
  })

  it('forwards the board’s guess and reveal', () => {
    const w = mountGame()
    const board = w.getComponent(DedusterBoard)

    board.vm.$emit('reveal')
    board.vm.$emit('guess', { reactionsMs: [], endedBy: 'TOO_LATE', wrongTileIndex: null, restarted: false })

    expect(w.emitted('reveal')).toHaveLength(1)
    expect(w.emitted('guess')).toHaveLength(1)
  })

  it('says so instead of rendering junk', () => {
    expect(mountGame({ scene: { cols: 'x' } }).text()).toContain('Diese Runde lässt sich hier nicht anzeigen.')
  })
})
```

Run: `cd webapp-vue && pnpm test -- src/games/deduster`
Expected: FAIL (Komponenten fehlen).

- [ ] **Step 2: `DedusterReveal.vue`**

```vue
<script setup lang="ts">
/**
 * After the run: the photo under the dust, whole — the reward — then the table and the curve.
 * Scrubbing the curve outlines the scrubbed level's right tile on the photo, and in red every tile
 * somebody wrongly tapped at that level, with a dot per player: that is how one sees one lay a tile
 * too far right.
 */
import { computed, ref } from 'vue'
import DedusterChart from './DedusterChart.vue'
import DedusterScoreboard from './DedusterScoreboard.vue'
import { wrongTilesAt } from './chart'
import type { DedusterRow } from './scoreboard'
import type { DedusterPayload } from './types'

const props = defineProps<{
  payload: DedusterPayload
  photoUrl: string
  rows: DedusterRow[]
  mineUserId: string | null
  live: boolean
  animate: boolean
}>()

const tiles = computed(() => props.payload.cols * props.payload.rows)
const selectedUserId = ref<string | null>(props.mineUserId)
const level = ref<number | null>(null)

const correctTile = computed(() => (level.value === null ? null : (props.payload.order[level.value] ?? null)))
const wrong = computed(() =>
  level.value === null ? new Map<number, { userId: string; colorHex: string }[]>() :
    new Map(wrongTilesAt(level.value, props.rows).map((w) => [w.tile, w.players])),
)

function markOf(tile: number): 'reveal-correct' | 'reveal-wrong' | 'reveal-cell' {
  if (tile === correctTile.value) return 'reveal-correct'
  if (wrong.value.has(tile)) return 'reveal-wrong'
  return 'reveal-cell'
}
</script>

<template>
  <div data-test="deduster-reveal" class="flex flex-col gap-6">
    <div class="relative -mx-4 -mt-4" :style="{ aspectRatio: `${props.payload.cols} / ${props.payload.rows}` }">
      <img :src="props.photoUrl" alt="Das freigelegte Foto" class="absolute inset-0 size-full" draggable="false" />
      <div
        v-if="level !== null"
        class="pointer-events-none absolute inset-0 grid"
        :style="{ gridTemplateColumns: `repeat(${props.payload.cols}, minmax(0, 1fr))` }"
      >
        <div
          v-for="cell in tiles"
          :key="cell"
          :data-test="markOf(cell - 1)"
          :data-tile="cell - 1"
          class="flex flex-wrap content-center justify-center gap-0.5"
          :class="{
            'ring-2 ring-white ring-inset': markOf(cell - 1) === 'reveal-correct',
            'ring-2 ring-red-600 ring-inset': markOf(cell - 1) === 'reveal-wrong',
          }"
        >
          <span
            v-for="player in wrong.get(cell - 1) ?? []"
            :key="player.userId"
            data-test="reveal-dot"
            class="size-2.5 rounded-full ring-1 ring-white"
            :style="{ backgroundColor: player.colorHex }"
          />
        </div>
      </div>
    </div>

    <DedusterScoreboard
      :rows="props.rows"
      :live="props.live"
      :animate="props.animate"
      :selected-user-id="selectedUserId"
      @select="(userId) => (selectedUserId = userId)"
    />
    <DedusterChart
      :rows="props.rows"
      :tiles="tiles"
      :interval-ms="props.payload.intervalMs"
      :selected-user-id="selectedUserId"
      :level="level"
      @scrub="(next) => (level = next)"
    />
  </div>
</template>
```

Der Test zählt `reveal-cell` nicht mit; `data-tile` steht auf jeder Zelle, damit der Test die Kachel benennen kann.

- [ ] **Step 3: `DedusterGame.vue`**

```vue
<script setup lang="ts">
/**
 * Entstauber: which card the round is on, and the one place `unknown` becomes typed.
 *
 * `skip` and `giveUp` are declared but never emitted — one stage, one attempt, and both exits are
 * the framework's. `solution` is declared and never read: the photo under the dust is the reward,
 * and it comes through the scene asset, not through a solution exit.
 */
import { computed, ref, watch } from 'vue'
import type { AwardRule } from '@/api/types'
import type { GameEntry } from '@/games/GameEntry'
import DedusterBoard from './DedusterBoard.vue'
import DedusterReveal from './DedusterReveal.vue'
import { scoreRows } from './scoreboard'
import { SCENE_ASSET_KEY, asDedusterGuess, asDedusterPayload, asDedusterScene } from './types'

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
  sealed?: boolean
  scene?: unknown
}>()

const emit = defineEmits<{ guess: [unknown]; skip: [number]; giveUp: []; reveal: [] }>()

const payload = computed(() => asDedusterPayload(props.payload))
const scene = computed(() => asDedusterScene(props.scene))
const myGuess = computed(() => asDedusterGuess(props.myGuess))
const photoUrl = computed(() => props.assetUrl?.(SCENE_ASSET_KEY) ?? null)
const done = computed(() => props.closed === true || myGuess.value !== null)

const rows = computed(() =>
  payload.value === null
    ? []
    : scoreRows({
        entries: props.entries,
        tiles: payload.value.cols * payload.value.rows,
        awardRule: props.awardRule,
        mineUserId: props.mineUserId,
      }),
)

const live = computed(() => props.awardRule === 'CLOSEST_ONLY')

/** As in Musterung: the table's cascade plays only when the evaluation arrives here, not on reload. */
const hasRevealedLive = ref(false)
watch(done, (now, before) => {
  if (!before && now) hasRevealedLive.value = true
})
</script>

<template>
  <p v-if="photoUrl === null || (payload === null && scene === null)" class="text-sm text-neutral-600">
    Diese Runde lässt sich hier nicht anzeigen.
  </p>
  <DedusterReveal
    v-else-if="done && payload"
    :payload="payload"
    :photo-url="photoUrl"
    :rows="rows"
    :mine-user-id="props.mineUserId"
    :live="live"
    :animate="hasRevealedLive"
  />
  <DedusterBoard
    v-else
    :payload="payload"
    :scene="scene"
    :sealed="props.sealed === true"
    :disabled="props.disabled"
    :submitted="myGuess !== null"
    :photo-url="photoUrl"
    :award-rule="props.awardRule"
    :award-points="props.awardPoints"
    @guess="(value) => emit('guess', value)"
    @reveal="emit('reveal')"
  />
</template>
```

- [ ] **Step 4: Registrieren**

`games/registry.ts`: `import DedusterGame from './deduster/DedusterGame.vue'` und `deduster: DedusterGame,` in `gameComponents`.

`gamelab/games.ts`: `{ id: 'deduster', title: 'Entstauber' }` ans Ende von `labGameList`.

- [ ] **Step 5: Prüfen**

Run: `cd webapp-vue && pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS. Prüft ein bestehender Test, dass Registry und Laborliste dieselben Ids führen, ist er damit wieder deckungsgleich.

- [ ] **Step 6: Im Labor ansehen**

Den Dev-Server prüfen (Arbeitsverzeichnis des laufenden Servers nachsehen — er läuft mal aus dem Hauptcheckout, mal aus einem Worktree). Ein Bild in den Gemeinschafts-Pool der Labor-Gemeinschaft hochladen, dann `/c/<slug>/lab/deduster?seed=1&phase=ONE` öffnen. Im Browser-Pane prüfbar: Raster unter Milchglas in der richtigen Orientierung, Warnsatz „Der Lauf startet …“, Briefing mit der Zeile zum Einzählen, die Regeln außerhalb der Hülle, kein Request auf das Foto vor `ready`, sondern genau einer. **Nicht** prüfbar dort (Pane meldet sich als versteckt): Halten, Takt, Ripple, Ende des Laufs.

- [ ] **Step 7: Commit**

```bash
git add webapp-vue/src
git commit -F - <<'MSG'
Show Entstauber's evaluation and register the game

After the run the whole photo is the reward, with the table and the
curve below it. Scrubbing a level outlines its right tile on the photo
and, in red, every tile somebody wrongly tapped there, a dot for each
player. The game is now in the shared registry and the lab's list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

### Task 15: Wissen zurückführen

**Files:**
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `.claude/guidelines/game-integrity.md`
- Modify: `.claude/guidelines/modules-and-migrations.md`
- Modify: `.claude/guidelines/testing.md`
- Modify: `docs/superpowers/specs/2026-09-07-community-image-pool-design.md`
- Modify: `docs/superpowers/specs/2026-09-14-entstauber-design.md`

Regeln, keine Erzählung (`feeding-knowledge-back.md`): was ein künftiger Implementer wissen muss, steht in der Guideline; Messungen und Herleitungen bleiben im Commit. Englisch in den Guidelines, deutsch in den Specs.

- [ ] **Step 1: `game-rounds.md`**

- Abschnitt „One secret per round, two exits“: den Satz „a game whose scene genuinely needs a drawn value needs a third, independently seeded stream, which nothing builds today“ ersetzen durch: „A drawn scene value comes from `GameRandom.scene`, the third stream: published before the reveal, so it must not share a stream with anything the reveal or the guess protects.“ Den Absatz zu `GameRandom` auf drei Ströme anpassen: `scene` vor dem Aufdecken, `presentation` ab dem Aufdecken, `solution` nie.
- Abschnitt zur Dauer („The duration is the one exception …“): Bedingung ist jetzt `GameType.scoresOnDuration(params)`, nicht `requiresReveal`. Ein Satz dazu: „`requiresReveal` and `scoresOnDuration` are two questions: a deliberate, single reveal, and whether reveal-to-guess is the score. Entstauber answers `true`/`false`.“ Den Satz über `PlayService.guess`, das die `deviation` überschreibt, ebenso auf `scoresOnDuration` umstellen.
- Neuer kurzer Abschnitt „Assets before the reveal“: „`SCENE_ASSET_KEY` (98) is the only asset served without a play row — what the cover lies over. Every other key stays behind the reveal; opening stage 0 instead would hand out Anspielung's first clip.“
- Ein Satz zu `isAvailable`: „A game whose content may be absent says so in `isAvailable(context)`; the selection draws among the available ones only, and the lab answers 404 for the others.“

- [ ] **Step 2: `game-integrity.md`**

Ein Absatz „The ceiling, named — Entstauber“: das erste Spiel, das zwei Regeln nicht einhält. (1) Die Kachelreihenfolge verlässt den Server als Liste; ein Roundtrip pro Kachel ist bei 900–2000 ms ausgeschlossen. Vor dem Aufdecken bleibt sie dicht (eigener Strom für die Bühne), danach erreicht sie das DOM nicht — der Network-Tab bleibt offen. (2) Die ⌀-Reaktionszeit ist ein Client-Stempel; ohne Roundtrips gibt es keine Ersatzmessung. Gegenmittel: Plausibilitätsboden (`< 120 ms` oder `> intervalMs` markiert), sichtbare Markierung, rohe Reaktionszeiten gespeichert. „Mark, never reject“ als Regel für jeden nicht wiederholbaren Lauf.

- [ ] **Step 3: `modules-and-migrations.md`**

`deduster` in die Modulliste: Schema `deduster`, Tabelle `round_images` (weiche Referenz auf `game.round_games`, kein FK — wie `songsnippet`), Abhängigkeit `deduster → imagepool`; `imagepool` exportiert jetzt `ImagePoolQuery`.

- [ ] **Step 4: `testing.md`**

Eine Regel: „The Testcontainers database is shared by the whole suite. A test that commits rows (no `@Transactional`) into a set every community can see — the global image pool — deletes them after each test: a leftover row there is available content for every later announcement, and a junk row breaks the game that draws it, depending on test order.“

- [ ] **Step 5: Bild-Pool-Spec**

Den Satz, eine Runde halte nur eine weiche Referenz und zeige nach dem Löschen einen Platzhalter, ergänzen: „Das gilt nur zwischen Ziehung und Ankündigung; ab der Ankündigung hält Entstauber eine eigene Kopie (`deduster.round_images`).“ Und: die erste exportierte Schnittstelle ist `ImagePoolQuery` mit `candidateIds`, `displaySize`, `displayed`.

- [ ] **Step 6: Entstauber-Spec**

- `ImagePoolQuery`: `original(id): PoolImageBytes?` → `displayed(id, minShortEdge): BufferedImage?`, mit dem Grund (EXIF-Drehung lebt in `ImageIntake`, Modulith verbietet den Zugriff); `PoolImageBytes` fällt weg.
- Modulschnitt: `DedusterPool` (Vorrang Gemeinschaft vor global, `gridOf`) ergänzen; der Adapter sieht `imagepool` nicht.
- „Markiert statt abgewiesen“: die WARN-Zeile nennt Runde (über die Bild-Id) und Grund, **nicht** den Spieler — `judge` kennt ihn nicht; die Zeile in `round_plays` trägt die Markierung und den Spieler.

- [ ] **Step 7: Commit**

```bash
git add .claude/guidelines docs/superpowers/specs
git commit -F - <<'MSG'
Feed back what Entstauber taught the framework

The scene stream now exists, reveal and duration scoring are two
questions, one reserved asset key opens before the reveal, and a game
may decline a round it cannot draw. The integrity guide names the two
rules a reaction game without round trips cannot keep. The test guide
records that rows committed to a shared pool must be cleaned up.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
```

---

## Handprobe (nach Task 15, auf einem echten Handy, nicht im Browser-Pane)

1. Labor, `deduster`, ein Hochformat-, ein Quer- und ein quadratisches Foto: Raster 6 × 8 / 8 × 6 / 7 × 7, Foto mittig zugeschnitten, nicht verzerrt.
2. Halten zählt 3 · 2 · 1 im Takt der Runde; Loslassen bricht ab; bei vollem Ring fällt die Hülle **sofort**, ein Takt lang steht das ganze Raster unter Staub, dann fällt Kachel 0 — der Puls läuft ohne Stocken weiter.
3. Treffer grün, Nachschuss auf dieselbe Kachel grün, falsche Kachel rot und Ende; ein ausgelassener Takt beendet den Lauf.
4. App-Wechsel mitten im Lauf → „zu spät“.
5. Mitten im Lauf neu laden → eigene Hülle mit „Neu geladen — dein Lauf wird markiert.“, neues Halten, Lauf; in der Auswertung das Zeichen ↻.
6. Seite scrollt während des Laufs nicht; nach dem Lauf wieder.
7. **Tap-Ziele im Querformat (8 Spalten):** die Spec rechnet 45 px bei 360 px Feldbreite. Randlos in der Karte ist das Feld auf einem 360-px-Handy etwa 328 px breit, also rund **41 px** je Kachel — unter der 44-px-Grenze aus `frontend-ui.md`. Messen und berichten; die Entscheidung (hinnehmen, Seitenrand des Shells für das Brett aufheben, oder Querformat auf 7 Spalten) liegt beim Nutzer.
8. Auswertung: Foto ganz, Tabelle mit „—“ und den Zeichen, Kurve; Zeile antippen hebt die Linie hervor; Scrubben umrandet die richtige und rot die falschen Kacheln mit Punkten.
