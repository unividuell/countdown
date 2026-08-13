# Das Lab zieht mit — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Game Lab läuft nicht mehr *neben* dem Spiel-Framework, sondern **durch** es — dieselben Klassen, dieselbe Vergabe, dieselbe Sichtbarkeitsregel — und bekommt dabei den Phasen-Wähler, ohne den Phase 2 von Hand nicht beurteilbar ist.

**Architecture:** Der Spiel-Vertrag zieht aus `game.internal` ins Basis-Package `game`, weil er ab jetzt einen Konsumenten außerhalb hat. `gamelab` hängt an `game`, benutzt `GameCatalog`/`GameTypeHandle`/`GameRandom`/`awardFor`/`pointsFor` und hält von sich aus nur noch das, was der echten Runde fehlt: die Tabelle. Eine Lab-Runde wird **gewählt** statt materialisiert — Spieltyp + Seed + Phase — und friert `params` und `award` danach genauso ein, wie `round_games` es täte. `LabGame`, `GuessHueLabGame`, `SampleLabGame` und der Sichtbarkeits-Schalter fallen weg; im Frontend fällt das Attrappen-Spiel mit, und der Phasen-Wähler kommt hinzu.

**Tech Stack:** Backend: Kotlin 2.4 · Spring Boot 4.1 · Spring Modulith 2.1 · Jackson 3 (`tools.jackson`) · JUnit 5 + kotest matchers + mockk + Testcontainers. Frontend: Vite 8 · Vue 3 · TypeScript (strict) · Vue Router 5 (file-based) · Tailwind v4 · Vitest · pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-11-round-game-selection-design.md`](../specs/2026-08-11-round-game-selection-design.md) — Abschnitte *Das Lab zieht mit*, *Sichtbarkeit: kein Schalter*, *Der Spiel-Vertrag*, *Phasen wandern in die Params*, *Punkte sind ein Cache*, sowie *Umsetzungsschnitt* Punkt 4. Dazu die Lab-Spec [`2026-08-08-game-lab-design.md`](../specs/2026-08-08-game-lab-design.md), deren `LabGame`-Vertrag hier eingelöst wird („eine Vermutung, kein Vertrag — sie wird sich am ersten echten Spiel ändern“).

**Baut auf Plan 3** ([`2026-08-12-game-playing.md`](2026-08-12-game-playing.md)), der als ungemergeter Vorgänger-Branch unter diesem liegt: `game.round_plays`, `GameRandom`, `judge`/`solution`, `Award`/`awardFor`/`pointsFor`, `RoundScoring`, `PlayService`, echte Standings.

## Global Constraints

- **Der Vertrag zieht um, das Spiel nicht.** Nach `…core.game` (Basis-Package) wandern genau die Deklarationen, die `gamelab` benutzt oder berührt. In `…core.game.internal` bleiben die Spiel-Adapter (`GuessHueGameType` samt seinen Params/Payload/Outcome/Solution), die Runden-Tabellen und -Services (`RoundGame`, Repositories, Stores, `AnnouncementService`, `PlayService`, `RoundScoring`, `RoundResponses`, die DTOs, `windowReasonOf`, `RoundPlayPoints`, `MemberPointsConfiguration`, `StubMemberPoints`) und die Auswahlregel (`GameSelection`, `PastRound`, `DifferentFromPreviousRound`).
- **`gamelab → game`, niemals zurück.** `game` darf das Lab nicht kennen — kein Import, kein Bean, kein Test-Hook. `gamelab` benutzt ausschließlich das Basis-Package von `game`, nie `game.internal`. `ModularityTests.verify()` muss grün bleiben.
- **Zwei-Tor-Werkzeug bleibt:** jedes Lab-Bean trägt `@Profile("!production")` **und** `@ConditionalOnProperty("app.game-lab.enabled")`, ausgeschaltet existieren die Beans nicht, also antwortet der Endpunkt **404, nicht 403**. Der Schlüssel steht in allen drei `application*.yaml` **und** in `core/src/test/resources/application.yaml`.
- **Die Selbstbegrenzung des Stores bleibt:** eine Runde pro (Community, Spieltyp), ohne TTL und ohne Aufräumjob. Neu ist nur, dass **Seed *oder* Phase** die vorige Runde verdrängen.
- **Eine Lab-Runde friert ein wie eine echte:** `params` aus `GameRandom.fromSeed(seed)`, `award` aus `awardFor` — nie erfundene Punkte, nie ein zweiter Zug aus dem Generator für dieselbe Runde.
- **Sichtbarkeit ist eine Invariante, kein Schalter:** die Tipps der anderen erst, wenn der Betrachter selbst getippt hat — unbedingt, serverseitig zurückgehalten. `revealsOthersBeforeGuess` entfällt samt seinem Zweig, seinem Test und seinem Absatz in der Guideline.
- **Feldmengen-Tests bleiben Pflicht** — jetzt auf `GameTypeHandle.present(params)` und `.solution(params)`, nicht mehr auf `LabGame.reveal(seed)`.
- **Named Arguments ab zwei Argumenten** ([kotlin.md](../../../.claude/guidelines/kotlin.md)). Ausnahmen: ein Argument, Varargs, in Java deklarierte Funktionen, trailing Lambda, `infix`. IDs einmal auspacken, dann die `UUID` weitergeben — auch in Tests.
- **Tests Backend:** JUnit 5 als Runner + **kotest matchers** (`shouldBe`, `shouldThrow`, `shouldNotBeNull`, `shouldBeNull`, `shouldHaveSize`, `shouldBeEmpty`, `shouldContainExactly`) — nie `kotlin.test` oder JUnit-Assertions. Integrationstests mit `@Import(TestcontainersConfiguration::class) @SpringBootTest`; Web-Tests mit MockMvc **Kotlin DSL**, jeder POST mit `with(csrf())`.
- **Tests Frontend:** Vitest + `vi` (nicht mockk), happy-dom; `pnpm test`, `pnpm lint` und `pnpm type-check` müssen grün sein ([frontend-testing.md](../../../.claude/guidelines/frontend-testing.md)).
- **Mobile-first** für jedes neue Bedienelement ([frontend-ui.md](../../../.claude/guidelines/frontend-ui.md)): das Lab wird auf dem Telefon benutzt, der Phasen-Wähler muss dort mit dem Daumen bedienbar sein.
- **Sprache:** Code, Kommentare, Testnamen, Commit-Messages **englisch**. Dieser Plan ist deutsch. Deutsche Anzeigetexte nutzen `„…“` — tiefes öffnendes, hohes schließendes Anführungszeichen, nie ein gerades `"` als Schließer.
- **Branch:** `claude/game-lab-consolidation`, aufgesetzt auf dem ungemergeten `claude/game-playing` (stacked PR). PR-Basis ist der Vorgänger-Branch, **nicht** `develop`.

## Was hier eingelöst wird, und warum es jetzt passiert

Die Lab-Spec hat `LabGame` als „eine Vermutung, kein Vertrag“ ausgewiesen und angekündigt, sie werde
sich am ersten echten Spiel ändern. Das ist jetzt fällig, und zwar in die Richtung, die die
Lab-Guideline vorschreibt: **das Lab passt sich an, nie das Spiel.**

Der eigentliche Gewinn ist der **Phasen-Wähler**. `CLOSEST_ONLY` und die wachsende Punktzahl sind von
Hand nur beurteilbar, wenn man Phase 2 herbeischalten kann, ohne eine Community-Schwelle zu verbiegen
— und ein Lab, das durch dieselben Klassen läuft, macht aus der Zusage „was das Lab zeigt, zeigt das
echte Spiel“ eine erzwungene Eigenschaft statt einer Behauptung. Der Test, der diese Scheibe
rechtfertigt, ist deshalb der, in dem eine Lab-Runde in Phase 2 **dieselben Punkte** vergibt wie eine
echte.

Drei Dinge fallen dabei weg, jedes mit eigener Begründung:

- **`SampleLabGame`** war das Beispiel, solange es kein echtes Spiel gab. Jetzt gibt es eins, und ein
  Attrappen-Spiel im echten `GameCatalog` wäre gefährlich: es könnte in einer echten Runde angesagt
  werden. Seine Rolle als Vorlage für den Feldmengen-Test übernimmt `GuessHueGameType`.
- **`revealsOthersBeforeGuess`** war eine Fehlkonstruktion: ein Schalter, dessen richtige Antwort für
  alle Fälle gleich ist, verlagert eine Invariante in einen Review-Punkt je Spiel.
- **`GuessHueLabGame`** war der zweite Adapter für dasselbe Spiel. Zwei Adapter können auseinanderlaufen;
  einer kann es nicht.

---

## File Structure

**Backend — verschoben nach `…core.game` (Basis-Package):**

| Datei (neu) | Inhalt |
|---|---|
| `core/…/game/GameType.kt` | `GameType`, `GamePayload`, `GameOutcome`, `GameSolution`, `Judgement`, `RoundContext` |
| `core/…/game/GameRandom.kt` | `GameRandom` + `independent(SecureRandom)` + **neu** `fromSeed(seed: Int)` |
| `core/…/game/GameCatalog.kt` | `GameCatalog`, `GameTypeHandle` |
| `core/…/game/Awards.kt` | `Phase`, `AwardRule`, `Award`, `awardFor` |
| `core/…/game/Scoring.kt` | `Verdict`, `pointsFor` |
| `core/…/game/GameExceptions.kt` | `InvalidGuessException` (der Vertrag wirft sie, zwei Module fangen sie) |

**Backend — bleibt in `…core.game.internal`:** `GuessHueGameType.kt` (samt `GuessHueParams`, `GuessHuePayload`, `GuessHueOutcome`, `GuessHueSolution`), `GameSelection.kt`, `RoundGame.kt`, `RoundPlay.kt`, die Repositories, `RoundGameStore.kt`, `RoundScoring.kt`, `AnnouncementService.kt`, `PlayService.kt`, `RoundResponses.kt`, `CurrentRound.kt`, `RoundDtos.kt`, `RoundController.kt`, `RoundPlayPoints.kt`, `MemberPointsConfiguration.kt`, `StubMemberPoints.kt`, `Window.kt` (**neu**: `windowReasonOf`, aus `Award.kt` herausgelöst, weil sein `NoGameReason` ein DTO ist), der Rest von `GameExceptions.kt` + `GameExceptionHandler.kt`.

**Backend — `gamelab`:**

| Datei | Änderung |
|---|---|
| `gamelab/LabGame.kt` | **gelöscht** (samt `LabPayload`, `LabOutcome`, `LabSolution`) |
| `gamelab/internal/GuessHueLabGame.kt` | **gelöscht** |
| `gamelab/internal/SampleLabGame.kt` | **gelöscht** |
| `gamelab/internal/LabRoundStore.kt` | hält die gewählte Runde: `seed`, `phase`, `params`, `award` — und Einträge mit Urteil und Punkten |
| `gamelab/internal/LabService.kt` | auf `GameCatalog`/`GameTypeHandle`, Phase als Parameter, Neuauswertung über `pointsFor`, Sichtbarkeit unbedingt |
| `gamelab/internal/LabController.kt` | `phase` als Query-Parameter neben `seed` |
| `gamelab/internal/LabDtos.kt` | `phase`, `points` je Eintrag, `award` in der Antwort |
| `gamelab/internal/LabExceptions.kt` | eigene `InvalidGuessException` **gelöscht** (der Vertrag hat jetzt eine) |
| `gamelab/internal/LabExceptionHandler.kt` | mappt `game.InvalidGuessException` |

**Backend-Tests:** `SampleLabGameTest.kt` und `GuessHueLabGameTest.kt` **gelöscht**; `LabRoundStoreTest`, `LabServiceTest`, `LabControllerTest`, `LabDisabledTest` umgebaut; **neu** `LabPointsParityTest` (Lab-Runde vs. echte Runde in Phase 2).

**Frontend:** siehe Tasks 4 und 5 — Attrappen-Spiel weg, Phasen-Wähler hinzu, Toleranz nullable.

---

## Task 1: Der Vertrag zieht ins Basis-Package

Nach dieser Task liegt alles, was das Lab benutzen wird, in `…core.game` statt in `…core.game.internal` — und sonst hat sich **nichts** geändert. Reiner Umzug, ein Rename, eine neue Fabrik. Kein Verhalten, kein Test-Ergebnis.

**Warum überhaupt:** Plan 2 hat den Vertrag bewusst in `internal` gelegt, weil ihn niemand außerhalb implementierte — „eine veröffentlichte API ohne Konsumenten wäre ein falsches Signal“, und die Spec hat den Umzug für den Fall vorgesehen, dass sich das ändert. Es hat sich geändert: `gamelab` benutzt ihn ab Task 3, und Modulith verbietet den Griff in ein fremdes `internal`. Umgekehrt bleibt drin, was keinen Konsumenten außerhalb hat.

**Files:**
- Move: `core/src/main/kotlin/org/unividuell/countdown/core/game/internal/GameType.kt` → `…/core/game/GameType.kt`
- Move: `…/game/internal/GameRandom.kt` → `…/game/GameRandom.kt`
- Move: `…/game/internal/GameCatalog.kt` → `…/game/GameCatalog.kt`
- Move: `…/game/internal/Scoring.kt` → `…/game/Scoring.kt`
- Create: `…/game/Awards.kt` (aus `game/internal/Award.kt` herausgelöst: `Phase`, `AwardRule`, `Award`, `awardFor`)
- Create: `…/game/internal/Window.kt` (der Rest von `Award.kt`: beide `windowReasonOf`-Überladungen)
- Delete: `…/game/internal/Award.kt`
- Modify: `…/game/internal/GameExceptions.kt` (`InvalidGuessException` zieht nach `game/GameType.kt`)
- Modify: alle Dateien in `game/internal`, die diese Typen benutzen — Imports
- Modify: alle Tests unter `core/src/test/kotlin/org/unividuell/countdown/core/game/` — Imports

**Interfaces:**
- Consumes: nichts Neues.
- Produces (alle im Package `org.unividuell.countdown.core.game`):
  - `interface GamePayload`, `interface GameOutcome`, `interface GameSolution`
  - `data class Judgement(qualifies: Boolean, deviation: Double, outcome: GameOutcome?)`
  - `data class RoundContext(roundNumber: Int, phase: Phase)`
  - `interface GameType<P : Any>` mit `id`, `displayName`, `paramsType`, `draw`, `present`, `judge`, `solution`
  - `class InvalidGuessException(message: String) : RuntimeException`
  - `class GameRandom(solution: SeededRandom, presentation: SeededRandom)` mit `independent(source: SecureRandom)` **und neu** `fromSeed(seed: Int)`
  - `class GameTypeHandle<P : Any>` mit `id`, `displayName`, `draw`, `present`, `judge`, `solution`
  - `class GameCatalog(games: List<GameType<*>>, mapper: ObjectMapper)` mit `ids()`, `handle(id)`
  - `enum class Phase { ONE, TWO }` mit `of(roundNumber, phaseTwoStartRound)` und `of(edition, roundNumber)`
  - `enum class AwardRule { ALL_QUALIFYING, CLOSEST_ONLY }`, `data class Award(rule, points)`, `fun awardFor(roundNumber: Int, phaseTwoStartRound: Int?): Award`
  - `data class Verdict(id: UUID, qualifies: Boolean, deviation: Double)` — **`playId` heißt jetzt `id`** — und `fun pointsFor(award: Award, verdicts: List<Verdict>): Map<UUID, Int>`
- Bleibt in `game.internal`: `fun windowReasonOf(roundNumber: Int, gamesFromRound: Int?, gamesUntilRound: Int): NoGameReason?` und `fun windowReasonOf(edition: CommunityEdition, roundNumber: Int): NoGameReason?`

- [ ] **Step 1: Die vier Dateien verschieben, Package-Zeile anpassen**

```bash
cd core/src/main/kotlin/org/unividuell/countdown/core/game
git mv internal/GameType.kt GameType.kt
git mv internal/GameRandom.kt GameRandom.kt
git mv internal/GameCatalog.kt GameCatalog.kt
git mv internal/Scoring.kt Scoring.kt
```

In allen vier Dateien die erste Zeile von
`package org.unividuell.countdown.core.game.internal` auf
`package org.unividuell.countdown.core.game` ändern. Sonst nichts.

- [ ] **Step 2: `Award.kt` aufteilen**

`…/game/Awards.kt` **neu** — `Phase`, `AwardRule`, `Award`, `awardFor` **wörtlich** aus `game/internal/Award.kt` übernehmen, nur mit `package org.unividuell.countdown.core.game` und dem Import `org.unividuell.countdown.core.community.CommunityEdition`.

`…/game/internal/Window.kt` **neu** — beide `windowReasonOf`-Funktionen wörtlich aus `Award.kt`, mit
`package …game.internal` und den Imports `org.unividuell.countdown.core.community.CommunityEdition`
sowie `org.unividuell.countdown.core.game.NoGameReason`? **Nein** — `NoGameReason` liegt in
`game.internal.RoundDtos.kt` und bleibt dort; im selben Package braucht es keinen Import. Ergänze am
Kopf der Datei diesen KDoc-Satz, damit die Trennung nicht als Willkür gelesen wird:

```kotlin
/**
 * The game window's boundary check. Deliberately **not** in the exposed `Awards.kt` next to [Phase]
 * and `awardFor`, although all three are round arithmetic: this one answers with a [NoGameReason],
 * which is a wire enum of the announcement, and the lab has no window at all. Exposing it would
 * publish a DTO for a consumer that does not exist.
 */
```

Danach `git rm core/src/main/kotlin/org/unividuell/countdown/core/game/internal/Award.kt`.

- [ ] **Step 3: `InvalidGuessException` zum Vertrag ziehen**

In `game/internal/GameExceptions.kt` die Klasse `InvalidGuessException` **entfernen** und wörtlich (samt
KDoc) an das Ende von `game/GameType.kt` setzen — sie gehört zu der Methode, die sie wirft:

```kotlin
/**
 * The game rejected the guess's shape or range → 400. Thrown by [GameType.judge] before anything is
 * persisted: a typo must not consume the player's single attempt. Part of the contract, and therefore
 * exposed — the round's controller and the lab's both map it.
 */
class InvalidGuessException(message: String) : RuntimeException(message)
```

- [ ] **Step 4: `Verdict.playId` in `id` umbenennen**

In `game/Scoring.kt`:

```kotlin
/**
 * One stored guess, reduced to what an award rule is allowed to see. [id] is the caller's own key —
 * the play row's id in a real round, the tester's user id in the lab — because the arithmetic does
 * not care which.
 */
data class Verdict(val id: UUID, val qualifies: Boolean, val deviation: Double)
```

und in `pointsFor` `it.playId` → `it.id`. Die beiden Aufrufstellen ziehen mit:
`game/internal/RoundScoring.kt` (`playId = requireNotNull(play.id)` → `id = requireNotNull(play.id)`)
und `core/src/test/kotlin/org/unividuell/countdown/core/game/ScoringTest.kt` (alle `playId =` → `id =`).

- [ ] **Step 5: `GameRandom.fromSeed` ergänzen**

In `game/GameRandom.kt`, in das `companion object` neben `independent`:

```kotlin
        /**
         * Both streams from one visible seed — the lab's constructor, where the seed rides in the URL
         * and nothing is secret anyway. The presentation seed is derived so that one number
         * reproduces a whole round; in production that derivation would be exactly the mistake
         * [independent] avoids, which is why the two factories are separate and named for their use.
         */
        fun fromSeed(seed: Int) = GameRandom(
            solution = SeededRandom.fromSeed(seed),
            presentation = SeededRandom.fromSeed(seed xor PRESENTATION_SALT),
        )

        /** Arbitrary, fixed: it only has to make the two derived streams differ. */
        private const val PRESENTATION_SALT = 0x5F5F5F5F.toInt()
```

Das ist wörtlich die Ableitung, die `GuessHueLabGame` heute inline benutzt (`seed xor 0x5F5F5F5F.toInt()`)
— sie zieht hierher, damit Task 3 sie nicht kopieren muss.

- [ ] **Step 6: Imports nachziehen, bis es kompiliert**

Run: `cd core && ./mvnw -q test-compile`

Jede Datei, die jetzt scheitert, braucht einen Import aus `org.unividuell.countdown.core.game` statt
`…game.internal`. Erwartete Kandidaten (Produktion): `GuessHueGameType.kt`, `GameSelection.kt`,
`AnnouncementService.kt`, `PlayService.kt`, `RoundScoring.kt`, `RoundGame.kt`, `RoundGameStore.kt`,
`RoundResponses.kt`, `CurrentRound.kt`, `RoundDtos.kt`, `RoundPlayPoints.kt`,
`MemberPointsConfiguration.kt`, `GameExceptionHandler.kt`. Tests: `AwardTest.kt`, `ScoringTest.kt`,
`GameCatalogTest.kt`, `GuessHueGameTypeTest.kt`, `RoundScoringTest.kt`, `RoundGameRepositoryTest.kt`,
`RoundLockTest.kt`, `AnnouncementServiceTest.kt`, `AnnouncementServiceNoGameTypeTest.kt`,
`PlayServiceTest.kt`, `RoundControllerTest.kt`, `RoundPlayPointsTest.kt`.

**Nur Imports und Package-Zeilen.** Ändert sich in einer dieser Dateien eine Signatur, ein Name oder
ein Kommentar, ist das ein Fehler in diesem Schritt — mit der einen Ausnahme aus Step 4.

- [ ] **Step 7: Ganze Suite laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS, dieselbe Testzahl wie vorher (420, 1 Skip). `ModularityTests` grün: `game` exponiert jetzt
mehr, aber niemand zeigt zurück.

- [ ] **Step 8: Committen**

```bash
git add -A core/src/main/kotlin/org/unividuell/countdown/core/game core/src/test/kotlin/org/unividuell/countdown/core/game
git commit -m "refactor(game): expose the game contract, now that the lab consumes it"
```

---

## Task 2: Das Lab läuft durch das Framework

Nach dieser Task gibt es `LabGame`, `GuessHueLabGame` und `SampleLabGame` nicht mehr. Das Lab wählt eine Runde (Spieltyp + Seed + Phase), friert `params` und `award` ein, urteilt mit `judge`, vergibt mit `pointsFor` und hält die Tipps der anderen unbedingt zurück, bis der Betrachter selbst getippt hat.

**Warum Store, Service und Controller **eine** Task sind:** dazwischen kompiliert das Modul nicht. Der Store kann seine neue Form nicht haben, solange der Service noch `LabGame` füttert, und der Service kann nicht auf `GameCatalog` umziehen, solange der Store Seeds statt Runden nimmt. Ein Zwischenstand wäre eine Attrappe, die niemand behalten will — also ein Commit.

**Files:**
- Modify: `core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/LabRoundStore.kt`
- Modify: `…/gamelab/internal/LabService.kt`
- Modify: `…/gamelab/internal/LabController.kt`
- Modify: `…/gamelab/internal/LabDtos.kt`
- Modify: `…/gamelab/internal/LabExceptions.kt` (eigene `InvalidGuessException` weg)
- Modify: `…/gamelab/internal/LabExceptionHandler.kt` (mappt `game.InvalidGuessException`)
- Delete: `…/gamelab/LabGame.kt`, `…/gamelab/internal/GuessHueLabGame.kt`, `…/gamelab/internal/SampleLabGame.kt`
- Delete: `core/src/test/kotlin/…/gamelab/GuessHueLabGameTest.kt`, `…/gamelab/SampleLabGameTest.kt`
- Test: `…/gamelab/LabRoundStoreTest.kt`, `…/gamelab/LabServiceTest.kt`, `…/gamelab/LabControllerTest.kt`, `…/gamelab/LabDisabledTest.kt`

**Interfaces:**
- Consumes: `game.GameCatalog.ids()` / `.handle(id): GameTypeHandle<*>?`, `GameTypeHandle.id`/`.displayName`/`.draw(random, context)`/`.present(params)`/`.judge(params, guess)`/`.solution(params)`, `game.GameRandom.fromSeed(seed)`, `game.RoundContext(roundNumber, phase)`, `game.Phase`, `game.Award`, `game.AwardRule`, `game.awardFor(roundNumber, phaseTwoStartRound)`, `game.Judgement`, `game.GameOutcome`, `game.GamePayload`, `game.GameSolution`, `game.Verdict`, `game.pointsFor`, `game.InvalidGuessException`, `iam.UserQuery`, `iam.Avatar`, `community.CommunityQuery`, `community.MembershipQuery`.
- Produces:
  - `LabRound(seed: Int, phase: Phase, params: JsonNode, award: Award)`
  - `LabEntry(userId: UUID, guess: JsonNode, qualifies: Boolean, deviation: Double, outcome: GameOutcome?, points: Int, at: Instant)`
  - `LabRoundSnapshot(round: LabRound, entries: List<LabEntry>, tookOverRound: Boolean)`
  - `LabRoundStore.open/record/resetRound/forget`, alle mit `round: LabRound` statt `seed: Int`
  - `LabService.open/guess/resetRound/forgetMine`, alle mit `phase: Phase` neben `seed: Int`
  - `LabEntryDto(userId, username, avatar, guess, outcome, points, at)`
  - `LabRoundResponse(seed, phase, game, displayName, awardRule, awardPoints, payload, solution, me, others, tookOverRound)`

- [ ] **Step 1: Den Store-Test schreiben**

In `LabRoundStoreTest` einen Fixture-Kopf einführen und die bestehenden zehn Tests darauf ziehen
(`seed = 42` → `round = round(seed = 42)`, `snapshot.seed` → `snapshot.round.seed`,
`outcome = null` → `judgement = judgement(qualifies = true, deviation = 0.0)`):

```kotlin
    private val mapper = JsonMapper.builder().build()

    private fun round(seed: Int, phase: Phase = Phase.ONE, rule: AwardRule = AwardRule.ALL_QUALIFYING) =
        LabRound(
            seed = seed,
            phase = phase,
            params = mapper.readTree("""{"seed":$seed}"""),
            award = Award(rule = rule, points = if (rule == AwardRule.ALL_QUALIFYING) 1 else 7),
        )

    private fun judgement(qualifies: Boolean, deviation: Double) =
        Judgement(qualifies = qualifies, deviation = deviation, outcome = null)
```

Vier neue Tests:

```kotlin
    @Test
    fun `a different phase evicts the round just like a different seed does`() {
        val community = UUID.randomUUID()
        store.open(communityId = community, gameId = "guess-hue", round = round(seed = 1))

        val switched = store.open(
            communityId = community, gameId = "guess-hue",
            round = round(seed = 1, phase = Phase.TWO, rule = AwardRule.CLOSEST_ONLY),
        )

        switched.tookOverRound shouldBe true
        switched.round.phase shouldBe Phase.TWO
        switched.entries.shouldBeEmpty()
    }

    @Test
    fun `the round that was stored first is the one that stays`() {
        // "Frozen" means the stored draw wins over anything a later caller offers for the same key:
        // a round must not change under a player who is in the middle of it.
        val community = UUID.randomUUID()
        val first = store.open(communityId = community, gameId = "guess-hue", round = round(seed = 7))

        val again = store.open(
            communityId = community, gameId = "guess-hue",
            round = LabRound(
                seed = 7, phase = Phase.ONE,
                params = mapper.readTree("""{"seed":"tampered"}"""),
                award = Award(rule = AwardRule.CLOSEST_ONLY, points = 99),
            ),
        )

        again.round shouldBe first.round
        again.tookOverRound shouldBe false
    }

    @Test
    fun `phase one gives every qualifying guess the stake`() {
        val community = UUID.randomUUID()
        val r = round(seed = 3)
        val hit = UUID.randomUUID()
        val miss = UUID.randomUUID()
        store.record(
            communityId = community, gameId = "g", round = r, userId = hit,
            guess = mapper.readTree("""{"hue":1}"""),
            judgement = judgement(qualifies = true, deviation = 4.0),
        )

        val result = store.record(
            communityId = community, gameId = "g", round = r, userId = miss,
            guess = mapper.readTree("""{"hue":2}"""),
            judgement = judgement(qualifies = false, deviation = 40.0),
        )

        val entries = (result as RecordResult.Recorded).snapshot.entries.associateBy { it.userId }
        entries.getValue(hit).points shouldBe 1
        entries.getValue(miss).points shouldBe 0
    }

    @Test
    fun `phase two moves the stake to the later, better guess`() {
        // The reason the lab exists in this shape: CLOSEST_ONLY is only judgeable by hand if one can
        // watch the points move. Same arithmetic as a real round — `pointsFor`, nothing local.
        val community = UUID.randomUUID()
        val r = round(seed = 3, phase = Phase.TWO, rule = AwardRule.CLOSEST_ONLY)
        val early = UUID.randomUUID()
        val late = UUID.randomUUID()
        store.record(
            communityId = community, gameId = "g", round = r, userId = early,
            guess = mapper.readTree("""{"hue":1}"""),
            judgement = judgement(qualifies = true, deviation = 12.0),
        )

        val result = store.record(
            communityId = community, gameId = "g", round = r, userId = late,
            guess = mapper.readTree("""{"hue":2}"""),
            judgement = judgement(qualifies = true, deviation = 3.0),
        )

        val entries = (result as RecordResult.Recorded).snapshot.entries.associateBy { it.userId }
        entries.getValue(early).points shouldBe 0
        entries.getValue(late).points shouldBe 7
    }
```

Imports ergänzen: `org.unividuell.countdown.core.game.Award`, `…game.AwardRule`, `…game.Judgement`,
`…game.Phase`, `io.kotest.matchers.collections.shouldBeEmpty`, `tools.jackson.databind.json.JsonMapper`.

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `cd core && ./mvnw test -Dtest='LabRoundStoreTest'`
Expected: FAIL, `LabRound` existiert nicht (Kompilierfehler).

- [ ] **Step 3: Den Store umbauen**

In `LabRoundStore.kt` die drei Typen am Kopf ersetzen:

```kotlin
/**
 * The round a lab session is playing: **chosen**, not materialised, but frozen exactly like a real one
 * once chosen. [params] is the drawn round including its solution, [award] the stake its phase implies
 * — both from the same functions the real round uses, so what the lab shows is what the game shows.
 */
data class LabRound(val seed: Int, val phase: Phase, val params: JsonNode, val award: Award)

/**
 * One tester's guess, with the game's verdict and the points the framework awarded for it.
 *
 * [points] is not nullable here, unlike the real game's column: a lab entry exists only because
 * somebody guessed, and the round is re-scored in the same call — there is no "revealed but not
 * guessed" state to keep apart.
 */
data class LabEntry(
    val userId: UUID,
    val guess: JsonNode,
    val qualifies: Boolean,
    val deviation: Double,
    val outcome: GameOutcome?,
    val points: Int,
    /** Display order only — never a score. Timing is deliberately out of scope for the lab. */
    val at: Instant,
)

/** The state of a lab round after an operation, plus whether that operation displaced another round. */
data class LabRoundSnapshot(
    val round: LabRound,
    val entries: List<LabEntry>,
    val tookOverRound: Boolean,
)
```

Die Klasse selbst — `Round` hält die eingefrorene Runde, die Verdrängung prüft Seed **und** Phase, und
`record` wertet die Runde neu aus:

```kotlin
    private class Round(val frozen: LabRound) {
        val entries = ConcurrentHashMap<UUID, LabEntry>()
        /** Insertion order for the entry list; ConcurrentHashMap has none, and `at` can collide. */
        val sequence = ConcurrentHashMap<UUID, Long>()
        val counter = AtomicLong()
    }

    private val rounds = ConcurrentHashMap<Key, Round>()

    fun open(communityId: UUID, gameId: String, round: LabRound): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        return stored.snapshot(tookOver)
    }

    fun record(
        communityId: UUID,
        gameId: String,
        round: LabRound,
        userId: UUID,
        guess: JsonNode,
        judgement: Judgement,
    ): RecordResult {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        val entry = LabEntry(
            userId = userId,
            guess = guess,
            qualifies = judgement.qualifies,
            deviation = judgement.deviation,
            outcome = judgement.outcome,
            // Overwritten by the rescore below. A lone entry is scored by the same function as a full
            // round rather than by a shortcut, so the two can never disagree.
            points = 0,
            at = clock.instant(),
        )
        // putIfAbsent, not put: one guess per player and round is the real game's rule, enforced here
        // so the lab exercises it. Repeating a round is what the two reset actions are for.
        if (stored.entries.putIfAbsent(userId, entry) != null) return RecordResult.AlreadyGuessed
        stored.sequence[userId] = stored.counter.getAndIncrement()
        stored.rescore()
        return RecordResult.Recorded(stored.snapshot(tookOver))
    }

    fun resetRound(communityId: UUID, gameId: String, round: LabRound): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        stored.entries.clear()
        stored.sequence.clear()
        return stored.snapshot(tookOver)
    }

    fun forget(communityId: UUID, gameId: String, round: LabRound, userId: UUID): LabRoundSnapshot {
        val (stored, tookOver) = openRound(Key(communityId, gameId), round)
        stored.entries.remove(userId)
        stored.sequence.remove(userId)
        // Whoever leaves changes the standings of whoever stays: under CLOSEST_ONLY the best remaining
        // guess takes the stake. Same reason the real game re-evaluates on every write.
        stored.rescore()
        return stored.snapshot(tookOver)
    }

    /**
     * Re-score the whole round, exactly like the real game's re-evaluation: `points` is a function of
     * the frozen award rule and **every** verdict of the round, which is why "a later guess takes an
     * earlier one's points away" needs no mechanism for taking points away.
     */
    private fun Round.rescore() {
        val points = pointsFor(
            award = frozen.award,
            verdicts = entries.values.map {
                Verdict(id = it.userId, qualifies = it.qualifies, deviation = it.deviation)
            },
        )
        for ((userId, entry) in entries) {
            entries[userId] = entry.copy(points = points[userId] ?: 0)
        }
    }

    private fun openRound(key: Key, round: LabRound): Pair<Round, Boolean> {
        var tookOver = false
        val stored = rounds.compute(key) { _, existing ->
            // Seed *and* phase are the round key now: switching the phase chooses a different round,
            // with a different award, so the previous one cannot be kept.
            if (existing != null &&
                existing.frozen.seed == round.seed &&
                existing.frozen.phase == round.phase
            ) {
                existing
            } else {
                tookOver = existing != null
                Round(round)
            }
        }!!
        return stored to tookOver
    }

    private fun Round.snapshot(tookOver: Boolean) = LabRoundSnapshot(
        round = frozen,
        entries = entries.values.sortedBy { sequence[it.userId] ?: Long.MAX_VALUE },
        tookOverRound = tookOver,
    )
```

Imports: `org.unividuell.countdown.core.game.Award`, `…game.GameOutcome`, `…game.Judgement`,
`…game.Phase`, `…game.Verdict`, `…game.pointsFor`; der Import von `gamelab.LabOutcome` entfällt.

- [ ] **Step 4: Die DTOs erweitern**

`LabDtos.kt` vollständig:

```kotlin
package org.unividuell.countdown.core.gamelab.internal

import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.GameOutcome
import org.unividuell.countdown.core.game.GamePayload
import org.unividuell.countdown.core.game.GameSolution
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.iam.Avatar
import tools.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

/**
 * [points] is what the framework awarded, not what the game judged: `qualifies` and `deviation` stay
 * on the server here for the same reason they do in the real round — they are comparison values, and
 * what a tester needs to see is the game-shaped [outcome] plus the number.
 */
data class LabEntryDto(
    val userId: UUID,
    val username: String,
    val avatar: Avatar,
    val guess: JsonNode,
    val outcome: GameOutcome?,
    val points: Int,
    val at: Instant,
)

/**
 * Every endpoint answers with this, so the client can redraw after any action without a second
 * request. [tookOverRound] is the only thing the client cannot work out for itself — it does not know
 * which round the server had stored before this call. [solution] is the only thing it must never work
 * out for itself.
 *
 * [awardRule] and [awardPoints] are shown on purpose: the phase selector is only useful if the tester
 * can see which rule they just switched to and what it pays.
 */
data class LabRoundResponse(
    val seed: Int,
    val phase: Phase,
    val game: String,
    val displayName: String,
    val awardRule: AwardRule,
    val awardPoints: Int,
    val payload: GamePayload,
    /** Filled only once the viewer has an entry of their own; `null` in front of that gate. */
    val solution: GameSolution?,
    val me: LabEntryDto?,
    val others: List<LabEntryDto>,
    val tookOverRound: Boolean,
)
```

- [ ] **Step 5: Den Service umbauen**

`LabService.kt` vollständig — `games: List<LabGame>` wird `catalog: GameCatalog`, die Phase kommt als
Parameter, die Runde wird gewählt statt aufgedeckt, und die Sichtbarkeit ist unbedingt:

```kotlin
package org.unividuell.countdown.core.gamelab.internal

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Service
import org.unividuell.countdown.core.community.CommunityQuery
import org.unividuell.countdown.core.community.MembershipQuery
import org.unividuell.countdown.core.game.Award
import org.unividuell.countdown.core.game.GameCatalog
import org.unividuell.countdown.core.game.GameRandom
import org.unividuell.countdown.core.game.GameTypeHandle
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.RoundContext
import org.unividuell.countdown.core.game.awardFor
import org.unividuell.countdown.core.iam.Avatar
import org.unividuell.countdown.core.iam.UserQuery
import tools.jackson.databind.JsonNode
import java.util.UUID

/**
 * The lab's only orchestration: resolve the community the same way every other module does, look up
 * the game in the **real** catalogue, choose the round, and assemble the response.
 *
 * What the lab adds to a real round is a choice where the real one has a clock: seed and phase come
 * from the URL instead of from the community's grid. Everything after that choice — the draw, the
 * payload, the verdict, the award rule, the re-evaluation, the solution gate — is the framework's,
 * not the lab's. That is what makes „what the lab shows is what the game shows“ a property rather
 * than a promise.
 *
 * Community context comes from the `community` module's PUBLIC api (`CommunityQuery` +
 * `MembershipQuery`), never from `community.internal` — `CountdownService` is the precedent.
 */
@Service
@Profile("!production")
@ConditionalOnProperty("app.game-lab.enabled")
class LabService(
    private val communities: CommunityQuery,
    private val memberships: MembershipQuery,
    private val users: UserQuery,
    private val store: LabRoundStore,
    private val catalog: GameCatalog,
) {

    fun open(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(slug, gameId, userId, isSuperAdmin)
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        return respond(
            handle = handle,
            snapshot = store.open(communityId = communityId, gameId = gameId, round = round),
            me = userId,
        )
    }

    fun guess(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
        guess: JsonNode,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(slug, gameId, userId, isSuperAdmin)
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        // judge() first: an invalid guess must not consume the player's single attempt. The stored
        // round's params are what is judged against, not the freshly drawn ones — same rule as the
        // real game, where the row is the authority.
        val stored = store.open(communityId = communityId, gameId = gameId, round = round)
        val judgement = handle.judge(params = stored.round.params, guess = guess)
        val result = store.record(
            communityId = communityId, gameId = gameId, round = stored.round,
            userId = userId, guess = guess, judgement = judgement,
        )
        return when (result) {
            is RecordResult.Recorded -> respond(handle = handle, snapshot = result.snapshot, me = userId)
            RecordResult.AlreadyGuessed -> throw AlreadyGuessedException()
        }
    }

    fun resetRound(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(slug, gameId, userId, isSuperAdmin)
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        return respond(
            handle = handle,
            snapshot = store.resetRound(communityId = communityId, gameId = gameId, round = round),
            me = userId,
        )
    }

    fun forgetMine(
        slug: String,
        gameId: String,
        seed: Int,
        phase: Phase,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): LabRoundResponse {
        val (communityId, handle) = resolve(slug, gameId, userId, isSuperAdmin)
        val round = chooseRound(handle = handle, seed = seed, phase = phase)
        return respond(
            handle = handle,
            snapshot = store.forget(
                communityId = communityId, gameId = gameId, round = round, userId = userId,
            ),
            me = userId,
        )
    }

    private fun resolve(
        slug: String,
        gameId: String,
        userId: UUID,
        isSuperAdmin: Boolean,
    ): Pair<UUID, GameTypeHandle<*>> {
        val community = communities.findBySlug(slug) ?: throw LabAccessDeniedException()
        val id = requireNotNull(community.id) { "a persisted community always has an id" }
        if (!isSuperAdmin && !memberships.isActiveMember(communityId = id, userId = userId)) {
            throw LabAccessDeniedException()
        }
        val handle = catalog.handle(gameId) ?: throw UnknownLabGameException("no game '$gameId'")
        return id to handle
    }

    /**
     * The lab's substitute for a round grid. `awardFor` decides the rule and the stake — the lab picks
     * the phase, never the points — and it needs a round number to do that, so the lab pretends every
     * round is [LAB_ROUND_NUMBER]. In phase two the threshold sits on that same number, which is the
     * first round of phase two and therefore its lowest stake; the number is arbitrary, the fact that
     * it comes out of the real function is not.
     */
    private fun chooseRound(handle: GameTypeHandle<*>, seed: Int, phase: Phase): LabRound {
        val award: Award = awardFor(
            roundNumber = LAB_ROUND_NUMBER,
            phaseTwoStartRound = if (phase == Phase.TWO) LAB_ROUND_NUMBER else null,
        )
        return LabRound(
            seed = seed,
            phase = phase,
            params = handle.draw(
                random = GameRandom.fromSeed(seed),
                context = RoundContext(roundNumber = LAB_ROUND_NUMBER, phase = phase),
            ),
            award = award,
        )
    }

    private fun respond(
        handle: GameTypeHandle<*>,
        snapshot: LabRoundSnapshot,
        me: UUID,
    ): LabRoundResponse {
        val mine = snapshot.entries.firstOrNull { it.userId == me }
        // Withheld, not filtered client-side, and unconditional: there is no game for which showing
        // another tester's guess before one's own is right, so there is no switch to get it wrong
        // with. A payload the browser never receives cannot be read out of the network tab either.
        val visible = if (mine == null) emptyList() else snapshot.entries.filter { it.userId != me }
        val byUser = users.findAllById((visible + listOfNotNull(mine)).map { it.userId })
            .associateBy { it.id }
        // A tester whose user row vanished mid-session drops out of the list rather than taking the
        // whole page down with them.
        fun dtoOf(entry: LabEntry) = byUser[entry.userId]?.let { user ->
            LabEntryDto(
                userId = entry.userId,
                username = user.username,
                avatar = Avatar.of(user),
                guess = entry.guess,
                outcome = entry.outcome,
                points = entry.points,
                at = entry.at,
            )
        }

        return LabRoundResponse(
            seed = snapshot.round.seed,
            phase = snapshot.round.phase,
            game = handle.id,
            displayName = handle.displayName,
            awardRule = snapshot.round.award.rule,
            awardPoints = snapshot.round.award.points,
            payload = handle.present(snapshot.round.params),
            // The one condition, evaluated server-side: the viewer has an entry of their own.
            // Whoever deletes their guess stands in front of the gate again.
            solution = if (mine == null) null else handle.solution(snapshot.round.params),
            me = mine?.let(::dtoOf),
            others = visible.mapNotNull(::dtoOf),
            tookOverRound = snapshot.tookOverRound,
        )
    }

    private companion object {
        /**
         * The round every lab round pretends to be. The lab has no grid, and `awardFor` needs a
         * number; which number it is only shifts phase two's stake, and the lab is about the rule.
         */
        const val LAB_ROUND_NUMBER = 12
    }
}
```

**Der `init`-Block mit der Duplikat-Prüfung entfällt** — `GameCatalog` prüft doppelte Ids selbst und
lässt den Boot scheitern. Zwei Prüfungen derselben Invariante wären eine zu viel; der Test dafür wandert
nach `GameCatalogTest` (existiert dort schon: `a duplicate id fails the boot rather than shadowing a game`).

- [ ] **Step 6: Controller, Exceptions und Handler nachziehen**

In `LabController.kt` bekommt jede der vier Methoden `@RequestParam(defaultValue = "ONE") phase: Phase`
neben `@RequestParam seed: Int` und gibt es an den Service weiter. Ergänze den Klassen-KDoc um einen Satz:

```kotlin
 * Seed **and** phase ride on every call: together they are the round key, and the store's
 * auto-eviction hangs off exactly that pair. `phase` defaults to `ONE`, so a link without it still
 * opens a phase-one round.
```

Beispiel für `open` (die anderen drei analog):

```kotlin
    @GetMapping
    fun open(
        @AuthenticationPrincipal me: AuthenticatedUser,
        @PathVariable slug: String,
        @PathVariable game: String,
        @RequestParam seed: Int,
        @RequestParam(defaultValue = "ONE") phase: Phase,
    ) = service.open(
        slug = slug, gameId = game, seed = seed, phase = phase,
        userId = me.id, isSuperAdmin = me.isSuperAdmin,
    )
```

In `LabExceptions.kt` die eigene `InvalidGuessException` **löschen** (der Vertrag hat jetzt eine); die
anderen drei bleiben. In `LabExceptionHandler.kt` den Import auf
`org.unividuell.countdown.core.game.InvalidGuessException` umstellen — der `@ExceptionHandler` selbst
bleibt unverändert, er fängt jetzt die des Vertrags.

- [ ] **Step 7: Die alten Spiele und ihre Tests löschen**

```bash
git rm core/src/main/kotlin/org/unividuell/countdown/core/gamelab/LabGame.kt
git rm core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/GuessHueLabGame.kt
git rm core/src/main/kotlin/org/unividuell/countdown/core/gamelab/internal/SampleLabGame.kt
git rm core/src/test/kotlin/org/unividuell/countdown/core/gamelab/GuessHueLabGameTest.kt
git rm core/src/test/kotlin/org/unividuell/countdown/core/gamelab/SampleLabGameTest.kt
```

Was diese Tests geprüft haben, prüft jetzt `GuessHueGameTypeTest` (Feldmengen von `present` und
`solution`, Toleranz je Phase, Urteil, Ablehnung ungültiger Tipps) — deshalb entfallen sie, statt umzuziehen.
Sollte dabei eine Zusicherung verloren gehen, die dort **nicht** existiert, ist das ein Fund: melde ihn,
statt den Test stillschweigend zu löschen.

- [ ] **Step 8: `LabServiceTest` umbauen**

Der Test behält seine Struktur (`@SpringBootTest` mit dem echten Kontext), tauscht aber die Fakes: statt
zweier `LabGame`-Attrappen gibt es keine — das Lab hat jetzt genau die Spiele des echten Katalogs, also
`guess-hue`. Die Tests, die den Schalter oder das Attrappen-Spiel geprüft haben, entfallen; die übrigen
werden auf die neue Signatur gezogen. Konkret:

- **Entfällt:** `two games sharing an id fail the boot` (jetzt `GameCatalogTest`),
  `a game that hides the others shows none of them before I have guessed`,
  `a game that hides the others shows them once I have guessed`,
  `the sample game keeps showing the others before I have guessed`,
  `a game that does not score stores an entry without an outcome` (jedes Spiel urteilt jetzt),
  `a game that reveals nothing keeps answering null after a guess` (der Default `solution = null` ist
  in `GameCatalogTest` abgedeckt).
- **Bleibt, mit `phase = Phase.ONE` ergänzt und `gameId = "guess-hue"`:** `open returns the revealed
  payload and no entry of my own`, `an unknown community is a 404-shaped denial`, `a non-member is
  denied the same way`, `a super-admin who is not a member is let in`, `an unknown game id is
  rejected`, `a guess lands as my own entry, carrying my name and avatar`, `another tester's guess
  shows up under others`, `an invalid guess is rejected without consuming the player's one attempt`,
  `a second guess is refused`, `resetting the round clears everyone, forgetting mine clears only me`,
  `opening a different seed reports the takeover`, `the solution stays behind the guess`, `the
  solution arrives with my own guess`, `deleting my guess puts me back in front of the gate`, `a
  super-admin who is not a member gets no solution either`.
- **Neu:** die drei Zusicherungen, die diese Scheibe erst schafft:

```kotlin
    @Test
    fun `others stay hidden until I have guessed, for every game there is`() {
        // The switch is gone, so this is no longer a per-game question: it holds for whatever the
        // catalogue contains. Iterating the catalogue is what keeps it true when a game is added.
        val (community, mine) = aCommunityWithTwoMembers()
        for (gameId in catalog.ids()) {
            service.guess(
                slug = community.slug, gameId = gameId, seed = 42, phase = Phase.ONE,
                userId = mine.other, isSuperAdmin = false, guess = aValidGuessFor(gameId),
            )

            val before = service.open(
                slug = community.slug, gameId = gameId, seed = 42, phase = Phase.ONE,
                userId = mine.me, isSuperAdmin = false,
            )

            before.others.shouldBeEmpty()
            before.solution.shouldBeNull()
        }
    }

    @Test
    fun `switching the phase draws a different round and changes the rule`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val one = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        val two = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 42, phase = Phase.TWO,
            userId = mine.me, isSuperAdmin = false,
        )

        one.awardRule shouldBe AwardRule.ALL_QUALIFYING
        one.awardPoints shouldBe 1
        two.awardRule shouldBe AwardRule.CLOSEST_ONLY
        two.tookOverRound shouldBe true
    }

    @Test
    fun `the same seed and phase give the same round twice`() {
        val (community, mine) = aCommunityWithTwoMembers()

        val first = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 4711, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )
        val second = service.open(
            slug = community.slug, gameId = "guess-hue", seed = 4711, phase = Phase.ONE,
            userId = mine.me, isSuperAdmin = false,
        )

        second.payload shouldBe first.payload
        second.tookOverRound shouldBe false
    }
```

`aValidGuessFor(gameId)` ist ein kleiner Helfer im Test, der für jeden Katalog-Eintrag einen gültigen
Tipp liefert — heute genau einer:

```kotlin
    /** One valid guess per catalogue entry. A new game adds a branch here and the loop above covers it. */
    private fun aValidGuessFor(gameId: String): JsonNode = when (gameId) {
        "guess-hue" -> mapper.readTree("""{"hue":123.5}""")
        else -> error("no lab test guess for game '$gameId' — add one when the game is added")
    }
```

Halte dich beim Umbau der bleibenden Tests an ihre vorhandenen Fixtures; erfinde keine neuen Helfer,
außer den beiden hier gezeigten.

- [ ] **Step 9: `LabControllerTest` und `LabDisabledTest` nachziehen**

`LabControllerTest` mockt `LabService` (`@MockkBean`) — jeder `every { … }` bekommt `phase = Phase.ONE`
in den Argumenten, und die gestubbte `LabRoundResponse` bekommt die neuen Felder. Dazu **ein neuer Test**,
der die Übergabe des Parameters festnagelt:

```kotlin
    @Test
    fun `GET passes the phase through, and defaults it to one`() {
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.TWO,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(phase = Phase.TWO)
        every {
            service.open(
                slug = "team", gameId = "guess-hue", seed = 42, phase = Phase.ONE,
                userId = uid, isSuperAdmin = false,
            )
        } returns aResponse(phase = Phase.ONE)

        mockMvc.get("/api/lab/team/guess-hue?seed=42&phase=TWO") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$.phase") { value("TWO") } }
        // No phase in the URL is phase one — every link that predates the selector keeps working.
        mockMvc.get("/api/lab/team/guess-hue?seed=42") { with(principalFor()) }
            .andExpect { status { isOk() }; jsonPath("$.phase") { value("ONE") } }
    }
```

`aResponse(phase)` ist ein Helfer im Test, der eine vollständige `LabRoundResponse` baut. `LabDisabledTest`
prüft weiterhin nur, dass bei `app.game-lab.enabled=false` kein `gamelab`-Bean existiert und der Endpunkt
404 gibt — es braucht keine Änderung, außer wenn es einen der gelöschten Typen nennt.

- [ ] **Step 10: Alles laufen lassen**

Run: `cd core && ./mvnw clean test`
Expected: PASS. `ModularityTests` grün mit der neuen Kante `gamelab → game`.

- [ ] **Step 11: Committen**

```bash
git add -A core/src/main/kotlin/org/unividuell/countdown/core/gamelab core/src/test/kotlin/org/unividuell/countdown/core/gamelab
git commit -m "feat(gamelab): run the lab through the real game classes, with a phase selector"
```

---

## Task 3: Der Test, der die Zusammenlegung rechtfertigt

Nach dieser Task ist belegt, dass eine Lab-Runde in Phase 2 **dieselben Punkte** vergibt wie eine echte — nicht durch geteilten Code allein, sondern durch einen Test, der beide Wege nebeneinander laufen lässt.

**Files:**
- Test: `core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabPointsParityTest.kt`

**Interfaces:**
- Consumes: `LabService.open/guess`, `game.internal.RoundScoring.reevaluate`, `game.internal.RoundGameStore`, `game.internal.RoundPlayRepository`, `game.awardFor`, `game.Phase`, `game.AwardRule`, `community.internal.CommunityService`, `community.internal.CommunityEditionRepository`, `iam.internal.UserRepository`, `TestcontainersConfiguration`.
- Produces: nichts — reiner Test.

- [ ] **Step 1: Den Test schreiben**

Der Test spielt zweimal dieselbe Runde: einmal im Lab (Phase 2, zwei Tester, der zweite Tipp besser),
einmal über die echten Tabellen (`round_games` + `round_plays`, `phase_two_start_round` so gesetzt, dass
die laufende Runde in Phase 2 fällt). Dann vergleicht er, was jeder Spieler bekommt.

```kotlin
package org.unividuell.countdown.core.gamelab

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.unividuell.countdown.core.TestcontainersConfiguration
import org.unividuell.countdown.core.game.AwardRule
import org.unividuell.countdown.core.game.Phase
import org.unividuell.countdown.core.game.awardFor
import org.unividuell.countdown.core.gamelab.internal.LabService
import tools.jackson.databind.ObjectMapper

/**
 * The test that makes the consolidation worth its diff.
 *
 * The lab and the real round now share `awardFor` and `pointsFor`, so this cannot drift **as long as
 * nobody re-implements one of them locally** — and that is exactly the regression worth a test: a
 * future "small fix" in either place has to keep this equal.
 */
@Import(TestcontainersConfiguration::class)
@SpringBootTest
class LabPointsParityTest(
    @Autowired val lab: LabService,
    @Autowired val mapper: ObjectMapper,
    // plus the collaborators the real-round half needs; mirror PlayServiceTest's constructor
) {

    @Test
    fun `a lab round in phase two awards what a real round in phase two awards`() {
        // Phase two, two guesses, the later one closer: the interesting case, because it is the one
        // where points move from somebody to somebody else.
        // 1. the lab half: two testers guess, the second closer to the solution
        // 2. the real half: the same two verdicts on a real round whose phase-two threshold sits on
        //    the current round, so `awardFor` yields the same stake
        // 3. compare: same rule, same stake, same winner, same loser at zero
    }
}
```

Diesen Rahmen füllst du aus, und zwar so, dass die Vergleichsgrößen aus **beiden** Welten gelesen werden:

- **Lab-Hälfte:** `lab.guess(...)` zweimal mit `phase = Phase.TWO`, verschiedene Tipp-Winkel; aus der
  Antwort `me.points` bzw. `others.single().points` lesen. Welcher Tipp näher liegt, ergibt sich aus
  `solution.targetHue` — lies sie nach dem eigenen Tipp aus der Antwort, statt sie zu raten.
- **Echte Hälfte:** eine Community mit Termin 2099 anlegen, `phaseTwoStartRound` auf die aktuelle
  Rundennummer setzen (dann ist die laufende Runde Phase 2), `PlayService.reveal`/`guess` für zwei
  Mitglieder aufrufen und die `points` der beiden `round_plays`-Zeilen lesen. `PlayServiceTest` zeigt
  jede dieser Fixtures — übernimm sie, statt neue zu bauen.
- **Vergleich:** `AwardRule` beider Runden, die Punktzahl des Gewinners und die `0` des Verlierers.
  Prüfe zusätzlich mit `awardFor`, dass beide Einsätze aus derselben Funktion kommen:
  `awardFor(roundNumber = 12, phaseTwoStartRound = 12).points shouldBe 2`.

Der Test darf die Rundennummern **nicht** hart annehmen: die echte Seite rechnet mit der Nummer, die
`CountdownEngine` für „jetzt“ liefert, das Lab mit seiner `LAB_ROUND_NUMBER`. Verglichen wird deshalb der
**Einsatz relativ zur Phasenschwelle** (beide Male die erste Phase-2-Runde ⇒ 2 Punkte), nicht eine
absolute Zahl aus dem Kalender.

- [ ] **Step 2: Test laufen lassen**

Run: `cd core && ./mvnw test -Dtest='LabPointsParityTest'`
Expected: PASS.

Scheitert er, ist das ein **Fund**, nicht ein Testproblem: dann vergibt eine der beiden Seiten anders als
die andere. Melde in diesem Fall, welche Zahl von welcher Seite kam, statt die Erwartung anzupassen.

- [ ] **Step 3: Committen**

```bash
git add core/src/test/kotlin/org/unividuell/countdown/core/gamelab/LabPointsParityTest.kt
git commit -m "test(gamelab): pin that a lab round in phase two pays like a real one"
```

---

## Task 4: Das Attrappen-Spiel fällt auch im Frontend

Nach dieser Task kennt das Lab-Frontend nur noch echte Spiele, und die Seitentests hängen an keinem Spiel mehr.

**Files:**
- Modify: `webapp-vue/src/gamelab/games.ts`
- Modify: `webapp-vue/src/gamelab/types.ts`
- Delete: `webapp-vue/src/gamelab/SampleGame.vue`, `webapp-vue/src/gamelab/__tests__/sample-game.spec.ts`
- Modify: `webapp-vue/src/gamelab/__tests__/lab-page.spec.ts`
- Modify: `webapp-vue/src/gamelab/__tests__/api.spec.ts`
- Modify: `webapp-vue/src/gamelab/GuessHueLabGame.vue` (ein Satz im Datei-KDoc nennt `SampleGame`)

**Interfaces:**
- Consumes: `labGameList`, `labGames` aus `games.ts`.
- Produces: `labGameList` ohne den `sample`-Eintrag; `types.ts` ohne `SamplePayload`/`SampleOutcome`.

- [ ] **Step 1: Registry und Typen bereinigen**

In `games.ts` den Import von `SampleGame` und den Eintrag
`{ id: 'sample', title: 'Zahlenraten (Attrappe)', component: SampleGame },` entfernen. Der KDoc über
`labGameList` sagt „An entry without a matching server-side `LabGame` yields a 404 on open“ — `LabGame`
gibt es nicht mehr, also: „ohne Eintrag im serverseitigen `GameCatalog`“. Halte den Satz auf Englisch,
wie die Datei.

In `types.ts` `SamplePayload` und `SampleOutcome` samt ihrem gemeinsamen KDoc-Satz („The stand-in game's
shapes…“) löschen.

In `GuessHueLabGame.vue` den Satz im Datei-KDoc, der `SampleGame` als Beispiel nennt, auf das umschreiben,
was jetzt gilt — oder streichen, wenn er ohne das Beispiel nichts mehr sagt.

- [ ] **Step 2: Die zwei Sample-Dateien löschen**

```bash
git rm webapp-vue/src/gamelab/SampleGame.vue webapp-vue/src/gamelab/__tests__/sample-game.spec.ts
```

- [ ] **Step 3: Den Seitentest von jedem echten Spiel entkoppeln**

`lab-page.spec.ts` hängt heute am Attrappen-Spiel: `game: 'sample'` in den Route-Params, `'sample'` in
zwölf `toHaveBeenCalledWith`-Erwartungen, und `findComponent(SampleGame)` für die Key-Prüfung. Ersetze das
**nicht** durch `guess-hue` — dann hinge der Seitentest am nächsten echten Spiel und würde mitbrechen,
sobald dessen Komponente sich ändert. Mocke stattdessen die Registry und gib der Seite einen Stub:

```ts
const StubGame = defineComponent({
  name: 'StubGame',
  props: {
    payload: { type: Object, required: true },
    outcome: { type: null, default: null },
    myGuess: { type: null, default: null },
    solution: { type: null, default: null },
    entries: { type: Array, default: () => [] },
    mineUserId: { type: String, default: null },
    disabled: { type: Boolean, default: false },
  },
  emits: ['guess'],
  template: '<button data-test="stub-guess" @click="$emit(\'guess\', { value: 123 })">guess</button>',
})

vi.mock('@/gamelab/games', () => ({
  labGameList: [{ id: 'stub', title: 'Stub', component: StubGame }],
  labGames: { stub: StubGame },
}))
```

Dann in diesem Test überall `'sample'` → `'stub'` und `findComponent(SampleGame)` → `findComponent(StubGame)`.
Der Payload-Fixture-Wert (`{ lowerBound, upperBound }`) darf bleiben, was er ist — der Stub schaut nicht hinein.

**Achtung mit `vi.mock` und `defineComponent`:** `vi.mock` wird an den Dateikopf gehoben, die Fabrik läuft
also vor den Modul-Importen. Definiere `StubGame` deshalb **innerhalb** der Fabrik oder benutze
`vi.hoisted`, sonst ist die Konstante beim Aufruf noch nicht initialisiert. Wenn der Test daran scheitert
(`Cannot access 'StubGame' before initialization`), ist `vi.hoisted` der Weg:

```ts
const { StubGame } = vi.hoisted(() => {
  const { defineComponent } = require('vue')
  return { StubGame: defineComponent({ /* wie oben */ }) }
})
```

In `api.spec.ts` reicht `'sample'` → `'stub'` (die Datei prüft nur URL-Bau, der Name ist beliebig) — oder
lass die Datei unangetastet, wenn du `'sample'` dort als reinen Platzhalter kennzeichnest. Entscheide eins
von beiden und schreib es in den Report; halb geändert ist die schlechteste Variante.

`seed.spec.ts` bleibt **unangetastet**: dort ist `'sample'` ein Eingabewert für den Hash mit einem
festgeschriebenen Erwartungswert (`384_008_871`), kein Verweis auf ein Spiel.

- [ ] **Step 4: Frontend-Suite laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm type-check && pnpm lint`
Expected: PASS, drei Testdateien weniger Bezug auf das Attrappen-Spiel, keine `sample`-Reste außer in
`seed.spec.ts`.

Run: `grep -rn "sample\|Sample" webapp-vue/src/gamelab | grep -v seed.spec`
Expected: keine Treffer.

- [ ] **Step 5: Committen**

```bash
git add -A webapp-vue/src/gamelab
git commit -m "chore(gamelab): drop the stand-in game from the lab frontend"
```

---

## Task 5: Phasen-Wähler, nullable Toleranz, Punkte in der Liste

Nach dieser Task kann man im Lab die Phase umschalten, sieht die geltende Vergaberegel samt Einsatz, sieht die Punkte je Tipp — und die Auflösung funktioniert in Phase 2, wo es keine Toleranz gibt.

**Der Fund, der diese Task nötig macht:** `GuessHueLabGame.vue` verwirft heute die **ganze** Lösung, wenn
`toleranceDeg` keine endliche Zahl ist (`if (typeof toleranceDeg !== 'number' || !Number.isFinite(toleranceDeg)) return null`).
In Phase 2 schickt der Server `toleranceDeg: null` — die Auflösung bliebe also stumm, und der Spieler
sähe nach seinem Tipp weiterhin das Eingaberad. Der Zeichen-Pfad kann es dagegen längst:
`sectorPaths` gibt bei `toleranceDeg <= 0` „kein Fenster, nur die Lösungsspeiche“ zurück, und
`HueWheelReveal` hat für denselben Fall schon einen eigenen Vorlesetext.

**Files:**
- Modify: `webapp-vue/src/gamelab/types.ts`
- Modify: `webapp-vue/src/gamelab/GuessHueLabGame.vue`
- Modify: `webapp-vue/src/gamelab/api.ts`
- Modify: `webapp-vue/src/gamelab/LabControls.vue`
- Modify: `webapp-vue/src/gamelab/LabEntries.vue`
- Modify: `webapp-vue/src/pages/c/[slug]/lab/[game].vue`
- Test: `webapp-vue/src/gamelab/__tests__/guess-hue-lab.spec.ts`, `…/lab-page.spec.ts`, `…/api.spec.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `LabPhase = 'ONE' | 'TWO'`; `LabEntryDto` mit `points: number`; `LabRoundResponse<P>` mit `phase: LabPhase`, `awardRule: 'ALL_QUALIFYING' | 'CLOSEST_ONLY'`, `awardPoints: number`; `GuessHueSolution.toleranceDeg: number | null`
  - `api.ts`: alle vier Funktionen nehmen `phase: LabPhase` und hängen `&phase=…` an
  - `LabControls.vue`: neues Prop `phase: LabPhase`, neues Emit `phaseChange: [phase: LabPhase]`
  - `[game].vue`: die Phase lebt in der URL (`?phase=`), Default `ONE`

- [ ] **Step 1: Die Wire-Typen nachziehen**

In `types.ts`:

```ts
/** Mirrors the server's `Phase`. The lab chooses it; a real round derives it from its round number. */
export type LabPhase = 'ONE' | 'TWO'

/** Mirrors the server's `AwardRule`. */
export type LabAwardRule = 'ALL_QUALIFYING' | 'CLOSEST_ONLY'
```

`LabEntryDto` bekommt `points: number` (der Server schickt immer eine Zahl — 0 heißt „getippt und leer
ausgegangen“). `LabRoundResponse<P>` bekommt `phase: LabPhase`, `awardRule: LabAwardRule` und
`awardPoints: number`. Bei `GuessHueSolution`:

```ts
export interface GuessHueSolution {
  targetHue: number
  /**
   * Half-window in degrees, or `null` in phase two — there is no gate there, only the closest guess
   * scores. The drawing chain models "no window" as `<= 0`, so the adapter maps `null` to `0` at the
   * boundary rather than threading a nullable through three components.
   */
  toleranceDeg: number | null
}
```

- [ ] **Step 2: Den Test für die Phase-2-Auflösung schreiben**

In `guess-hue-lab.spec.ts` — die Datei hat schon einen `it.each`-Block über ungültige Lösungen (u. a.
`['a missing tolerance', { targetHue: 210 }]`), der prüft, dass die Eingabekarte stehen bleibt. `null` ist
jetzt **nicht** ungültig, sondern Phase 2, also kommt ein eigener Test dazu:

```ts
it('reveals in phase two, where there is no tolerance window', async () => {
  const w = mountAdapter({ solution: { targetHue: 210, toleranceDeg: null } })

  // The reveal card must mount: the round is over for this viewer, and a null window is a real
  // answer ("no gate"), not a broken payload.
  expect(w.findComponent(GuessHueReveal).exists()).toBe(true)
  expect(w.findComponent(GuessHueReveal).props('toleranceDeg')).toBe(0)
})
```

Prüf beim Schreiben, wie `mountAdapter` in dieser Datei Props setzt, und ob `GuessHueReveal` dort schon
importiert wird; halte dich an die vorhandene Form. Der bestehende `it.each`-Fall
`['a missing tolerance', { targetHue: 210 }]` bleibt — ein **fehlendes** Feld ist weiter ungültig, nur
`null` ist es nicht mehr.

- [ ] **Step 3: Test laufen lassen — er muss scheitern**

Run: `cd webapp-vue && pnpm test guess-hue-lab`
Expected: FAIL — die Auflösungskarte mountet nicht, weil das `solution`-Computed `null` zurückgibt.

- [ ] **Step 4: Den Adapter für Phase 2 öffnen**

In `GuessHueLabGame.vue` das `solution`-Computed:

```ts
const solution = computed<GuessHueSolution | null>(() => {
  const raw = props.solution
  if (typeof raw !== 'object' || raw === null) return null
  const { targetHue, toleranceDeg } = raw as { targetHue?: unknown; toleranceDeg?: unknown }
  if (typeof targetHue !== 'number' || !Number.isFinite(targetHue)) return null
  // `null` is phase two — no gate, so no arc. A *missing* or non-numeric tolerance is still a broken
  // payload and still disqualifies the whole solution.
  if (toleranceDeg === null) return { targetHue, toleranceDeg: null }
  if (typeof toleranceDeg !== 'number' || !Number.isFinite(toleranceDeg)) return null
  return { targetHue, toleranceDeg }
})
```

und die Weitergabe an `GuessHueReveal` auf den Zeichen-Vertrag abbilden:

```
        :tolerance-deg="solution.toleranceDeg ?? 0"
```

`GuessHueReveal`, `HueWheelReveal`, `HueToleranceSector` und `sectorPaths` bleiben **unangetastet** — sie
behandeln `<= 0` bereits als „kein Fenster“, und ihr `number`-Prop bleibt damit ehrlich.

- [ ] **Step 5: Test laufen lassen**

Run: `cd webapp-vue && pnpm test guess-hue-lab`
Expected: PASS.

- [ ] **Step 6: Die Phase durch API und Seite führen**

In `api.ts` bekommt `labUrl` einen Phasen-Parameter und jede der vier Funktionen ein `phase`-Argument:

```ts
function labUrl(slug: string, game: string, seed: number, phase: LabPhase, sub = ''): string {
  return `/api/lab/${encodeURIComponent(slug)}/${encodeURIComponent(game)}${sub}?seed=${seed}&phase=${phase}`
}
```

In `[game].vue`: die Phase kommt aus der URL, damit ein Reload und ein geteilter Link dieselbe Runde
zeigen — genau die Begründung, aus der schon der Seed dort steht.

```ts
const phase = computed<LabPhase>(() => (route.query.phase === 'TWO' ? 'TWO' : 'ONE'))

function writePhase(next: LabPhase): void {
  router.replace({ query: { ...route.query, phase: next } })
}
```

`run(...)` gibt `phase.value` an die Api-Funktionen weiter, und der `watch`, der bei Seed-Wechsel die Runde
öffnet, bekommt die Phase als zweite Quelle: `watch([seed, phase], …)` mit demselben Rumpf. `LabControls`
wird mit `:phase="phase"` und `@phase-change="writePhase"` verdrahtet.

- [ ] **Step 7: Den Wähler bauen**

In `LabControls.vue` — Prop und Emit ergänzen (`phase: LabPhase`, `phaseChange: [phase: LabPhase]`) und
zwischen Seed-Formular und „Aktualisieren“ eine Zeile mit zwei Schaltern einsetzen. Zwei Buttons statt
eines `<select>`, weil es genau zwei Zustände gibt und beide mit dem Daumen erreichbar sein sollen; die
Höhe folgt den bestehenden Aktionen (`h-11` ist im Datei-Stil vorhanden — halte dich an die dortigen
Klassenkonstanten `ROW`/`ACTION` statt neue Klassen zu erfinden).

```vue
      <div data-test="lab-phase" class="flex gap-2">
        <button
          v-for="option in (['ONE', 'TWO'] as const)"
          :key="option"
          type="button"
          :data-test="`lab-phase-${option}`"
          :aria-pressed="props.phase === option"
          :disabled="props.busy"
          class="..."
          @click="emit('phaseChange', option)"
        >
          {{ option === 'ONE' ? 'Phase 1' : 'Phase 2' }}
        </button>
      </div>
```

Dazu ein Test in `lab-page.spec.ts`, der die Verdrahtung festnagelt — nicht das Aussehen:

```ts
it('writes the phase to the url and reopens the round', async () => {
  const w = mountPage()
  await flush()

  await tool('lab-phase-TWO').trigger('click')

  expect(replace).toHaveBeenCalledWith({ query: { seed: '42', phase: 'TWO' } })
})
```

Halte dich an die Helfer, die diese Datei schon hat (`mountPage`, `tool`, die Router-Mocks) — erfinde
keine neuen.

- [ ] **Step 8: Punkte und Regel anzeigen**

`LabEntries.vue` rendert je Eintrag zusätzlich die Punkte — die Zahl ist der Grund, warum man in Phase 2
zusieht. Setze sie neben die vorhandene `guess → outcome`-Zeile, im Stil der Datei:

```vue
        <span data-test="lab-entry-points" class="text-xs font-semibold tabular-nums">
          {{ entry.points }}
        </span>
```

Und die geltende Regel gehört sichtbar dorthin, wo man die Phase umschaltet: in `LabControls.vue` unter
den Phasen-Schaltern eine Zeile, die aus zwei neuen, optionalen Props (`awardRule`, `awardPoints`) liest —
oder, wenn dir das lieber ist, in `[game].vue` neben der Überschrift. Entscheide **einmal**, schreib die
Begründung in einen Satz KDoc, und mach es nicht an beiden Orten.

Erwarteter Text, damit „Regel“ nicht als Fachbegriff dasteht: `Phase 1 · jeder Treffer 1 Punkt` bzw.
`Phase 2 · nur der Beste, 2 Punkte`. Deutsche Anzeigetexte, `„…“` wenn du zitierst.

- [ ] **Step 9: Alles laufen lassen**

Run: `cd webapp-vue && pnpm test && pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 10: Committen**

```bash
git add -A webapp-vue/src
git commit -m "feat(gamelab): add the phase selector and show what each guess scored"
```

---

## Task 6: Guideline und Spec nachziehen

Nach dieser Task beschreibt `game-lab.md` das Lab, das es gibt — und die Spec hält fest, dass ihr Umsetzungsschnitt abgearbeitet ist.

**Files:**
- Modify: `.claude/guidelines/game-lab.md`
- Modify: `.claude/guidelines/game-rounds.md`
- Modify: `docs/superpowers/specs/2026-08-11-round-game-selection-design.md`
- Modify: `CLAUDE.md`, `.claude/guidelines/README.md` (nur falls ein Index-Eintrag `LabGame` nennt)

- [ ] **Step 1: `game-lab.md` auf den Ist-Stand ziehen**

Vier Stellen sind jetzt falsch, jede mit einer eigenen Korrektur — lies die Datei ganz, bevor du schreibst:

1. **„The direction rule“** nennt `LabGame` als die Schnittstelle, die sich ändert. Sie hat sich geändert:
   der Vertrag heißt `GameType`, liegt in `game` und wird vom Lab **benutzt**, nicht implementiert. Der
   Absatz behält seine Aussage („das Lab passt sich an, nie das Spiel“) und tauscht sein Beispiel: die
   Anpassung war der Umbau des Labs auf die echten Klassen, nicht eine neue Lab-Schnittstelle.
2. **Payload-Hygiene** verweist auf `LabGame.reveal(seed)` und `SampleLabGameTest` als Vorlage. Beides gibt
   es nicht mehr: der Feldmengen-Test hängt an `GameType.present(params)` und die Vorlage ist
   `GuessHueGameTypeTest`. Das Code-Beispiel entsprechend ersetzen.
3. **Der ganze Absatz über `revealsOthersBeforeGuess`** entfällt und wird durch die Invariante ersetzt:
   die Tipps der anderen kommen erst nach dem eigenen, unbedingt und serverseitig — und ein Schalter,
   dessen richtige Antwort für alle Fälle gleich ist, verlagert eine Invariante in einen Review-Punkt.
   Ein Satz dazu, warum der Schalter überhaupt existierte, ist gut; ein Aufsatz nicht.
4. **„A second way out of the server“** stimmt weiter, nennt aber `LabGame.solution(seed)`; das ist
   `GameType.solution(params)`. Ergänze den Hinweis, der beim Umbau des echten Spiels dazugekommen ist:
   ein Spiel, das seine Lösung zurückhält, muss auch ein `outcome` zurückhalten, aus dem sie
   rekonstruierbar ist — denn `others[].outcome` geht raus, sobald der Betrachter getippt hat.

Neu dazu, weil es die Guideline vorher nicht wissen konnte: **eine Lab-Runde wird gewählt, nicht
materialisiert** — Spieltyp + Seed + Phase sind ihr Schlüssel, sie friert `params` und `award` genauso ein
wie eine echte, und der Phasen-Wähler ist der Grund, warum das Lab durch die echten Klassen läuft.

- [ ] **Step 2: `game-rounds.md` um den Lab-Satz ergänzen**

Ein Absatz, dort wo die Datei über die zwei Ausgänge oder über die Vergabe spricht: das Lab läuft durch
dieselben Klassen und dieselbe Vergabe; wer `awardFor` oder `pointsFor` anfasst, ändert beides, und
`LabPointsParityTest` hält das fest.

- [ ] **Step 3: Die Spec schließen**

Im Abschnitt *Umsetzungsschnitt* bei Punkt 4 in einem Satz festhalten, dass er umgesetzt ist und wie der
Vertrag dabei ins Basis-Package gezogen ist — deutsch, im Ton des Abschnitts, keine neue Überschrift. Im
Abschnitt *Das Lab zieht mit* die zwei Stellen anpassen, die die Umsetzung anders beschreiben als sie
geworden ist (falls es welche gibt): die Phase kommt aus der URL, und der Einsatz aus `awardFor` über eine
synthetische Rundennummer.

- [ ] **Step 4: Prüfen, dass keine Leiche zitiert wird**

Run: `grep -rn "LabGame\|SampleLabGame\|revealsOthersBeforeGuess\|LabPayload\|LabSolution\|LabOutcome" .claude/ CLAUDE.md core/src webapp-vue/src`
Expected: keine Treffer außer in `docs/superpowers/` (dort sind es datierte Design-Dokumente, die ihren
Stand von damals beschreiben — die bleiben, wie sie sind).

- [ ] **Step 5: Committen**

```bash
git add .claude CLAUDE.md docs/superpowers/specs
git commit -m "docs: the lab runs through the game now, and the guideline says so"
```

---

## Self-Review

**Spec-Deckung** (Abschnitt *Das Lab zieht mit* und *Umsetzungsschnitt* Punkt 4 gegen Tasks):

| Spec | Task |
|---|---|
| `gamelab` hängt an `game`, benutzt `GameCatalog`/`GameType`/`GamePayload`/`GameSolution` | 1, 2 |
| `LabGame`, `GuessHueLabGame`, `SampleLabGame`, `LabPayload`/`LabOutcome`/`LabSolution` fallen weg | 2 |
| Lab-Runde wird gewählt: Spieltyp + Seed + Phase; `params` und `award` eingefroren, aus `fromSeed(seed)` | 1 (Fabrik), 2 |
| Danach identisch: `present`, `judge`, Vergaberegel samt Neuauswertung, `solution` nach dem eigenen Tipp | 2 |
| Phasen-Wähler | 2 (Backend), 5 (Bedienelement) |
| Der Store behält seine Form; anderer Seed **oder** andere Phase verdrängt | 2 |
| Sichtbarkeits-Schalter entfällt, samt Zweig, Test und Guideline-Absatz | 2, 6 |
| Zwei-Tor-Werkzeug bleibt (404 statt 403) | 2 (`LabDisabledTest` unverändert grün) |
| „eine Lab-Runde in Phase 2 vergibt dieselben Punkte wie eine echte“ | 3 |
| `game-lab.md` korrigieren | 6 |

**Was diese Scheibe zusätzlich anfasst, weil die Spec es nicht wusste:** das Lab hat ein Frontend
(`webapp-vue/src/gamelab/` plus zwei Seiten, sechs Testdateien). Der Umsetzungsschnitt der Spec ist
backend-formuliert; ein Lab-Backend ohne sein Frontend wäre aber ein Werkzeug, das nicht funktioniert —
`toleranceDeg: null` hätte die Auflösung in Phase 2 stumm gelassen, und das Attrappen-Spiel hätte im
Frontend weitergelebt und beim Öffnen 404 geliefert. Deshalb Tasks 4 und 5, und deshalb ist diese Scheibe
full-stack.

**Typkonsistenz:**

- `LabRound(seed, phase, params, award)` — angelegt in Task 2, gelesen im Service und im Snapshot.
- `LabEntry(userId, guess, qualifies, deviation, outcome, points, at)` — `points` nicht nullable, weil ein
  Lab-Eintrag nur nach einem Tipp existiert.
- `Verdict(id, …)` — in Task 1 von `playId` umbenannt; benutzt von `RoundScoring` (Play-Id) und vom
  Lab-Store (User-Id).
- `GameRandom.fromSeed(seed)` — Task 1, benutzt in Task 2.
- Wire-Namen: Server `phase`/`awardRule`/`awardPoints`/`points` ⇄ Frontend `LabPhase`/`LabAwardRule` und
  `LabEntryDto.points` (Task 5). Der Enum-Name reist als String, deshalb sind die TS-Literale exakt
  `'ONE' | 'TWO'` und `'ALL_QUALIFYING' | 'CLOSEST_ONLY'`.

**Drei Stellen, an denen der Plan bewusst eine Entscheidung offen lässt** — jede mit Entscheidungsregel:

1. Task 4 Step 3: `vi.mock` und die Stub-Komponente können an der Hoisting-Reihenfolge scheitern; dann
   `vi.hoisted`. Beide Wege stehen da.
2. Task 4 Step 3: `api.spec.ts` — `'sample'` umbenennen **oder** als Platzhalter kennzeichnen, nicht halb.
3. Task 5 Step 8: die Regel-Anzeige gehört in die Steuerleiste **oder** neben die Überschrift, nicht in
   beide.

**Was bewusst nicht in dieser Scheibe ist:** das Frontend der **echten** Runde. Es gibt keins, und diese
Scheibe baut keins — `webapp-vue/src/gamelab/` bleibt der einzige Ort, an dem ein Spiel gespielt wird,
bis das Frontend der Runde eine eigene Scheibe bekommt.
